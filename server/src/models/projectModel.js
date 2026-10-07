'use strict';

const { pool } = require('../config/db');

/**
 * Read/write access for projects and everything hanging off them.
 * All values are bound as placeholders; nothing is interpolated into SQL.
 */

const LIST_SELECT = `
  SELECT
    p.id, p.code, p.name, p.project_type, p.location, p.description,
    p.start_date, p.expected_completion, p.estimated_budget,
    p.status, p.progress, p.current_phase,
    c.id  AS client_id,     c.name AS client_name,
    pm.id AS project_manager_id, pm.full_name AS project_manager_name,
    ar.id AS architect_id,       ar.full_name AS architect_name,
    se.id AS site_engineer_id,   se.full_name AS site_engineer_name,
    ct.id AS contractor_id,      ct.name AS contractor_name,
    COALESCE(spent.total, 0) AS spent_amount,
    COALESCE(site_count.total, 0) AS site_count
  FROM projects p
  LEFT JOIN clients     c  ON c.id  = p.client_id
  LEFT JOIN employees   pm ON pm.id = p.project_manager_id
  LEFT JOIN employees   ar ON ar.id = p.architect_id
  LEFT JOIN employees   se ON se.id = p.site_engineer_id
  LEFT JOIN contractors ct ON ct.id = p.contractor_id
  LEFT JOIN (SELECT project_id, SUM(amount) AS total FROM expenses GROUP BY project_id) spent
         ON spent.project_id = p.id
  LEFT JOIN (SELECT project_id, COUNT(*) AS total FROM sites GROUP BY project_id) site_count
         ON site_count.project_id = p.id
`;

/** Paginated, filterable project list. */
async function findAll({ search, status, contractorId, clientId, page = 1, pageSize = 10 }) {
  // Automatically evaluate and mark delayed projects server-side
  await pool.query(
    "UPDATE projects SET status = 'delayed' WHERE expected_completion < CURDATE() AND status NOT IN ('completed', 'delayed', 'on-hold') AND is_archived = 0"
  );

  const where = ['p.is_archived = 0'];
  const params = [];

  if (search) {
    where.push('(p.name LIKE ? OR p.code LIKE ? OR p.location LIKE ? OR c.name LIKE ? OR ct.name LIKE ?)');
    params.push(...Array(5).fill(`%${search}%`));
  }
  if (status === 'active') {
    where.push("p.status <> 'completed'");
  } else if (status && status !== 'all') {
    where.push('p.status = ?');
    params.push(status);
  }
  if (contractorId && contractorId !== 'all') {
    where.push('(p.contractor_id = ? OR p.id IN (SELECT project_id FROM sites WHERE contractor_id = ?))');
    params.push(Number(contractorId), Number(contractorId));
  }
  if (clientId && clientId !== 'all') {
    where.push('p.client_id = ?');
    params.push(clientId);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${LIST_SELECT} ${whereSql} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM projects p
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN contractors ct ON ct.id = p.contractor_id
     ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  // Automatically evaluate and mark delayed status server-side
  await pool.query(
    "UPDATE projects SET status = 'delayed' WHERE id = ? AND expected_completion < CURDATE() AND status NOT IN ('completed', 'delayed', 'on-hold') AND is_archived = 0",
    [id]
  );
  const [rows] = await pool.query(`${LIST_SELECT} WHERE p.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByCode(code) {
  const [rows] = await pool.query('SELECT id FROM projects WHERE code = ? LIMIT 1', [code]);
  return rows[0] || null;
}

async function nextCode() {
  const [rows] = await pool.query(
    "SELECT code FROM projects WHERE code LIKE 'PRJ-%' ORDER BY id DESC LIMIT 1"
  );
  if (!rows.length) return 'PRJ-1001';
  const match = rows[0].code.match(/PRJ-(\d+)/);
  const num = match ? parseInt(match[1], 10) + 1 : 1001;
  return `PRJ-${String(num).padStart(4, '0')}`;
}

const WRITABLE = [
  'code', 'name', 'client_id', 'project_type', 'description', 'location',
  'start_date', 'expected_completion', 'estimated_budget', 'project_manager_id',
  'architect_id', 'site_engineer_id', 'contractor_id', 'status', 'current_phase',
];

async function create(payload) {
  if (!payload.code) {
    payload.code = await nextCode();
  }
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO projects (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

async function update(id, payload) {
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE projects SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

/** Soft delete: history stays queryable for finance and reporting. */
async function archive(id) {
  const [result] = await pool.query('UPDATE projects SET is_archived = 1 WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function updateTeam(id, { project_manager_id, architect_id, site_engineer_id, contractor_id }) {
  await pool.query(
    `UPDATE projects
     SET project_manager_id = ?, architect_id = ?, site_engineer_id = ?, contractor_id = ?
     WHERE id = ?`,
    [project_manager_id ?? null, architect_id ?? null, site_engineer_id ?? null, contractor_id ?? null, id]
  );
}

/** Recomputes progress from weighted task completion. */
async function recalculateProgress(projectId) {
  const [[row]] = await pool.query(
    `SELECT
       COALESCE(SUM(weight), 0) AS total_weight,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN weight ELSE 0 END), 0) AS done_weight
     FROM project_tasks WHERE project_id = ?`,
    [projectId]
  );
  if (!Number(row.total_weight)) return null;
  const progress = Math.round((row.done_weight / row.total_weight) * 100);
  await pool.query('UPDATE projects SET progress = ? WHERE id = ?', [progress, projectId]);
  return progress;
}

// ------------------------------------------------------------ documents
async function addDocument({ project_id, site_id, name, document_type, file_path, file_name, file_type, file_size, uploaded_on }) {
  const [result] = await pool.query(
    `INSERT INTO project_documents (project_id, site_id, name, document_type, file_path, file_name, file_type, file_size, uploaded_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project_id,
      site_id || null,
      name,
      document_type || 'General',
      file_path,
      file_name,
      file_type,
      file_size,
      uploaded_on || new Date().toISOString().slice(0, 10),
    ]
  );
  return findDocumentById(result.insertId);
}

