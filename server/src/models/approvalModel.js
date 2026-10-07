'use strict';

const { pool } = require('../config/db');
const { APPROVAL_MODULES } = require('../config/approvalModules');

// ===========================================================================
// Interface 3 — the original generic approval_requests queue.
// Unchanged: the central approvals layer (Interface 12) reads through the
// unified queries further down, but `general` decisions still land here.
// ===========================================================================

const SELECT = `
  SELECT a.*, p.name AS project_name, p.code AS project_code, s.name AS site_name
  FROM approval_requests a
  LEFT JOIN projects p ON p.id = a.project_id
  LEFT JOIN sites s ON s.id = a.site_id
`;

async function findAll({ status = 'pending', projectId } = {}) {
  const where = [];
  const params = [];
  if (status && status !== 'all') {
    where.push('a.status = ?');
    params.push(status);
  }
  if (projectId) {
    where.push('a.project_id = ?');
    params.push(projectId);
  }
  const [rows] = await pool.query(
    `${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY FIELD(a.status,'pending','approved','rejected'), a.requested_on DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(`${SELECT} WHERE a.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function create(payload) {
  const columns = ['project_id', 'site_id', 'request_type', 'title', 'requested_by', 'amount', 'details', 'requested_on']
    .filter((k) => payload[k] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO approval_requests (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((k) => payload[k])
  );
  return result.insertId;
}

async function decide(id, { status, decidedBy, note }) {
  const [result] = await pool.query(
    `UPDATE approval_requests
     SET status = ?, decided_on = NOW(), decided_by = ?, decision_note = ?
     WHERE id = ? AND status = 'pending'`,
    [status, decidedBy ?? null, note ?? null, id]
  );
  return result.affectedRows > 0;
}

// ===========================================================================
// Interface 12 — the unified approval queue.
//
// One SELECT per source module, UNION ALL'd into a single result set so
// sorting, filtering, pagination and counting all happen once in the database
// rather than by stitching four paginated lists together in JavaScript.
//
// Every branch projects the same columns in the same order. NULLs are
// explicitly CAST so the union's column types are decided here and not by
// whichever branch happens to come first.
// ===========================================================================

const NULL_TEXT = 'CAST(NULL AS CHAR)';
const NULL_INT = 'CAST(NULL AS UNSIGNED)';
const NULL_MONEY = 'CAST(NULL AS DECIMAL(13,2))';
const NULL_TIME = 'CAST(NULL AS DATETIME)';

/**
 * Restricts a branch to the caller's project scope. `authorize.js` treats "no
 * explicit grants" as unrestricted, so `projectIds` arrives empty for most
 * users and no clause is added at all. Rows with no project (a general
 * request raised against no particular project) stay visible, because they
 * are not another project's data being leaked.
 */
function projectScopeClause(alias, projectIds) {
  if (!projectIds || projectIds.length === 0) return null;
  return {
    sql: `(${alias}.project_id IS NULL OR ${alias}.project_id IN (${projectIds.map(() => '?').join(', ')}))`,
    params: [...projectIds],
  };
}

/**
 * Builds the SELECT for one module, already narrowed to what this caller may
 * see. `scope.visibility` is resolved from the caller's role by
 * approvalModules.visibilityFor — never from a query parameter — and 'own'
 * is pinned to `scope.userId` / `scope.contractorId`, which come from the
 * verified token and the database, so a caller cannot widen it.
 */
function buildSourceSelect(moduleKey, scope) {
  const where = [];
  const params = [];
  const push = (sql, values = []) => {
    if (!sql) return;
    where.push(sql);
    params.push(...values);
  };
  const scopeClause = (alias) => {
    const clause = projectScopeClause(alias, scope.projectIds);
    if (clause) push(clause.sql, clause.params);
  };

  let sql;

  if (moduleKey === 'general') {
    sql = `
      SELECT 'general' AS module, a.id AS source_id,
             CONCAT('AR-', LPAD(a.id, 4, '0')) AS reference,
             a.title AS title,
             a.request_type AS request_type,
             a.project_id AS project_id, p.name AS project_name,
             a.site_id AS site_id, s.name AS site_name,
             a.requested_by AS requested_by_name,
             ${NULL_INT} AS requested_by_user_id,
             ${NULL_INT} AS contractor_id,
             CAST(a.requested_on AS DATETIME) AS requested_on,
             ${NULL_TEXT} AS priority,
             a.amount AS amount,
             a.status AS source_status,
             CASE a.status
               WHEN 'pending'  THEN 'pending'
               WHEN 'approved' THEN 'approved'
               WHEN 'rejected' THEN 'rejected'
               ELSE 'other'
             END AS normalized_status,
             ${NULL_TEXT} AS extra_ref,
             a.details AS details,
             a.decided_on AS decided_on
      FROM approval_requests a
      LEFT JOIN projects p ON p.id = a.project_id
      LEFT JOIN sites s ON s.id = a.site_id`;
    // 'own' never reaches here: approval_requests.requested_by is a name, not
    // a user id, so `general` is declared not ownable in the registry.
    if (scope.visibility === 'own') push('1 = 0');
    scopeClause('a');
  } else if (moduleKey === 'hr_labour') {
    sql = `
      SELECT 'hr_labour' AS module, lr.id AS source_id,
             lr.request_number AS reference,
             CONCAT(lr.quantity, ' x ', lr.skill_category) AS title,
             'labour-request' AS request_type,
             lr.project_id AS project_id, p.name AS project_name,
             lr.site_id AS site_id, s.name AS site_name,
             COALESCE(u.full_name, c.name) AS requested_by_name,
             lr.requested_by AS requested_by_user_id,
             lr.contractor_id AS contractor_id,
             CAST(lr.created_at AS DATETIME) AS requested_on,
             lr.priority AS priority,
             ${NULL_MONEY} AS amount,
             lr.status AS source_status,
             CASE
               WHEN lr.status IN ('SUBMITTED', 'UNDER_REVIEW') THEN 'pending'
               WHEN lr.status IN ('APPROVED', 'PARTIALLY_ASSIGNED', 'FULLY_ASSIGNED', 'COMPLETED') THEN 'approved'
               WHEN lr.status = 'REJECTED' THEN 'rejected'
               ELSE 'other'
             END AS normalized_status,
             c.name AS extra_ref,
             lr.reason AS details,
             lr.reviewed_at AS decided_on
      FROM labour_requests lr
      LEFT JOIN projects p ON p.id = lr.project_id
      LEFT JOIN sites s ON s.id = lr.site_id
      LEFT JOIN contractors c ON c.id = lr.contractor_id
      LEFT JOIN users u ON u.id = lr.requested_by`;
    // A DRAFT request has not been submitted to anyone — it is not an
    // approval item and must never appear in the queue, not even under "all".
    push("lr.status <> 'DRAFT'");
    if (scope.visibility === 'own') {
      // A contractor owns a request through their linked contractor record;
      // anyone else owns it by having raised it.
      if (scope.contractorId) push('lr.contractor_id = ?', [scope.contractorId]);
      else push('lr.requested_by = ?', [scope.userId]);
    }
    scopeClause('lr');
  } else if (moduleKey === 'procurement') {
    sql = `
      SELECT 'procurement' AS module, pr.id AS source_id,
             pr.request_number AS reference,
             CONCAT(IF(pr.is_excess = 1, '[Excess Material] ', ''), m.name, ' - ', TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM pr.quantity)), ' ',
                    COALESCE(NULLIF(pr.unit, ''), m.unit)) AS title,
             IF(pr.is_excess = 1, 'excess-procurement', 'purchase-request') AS request_type,
             pr.project_id AS project_id, p.name AS project_name,
             pr.site_id AS site_id, s.name AS site_name,
             u.full_name AS requested_by_name,
             pr.requested_by AS requested_by_user_id,
             ${NULL_INT} AS contractor_id,
             CAST(pr.created_at AS DATETIME) AS requested_on,
             pr.priority AS priority,
             (pr.quantity * pr.estimated_rate) AS amount,
             pr.status AS source_status,
             CASE
               WHEN pr.status = 'pending_approval' THEN 'pending'
               WHEN pr.status IN ('approved', 'source_confirmed', 'ordered', 'partially_received', 'received') THEN 'approved'
               WHEN pr.status = 'rejected' THEN 'rejected'
               ELSE 'other'
             END AS normalized_status,
             COALESCE(pt.name, pr.po_number) AS extra_ref,
             COALESCE(
               CONCAT(IF(pr.is_excess = 1, CONCAT('Reason for Excess: ', COALESCE(pr.excess_reason, 'None specified'), ' | Excess Qty: ', pr.excess_quantity, ' | '), ''), COALESCE(pr.notes, '')),
               pr.notes
             ) AS details,
             ${NULL_TIME} AS decided_on
      FROM procurement_requests pr
      LEFT JOIN projects p ON p.id = pr.project_id
      LEFT JOIN sites s ON s.id = pr.site_id
      LEFT JOIN project_tasks pt ON pt.id = pr.task_id
      LEFT JOIN materials m ON m.id = pr.material_id
      LEFT JOIN users u ON u.id = pr.requested_by`;
    // Same reasoning as DRAFT above: nothing has been asked of an approver yet.
    push("pr.status <> 'draft'");
    if (scope.visibility === 'own') push('pr.requested_by = ?', [scope.userId]);
    scopeClause('pr');
  } else if (moduleKey === 'finance') {
    sql = `
      SELECT 'finance' AS module, e.id AS source_id,
             COALESCE(e.expense_number, CONCAT('EXP-', LPAD(e.id, 4, '0'))) AS reference,
             e.description AS title,
             CONCAT('expense-', e.category) AS request_type,
             e.project_id AS project_id, p.name AS project_name,
             e.site_id AS site_id, s.name AS site_name,
             COALESCE(u.full_name, c.name, e.party_name, e.paid_by) AS requested_by_name,
             e.created_by AS requested_by_user_id,
             e.contractor_id AS contractor_id,
             CAST(e.created_at AS DATETIME) AS requested_on,
             ${NULL_TEXT} AS priority,
             e.amount AS amount,
             e.status AS source_status,
             CASE
               WHEN e.status = 'pending' THEN 'pending'
               WHEN e.status IN ('approved', 'paid') THEN 'approved'
               WHEN e.status = 'rejected' THEN 'rejected'
               ELSE 'other'
             END AS normalized_status,
             e.reference AS extra_ref,
             e.notes AS details,
             ${NULL_TIME} AS decided_on
      FROM expenses e
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN sites s ON s.id = e.site_id
      LEFT JOIN contractors c ON c.id = e.contractor_id
      LEFT JOIN users u ON u.id = e.created_by`;
    if (scope.visibility === 'own') {
      if (scope.contractorId) push('(e.contractor_id = ? OR e.created_by = ?)', [scope.contractorId, scope.userId]);
      else push('e.created_by = ?', [scope.userId]);
    }
    scopeClause('e');
  } else {
    return null;
  }

  return {
    sql: `${sql}${where.length ? `\n      WHERE ${where.join(' AND ')}` : ''}`,
    params,
  };
}

/**
 * UNION ALL of every module the caller may see. Returns null when the caller
 * may see nothing at all, so callers can short-circuit to an empty result
 * instead of running a query with no branches (which is a syntax error).
 */
function buildUnion(scopes) {
  const branches = scopes
    .map((scope) => buildSourceSelect(scope.key, scope))
    .filter(Boolean);

  if (branches.length === 0) return null;

  return {
    sql: branches.map((b) => b.sql).join('\n      UNION ALL\n'),
    params: branches.flatMap((b) => b.params),
  };
}

/** Filters applied to the union as a whole, after per-module scoping. */
function buildQueueFilters(filters = {}) {
  const where = [];
  const params = [];

  if (filters.status && filters.status !== 'all') {
    where.push('q.normalized_status = ?');
    params.push(filters.status);
  } else if (filters.includeOther !== true) {
    // "All" still means "everything that was ever put to an approver" —
    // cancelled/withdrawn items are reachable, but only when asked for.
    where.push("q.normalized_status <> 'other'");
  }

  if (filters.module && filters.module !== 'all') {
    where.push('q.module = ?');
    params.push(filters.module);
  }

  if (filters.modules && filters.modules.length > 0) {
    where.push(`q.module IN (${filters.modules.map(() => '?').join(', ')})`);
    params.push(...filters.modules);
  }

  if (filters.projectId) {
    where.push('q.project_id = ?');
    params.push(Number(filters.projectId));
  }

  if (filters.siteId) {
    where.push('q.site_id = ?');
    params.push(Number(filters.siteId));
  }

  if (filters.priority && filters.priority !== 'all') {
    where.push('q.priority = ?');
    params.push(filters.priority);
  }

  if (filters.dateFrom) {
    where.push('q.requested_on >= ?');
    params.push(`${filters.dateFrom} 00:00:00`);
  }

  if (filters.dateTo) {
    where.push('q.requested_on <= ?');
    params.push(`${filters.dateTo} 23:59:59`);
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    where.push(`(q.reference LIKE ? OR q.title LIKE ? OR q.requested_by_name LIKE ?
                 OR q.project_name LIKE ? OR q.site_name LIKE ?)`);
    params.push(term, term, term, term, term);
  }

  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/**
 * One page of the unified queue.
 * Pending items sort first — an approvals screen exists to clear a queue, so
 * what still needs a decision belongs at the top regardless of age.
 */
async function findQueue(scopes, filters = {}, { page = 1, pageSize = 10 } = {}) {
  const union = buildUnion(scopes);
  if (!union) return { rows: [], total: 0 };

  const conditions = buildQueueFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT q.* FROM (${union.sql}) q
     ${conditions.sql}
     ORDER BY FIELD(q.normalized_status, 'pending', 'approved', 'rejected', 'other'),
              q.requested_on DESC, q.module ASC, q.source_id DESC
     LIMIT ? OFFSET ?`,
    [...union.params, ...conditions.params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM (${union.sql}) q ${conditions.sql}`,
    [...union.params, ...conditions.params]
  );

  return { rows, total: Number(total) };
}

/** Per-normalised-status counts across everything the caller may see. */
async function countByStatus(scopes, filters = {}) {
  const union = buildUnion(scopes);
  if (!union) return {};

  const conditions = buildQueueFilters({ ...filters, status: 'all', includeOther: true });

  const [rows] = await pool.query(
    `SELECT q.normalized_status AS status, COUNT(*) AS total
     FROM (${union.sql}) q ${conditions.sql}
     GROUP BY q.normalized_status`,
    [...union.params, ...conditions.params]
  );

  return rows.reduce((acc, row) => ({ ...acc, [row.status]: Number(row.total) }), {});
}

/** Pending count restricted to the modules this caller may actually decide. */
async function countMyPending(scopes, decidableModuleKeys) {
  if (!decidableModuleKeys || decidableModuleKeys.length === 0) return 0;
  const union = buildUnion(scopes);
  if (!union) return 0;

  const conditions = buildQueueFilters({ status: 'pending', modules: decidableModuleKeys });

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM (${union.sql}) q ${conditions.sql}`,
    [...union.params, ...conditions.params]
  );
  return Number(total);
}

/** Pending count broken down by module, for the dashboard strip. */
async function countPendingByModule(scopes) {
  const union = buildUnion(scopes);
  if (!union) return {};

  const conditions = buildQueueFilters({ status: 'pending' });

  const [rows] = await pool.query(
    `SELECT q.module AS module, COUNT(*) AS total
     FROM (${union.sql}) q ${conditions.sql}
     GROUP BY q.module`,
    [...union.params, ...conditions.params]
  );

  return rows.reduce((acc, row) => ({ ...acc, [row.module]: Number(row.total) }), {});
}

/**
 * A single queue row, re-read through exactly the same scoped SELECT the list
 * uses. This is what stops id-tampering on the detail and decision endpoints:
 * if the caller may not see the record, the query returns nothing and the
 * service 404s, rather than the record being fetched and then checked.
 */
async function findQueueItem(scope, sourceId) {
  const branch = buildSourceSelect(scope.key, scope);
  if (!branch) return null;

  const [rows] = await pool.query(
    `SELECT q.* FROM (${branch.sql}) q WHERE q.source_id = ? LIMIT 1`,
    [...branch.params, Number(sourceId)]
  );
  return rows[0] || null;
}

// ------------------------------------------------------------------ history

/**
 * Appends one row to the audit trail. There is deliberately no update and no
 * delete anywhere in this module — the brief requires approval history to be
 * preserved, so the only operation the codebase can perform on it is INSERT.
 */
async function addHistory(entry) {
  const [result] = await pool.query(
    `INSERT INTO approval_history
       (module, reference_id, reference, action, previous_status, new_status,
        comment, actor_user_id, actor_name, actor_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.module,
      entry.referenceId,
      entry.reference ?? null,
      entry.action,
      entry.previousStatus ?? null,
      entry.newStatus ?? null,
      entry.comment ?? null,
      entry.actorUserId ?? null,
      entry.actorName ?? null,
      entry.actorRole ?? null,
    ]
  );
  return result.insertId;
}

async function findHistory(moduleKey, referenceId) {
  const [rows] = await pool.query(
    `SELECT h.*, u.full_name AS current_actor_name
     FROM approval_history h
     LEFT JOIN users u ON u.id = h.actor_user_id
     WHERE h.module = ? AND h.reference_id = ?
     ORDER BY h.id ASC`,
    [moduleKey, Number(referenceId)]
  );
  return rows;
}

/**
 * Decisions recorded today, counted once per record even if a record somehow
 * has more than one history row for the same action.
 *
 * Counting from the audit trail rather than from the source tables is
 * deliberate: `procurement_requests` and `expenses` have no "decided on"
 * column at all, and `updated_at` moves on any edit, so it cannot answer
 * "was this approved today". The trade-off is that a decision taken directly
 * inside a source module's own screen — bypassing this interface — is not
 * counted here.
 */
async function countDecisionsToday(moduleKeys) {
  if (!moduleKeys || moduleKeys.length === 0) return { approved: 0, rejected: 0 };

  const [rows] = await pool.query(
    `SELECT action, COUNT(DISTINCT module, reference_id) AS total
     FROM approval_history
     WHERE action IN ('APPROVED', 'REJECTED')
       AND DATE(created_at) = CURDATE()
       AND module IN (${moduleKeys.map(() => '?').join(', ')})
     GROUP BY action`,
    moduleKeys
  );

  const counts = rows.reduce((acc, row) => ({ ...acc, [row.action]: Number(row.total) }), {});
  return { approved: counts.APPROVED || 0, rejected: counts.REJECTED || 0 };
}

/** Projects that actually appear in the caller's queue, for the filter dropdown. */
async function findQueueProjects(scopes) {
  const union = buildUnion(scopes);
  if (!union) return [];

  const [rows] = await pool.query(
    `SELECT DISTINCT q.project_id AS id, q.project_name AS name
     FROM (${union.sql}) q
     WHERE q.project_id IS NOT NULL
     ORDER BY q.project_name ASC`,
    union.params
  );
  return rows;
}

/** Sites that actually appear in the caller's queue, for the filter dropdown. */
async function findQueueSites(scopes) {
  const union = buildUnion(scopes);
  if (!union) return [];

  const [rows] = await pool.query(
    `SELECT DISTINCT q.site_id AS id, q.site_name AS name, q.project_id AS projectId
     FROM (${union.sql}) q
     WHERE q.site_id IS NOT NULL
     ORDER BY q.site_name ASC`,
    union.params
  );
  return rows;
}

module.exports = {
  // Interface 3
  findAll,
  findById,
  create,
  decide,
  // Interface 12
  APPROVAL_MODULES,
  findQueue,
  findQueueItem,
  countByStatus,
  countMyPending,
  countPendingByModule,
  countDecisionsToday,
  findQueueProjects,
  findQueueSites,
  addHistory,
  findHistory,
};
