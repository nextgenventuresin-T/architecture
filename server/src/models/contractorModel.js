'use strict';

const { pool } = require('../config/db');

/**
 * Read/write access for contractors and the roll-ups the Contractor
 * Management screens need (assigned work, labour, payments, approvals).
 * Nothing here changes how Interface 3 reads `contractors` — it still uses
 * `SELECT id, name, speciality FROM contractors WHERE is_active = 1`.
 */

const LIST_SELECT = `
  SELECT
    c.id, c.name, c.contact_person, c.phone, c.email, c.address,
    c.pan_number, c.aadhaar_number, c.gst_number,
    c.bank_account_holder, c.bank_account_number, c.bank_name, c.bank_ifsc, c.bank_branch,
    c.type, c.status, c.notes, c.speciality, c.rating, c.is_active, c.created_at,
    c.user_id                          AS linked_user_id,
    lu.full_name                       AS linked_user_name,
    lu.email                           AS linked_user_email,
    lu.is_active                       AS linked_user_is_active,
    COALESCE(proj.total, 0)            AS project_count,
    COALESCE(site.total, 0)            AS site_count,
    COALESCE(site.labour_total, 0)     AS labour_count,
    COALESCE(site.progress_avg, 0)     AS progress,
    COALESCE(pay.contract_value, 0)    AS contract_value,
    COALESCE(pay.paid_amount, 0)       AS paid_amount,
    pay.payment_status                 AS payment_status,
    COALESCE(appr.pending_total, 0)    AS pending_approvals
  FROM contractors c
  LEFT JOIN users lu ON lu.id = c.user_id
  LEFT JOIN (
    SELECT contractor_id, COUNT(*) AS total
    FROM projects WHERE is_archived = 0 AND contractor_id IS NOT NULL
    GROUP BY contractor_id
  ) proj ON proj.contractor_id = c.id
  LEFT JOIN (
    SELECT contractor_id, COUNT(*) AS total, SUM(labour_count) AS labour_total, AVG(progress) AS progress_avg
    FROM sites WHERE contractor_id IS NOT NULL
    GROUP BY contractor_id
  ) site ON site.contractor_id = c.id
  LEFT JOIN (
    SELECT contractor_id,
           SUM(contract_value) AS contract_value,
           SUM(paid_amount)    AS paid_amount,
           CASE
             WHEN SUM(CASE WHEN payment_status = 'overdue' THEN 1 ELSE 0 END) > 0 THEN 'overdue'
             WHEN SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) > 0 THEN 'pending'
             ELSE 'cleared'
           END AS payment_status
    FROM contractor_payments
    GROUP BY contractor_id
  ) pay ON pay.contractor_id = c.id
  LEFT JOIN (
    SELECT requested_by, COUNT(*) AS pending_total
    FROM approval_requests WHERE status = 'pending'
    GROUP BY requested_by
  ) appr ON appr.requested_by = c.name
`;