async function findDocumentById(id) {
  const [rows] = await pool.query(
    'SELECT * FROM project_documents WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function removeDocument(id) {
  const [result] = await pool.query('DELETE FROM project_documents WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

// ------------------------------------------------------------ related data

const relatedQueries = {
  sites: `
    SELECT s.*, e.full_name AS site_engineer_name, c.name AS contractor_name,
           (SELECT COUNT(*) FROM project_issues i WHERE i.site_id = s.id AND i.status = 'open') AS open_issues,
           (SELECT COALESCE(SUM(present_count), 0) FROM labour_records l WHERE l.site_id = s.id AND l.record_date = CURDATE()) AS today_attendance
    FROM sites s
    LEFT JOIN employees e ON e.id = s.site_engineer_id
    LEFT JOIN contractors c ON c.id = s.contractor_id
    WHERE s.project_id = ? ORDER BY s.id`,

  tasks: `
    SELECT t.*, s.name AS site_name,
           (SELECT COUNT(*) FROM task_worker_logs twl WHERE twl.task_id = t.id) AS worker_entries_count,
           (SELECT COUNT(DISTINCT twl.worker_name) FROM task_worker_logs twl WHERE twl.task_id = t.id) AS unique_workers_count,
           (SELECT COALESCE(SUM(twl.daily_wage * (twl.hours_worked / 8)), 0) FROM task_worker_logs twl WHERE twl.task_id = t.id) AS actual_labour_cost,
           (SELECT COALESCE(SUM(dwu.quantity_used * COALESCE(tm.cost_per_unit, 0)), 0)
            FROM daily_work_updates dwu
            LEFT JOIN task_materials tm ON tm.task_id = dwu.task_id AND tm.material_id = dwu.material_id
            WHERE dwu.task_id = t.id) AS actual_material_cost,
           (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE task_id = t.id AND status NOT IN ('rejected', 'cancelled')) AS actual_task_expenses,
           (SELECT COUNT(*) FROM daily_work_updates dwu WHERE dwu.task_id = t.id) AS daily_updates_count
    FROM project_tasks t
    LEFT JOIN sites s ON s.id = t.site_id
    WHERE t.project_id = ?
    ORDER BY t.start_date ASC, t.id ASC
  `,

  materials: `
    SELECT me.id, me.quantity, me.used_quantity, me.rate, me.supplier, me.received_date,
           (me.quantity - me.used_quantity) AS remaining_quantity,
           (me.quantity * me.rate) AS total_cost,
           m.name AS material_name, m.category, m.unit,
           s.name AS site_name
    FROM material_entries me
    JOIN materials m ON m.id = me.material_id
    LEFT JOIN sites s ON s.id = me.site_id
    WHERE me.project_id = ? ORDER BY me.received_date DESC`,

  labour: `
    SELECT lr.id, lr.site_id, lr.contractor_id, lr.category, lr.worker_count, lr.present_count,
           lr.record_date, lr.daily_rate, lr.payment_status,
           c.name AS contractor_name, s.name AS site_name,
           (lr.present_count * lr.daily_rate) AS daily_cost
    FROM labour_records lr
    LEFT JOIN contractors c ON c.id = lr.contractor_id
    LEFT JOIN sites s ON s.id = lr.site_id
    WHERE s.project_id = ?
    UNION ALL
    SELECT dwu.id + 100000 AS id, dwu.site_id, dwu.contractor_id,
           COALESCE(dwu.subcategory, dwu.phase_title, 'General Work') AS category,
           1 AS worker_count, 1 AS present_count,
           DATE(dwu.work_date) AS record_date, 0.00 AS daily_rate, 'verified' AS payment_status,
           c.name AS contractor_name, COALESCE(s.name, 'General Site') AS site_name,
           0.00 AS daily_cost
    FROM daily_work_updates dwu
    LEFT JOIN contractors c ON c.id = dwu.contractor_id
    LEFT JOIN sites s ON s.id = dwu.site_id
    WHERE dwu.project_id = ?
    ORDER BY record_date DESC, id DESC`,

  expenses: `
    SELECT e.*, s.name AS site_name FROM expenses e
    LEFT JOIN sites s ON s.id = e.site_id
    WHERE e.project_id = ? ORDER BY e.expense_date DESC`,

  issues: `
    SELECT i.*, s.name AS site_name FROM project_issues i
    LEFT JOIN sites s ON s.id = i.site_id
    WHERE i.project_id = ? ORDER BY FIELD(i.status,'open','resolved'), FIELD(i.severity,'high','medium','low'), i.raised_on DESC`,

  documents: `
    SELECT id, project_id, site_id, name, document_type, file_path, file_name, file_type, file_size, uploaded_on, created_at
    FROM project_documents WHERE project_id = ? ORDER BY id DESC`,

  approvals: `
    SELECT a.*, s.name AS site_name FROM approval_requests a
    LEFT JOIN sites s ON s.id = a.site_id
    WHERE a.project_id = ? ORDER BY FIELD(a.status,'pending','approved','rejected'), a.requested_on DESC`,

  contractors: `
    SELECT c.id, c.name, c.contact_person, c.phone, c.email, c.speciality, c.rating,
           COALESCE(cp.contract_value, 0) AS contract_value,
           COALESCE(cp.paid_amount, 0) AS paid_amount,
           COALESCE(cp.payment_status, 'pending') AS payment_status,
           COALESCE(cp.contract_value - cp.paid_amount, 0) AS outstanding,
           (SELECT COUNT(*) FROM approval_requests a WHERE a.project_id = p.id AND a.status = 'pending') AS pending_approvals,
           (SELECT COALESCE(AVG(s.progress), 0) FROM sites s WHERE s.project_id = p.id AND s.contractor_id = c.id) AS work_progress
    FROM contractors c
    JOIN projects p ON (
      p.id = ? AND (
        c.id = p.contractor_id
        OR c.id IN (SELECT s2.contractor_id FROM sites s2 WHERE s2.project_id = p.id AND s2.contractor_id IS NOT NULL)
        OR c.id IN (SELECT cp2.contractor_id FROM contractor_payments cp2 WHERE cp2.project_id = p.id)
      )
    )
    LEFT JOIN contractor_payments cp ON cp.contractor_id = c.id AND cp.project_id = p.id
    GROUP BY c.id, cp.id`,

  activities: `
    SELECT a.*, s.name AS site_name FROM site_activities a
    JOIN sites s ON s.id = a.site_id
    WHERE s.project_id = ? ORDER BY a.activity_date DESC LIMIT 15`,
};

async function findRelated(projectId, key) {
  const query = relatedQueries[key];
  const paramCount = (query.match(/\?/g) || []).length;
  const [rows] = await pool.query(query, Array(paramCount).fill(projectId));
  return rows;
}

/** Budget roll-up used by the finance tab and the list's spent column. */
async function findFinancials(projectId) {
  const [[totals]] = await pool.query(
    `SELECT
       (SELECT estimated_budget FROM projects WHERE id = ?) AS budget,
       (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE project_id = ?) AS spent,
       (SELECT COALESCE(SUM(quantity * rate), 0) FROM material_entries WHERE project_id = ?) AS material_cost,
       (SELECT COALESCE(SUM(contract_value), 0) FROM contractor_payments WHERE project_id = ?) AS contract_value,
       (SELECT COALESCE(SUM(paid_amount), 0) FROM contractor_payments WHERE project_id = ?) AS contractor_paid,
       (SELECT COALESCE(SUM(l.present_count * l.daily_rate), 0)
          FROM labour_records l JOIN sites s ON s.id = l.site_id
          WHERE s.project_id = ?) AS labour_cost`,
    Array(6).fill(projectId)
  );

  const [byCategory] = await pool.query(
    `SELECT category, SUM(amount) AS total FROM expenses WHERE project_id = ? GROUP BY category ORDER BY total DESC`,
    [projectId]
  );

  return { ...totals, byCategory };
}

module.exports = {
  findAll, findById, findByCode, nextCode, create, update, archive, updateTeam,
  recalculateProgress, findRelated, findFinancials, addDocument, findDocumentById, removeDocument,
};