async function findAll({ search, status, type, page = 1, pageSize = 10 }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(c.name LIKE ? OR c.contact_person LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)');
    params.push(...Array(4).fill(`%${search}%`));
  }
  if (status && status !== 'all') {
    where.push('c.status = ?');
    params.push(status);
  }
  if (type && type !== 'all') {
    where.push('c.type = ?');
    params.push(type);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${LIST_SELECT} ${whereSql} ORDER BY c.name LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM contractors c ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query(`${LIST_SELECT} WHERE c.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.query('SELECT id FROM contractors WHERE name = ? LIMIT 1', [name]);
  return rows[0] || null;
}

/** The contractor record linked to a login account — used by HR & Labour
 * (Interface 11) to resolve which contractor a signed-in CONTRACTOR user is,
 * so their own-data-only scope can never be spoofed from the request body. */
async function findByUserId(userId) {
  const [rows] = await pool.query(
    'SELECT id, name, status, is_active FROM contractors WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

/** Any contractor currently linked to this user, other than `excludeContractorId`.
 * Used to enforce the one-user-one-contractor rule server-side before a link is saved. */
async function findLinkedContractorForUser(userId, excludeContractorId) {
  const params = [userId];
  let sql = 'SELECT id, name FROM contractors WHERE user_id = ?';
  if (excludeContractorId) {
    sql += ' AND id != ?';
    params.push(excludeContractorId);
  }
  const [rows] = await pool.query(`${sql} LIMIT 1`, params);
  return rows[0] || null;
}

/**
 * CONTRACTOR-role user accounts an admin may link to a contractor profile:
 * either not linked to any contractor yet, or already linked to the
 * contractor currently being edited (so the current selection still shows up).
 */
async function findEligibleUsers(excludeContractorId) {
  const params = [];
  let sql = `
    SELECT u.id, u.full_name, u.email, u.is_active,
           lc.id AS linked_contractor_id, lc.name AS linked_contractor_name
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN contractors lc ON lc.user_id = u.id
    WHERE r.slug = 'contractor'
      AND (lc.id IS NULL`;
  if (excludeContractorId) {
    sql += ' OR lc.id = ?';
    params.push(excludeContractorId);
  }
  sql += ') ORDER BY u.full_name';

  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Existence + role check for a user_id an admin is trying to link — used by
 * contractorService before it ever writes to `contractors.user_id`. */
async function findUserForLink(userId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.is_active, r.slug AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

const WRITABLE = [
  'name', 'contact_person', 'phone', 'email', 'address', 'type', 'status', 'notes', 'is_active', 'user_id',
  'pan_number', 'aadhaar_number', 'gst_number', 'bank_account_holder', 'bank_account_number', 'bank_name', 'bank_ifsc', 'bank_branch'
];

function normalizeContractorPayload(payload) {
  const norm = { ...payload };
  if (norm.panNumber !== undefined) norm.pan_number = norm.panNumber;
  if (norm.aadhaarNumber !== undefined) norm.aadhaar_number = norm.aadhaarNumber;
  if (norm.gstNumber !== undefined) norm.gst_number = norm.gstNumber;
  if (norm.bankAccountHolder !== undefined) norm.bank_account_holder = norm.bankAccountHolder;
  if (norm.bankAccountNumber !== undefined) norm.bank_account_number = norm.bankAccountNumber;
  if (norm.bankName !== undefined) norm.bank_name = norm.bankName;
  if (norm.bankIfsc !== undefined) norm.bank_ifsc = norm.bankIfsc;
  if (norm.bankBranch !== undefined) norm.bank_branch = norm.bankBranch;
  return norm;
}

async function create(rawPayload) {
  const payload = normalizeContractorPayload(rawPayload);
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO contractors (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

async function update(id, rawPayload) {
  const payload = normalizeContractorPayload(rawPayload);
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE contractors SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

// ------------------------------------------------------------ related data

async function findProjects(contractorId) {
  const [rows] = await pool.query(
    `SELECT id, code, name, status, progress, estimated_budget, location, expected_completion
     FROM projects WHERE contractor_id = ? AND is_archived = 0 ORDER BY updated_at DESC`,
    [contractorId]
  );
  return rows;
}

async function findSites(contractorId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.address, s.labour_count, s.progress, s.status, s.safety_status,
            p.id AS project_id, p.name AS project_name, p.code AS project_code
     FROM sites s
     JOIN projects p ON p.id = s.project_id
     WHERE s.contractor_id = ? ORDER BY s.updated_at DESC`,
    [contractorId]
  );
  return rows;
}

async function findPayments(contractorId) {
  const [rows] = await pool.query(
    `SELECT cp.id, cp.contract_value, cp.paid_amount, cp.payment_status, cp.updated_at,
            (cp.contract_value - cp.paid_amount) AS outstanding,
            p.id AS project_id, p.name AS project_name, p.code AS project_code
     FROM contractor_payments cp
     JOIN projects p ON p.id = cp.project_id
     WHERE cp.contractor_id = ? ORDER BY cp.updated_at DESC`,
    [contractorId]
  );
  return rows;
}

async function findLabour(contractorId) {
  const [rows] = await pool.query(
    `SELECT l.id, l.category, l.worker_count, l.present_count, l.record_date, l.daily_rate,
            l.payment_status, (l.present_count * l.daily_rate) AS daily_cost,
            s.id AS site_id, COALESCE(s.name, 'General Site') AS site_name, p.name AS project_name
     FROM labour_records l
     LEFT JOIN sites s ON s.id = l.site_id
     LEFT JOIN projects p ON p.id = s.project_id
     WHERE l.contractor_id = ?
     UNION ALL
     SELECT dwu.id + 100000 AS id,
            COALESCE(dwu.subcategory, dwu.phase_title, 'Daily Work') AS category,
            1 AS worker_count, 1 AS present_count,
            DATE(dwu.work_date) AS record_date, 0.00 AS daily_rate,
            'verified' AS payment_status, 0.00 AS daily_cost,
            s.id AS site_id, COALESCE(s.name, 'General Site') AS site_name,
            p.name AS project_name
     FROM daily_work_updates dwu
     JOIN projects p ON p.id = dwu.project_id
     LEFT JOIN sites s ON s.id = dwu.site_id
     WHERE dwu.contractor_id = ?
     ORDER BY record_date DESC, id DESC`,
    [contractorId, contractorId]
  );
  return rows;
}

/** Matched by name — approval_requests has no contractor_id column (Interface 3). */
async function findApprovals(contractorName) {
  const [rows] = await pool.query(
    `SELECT a.id, a.request_type, a.title, a.amount, a.details, a.status,
            a.requested_on, a.decided_on, a.decision_note,
            p.name AS project_name, s.name AS site_name
     FROM approval_requests a
     LEFT JOIN projects p ON p.id = a.project_id
     LEFT JOIN sites s ON s.id = a.site_id
     WHERE a.requested_by = ?
     ORDER BY FIELD(a.status,'pending','approved','rejected'), a.requested_on DESC`,
    [contractorName]
  );
  return rows;
}

module.exports = {
  findAll, findById, findByName, findByUserId, findLinkedContractorForUser, findEligibleUsers,
  findUserForLink, create, update,
  findProjects, findSites, findPayments, findLabour, findApprovals,
};
