'use strict';

const { pool } = require('../config/db');

/**
 * Read/write access for contractor labour requests and their fulfilment.
 * Every list/detail query takes an explicit `contractorId` filter for
 * CONTRACTOR callers, supplied by the service layer from the signed-in
 * user's own contractor id — never from the request.
 */

const LIST_SELECT = `
  SELECT
    r.id, r.request_number, r.contractor_id, r.project_id, r.site_id,
    r.skill_category, r.quantity, r.required_date, r.duration_days, r.priority,
    r.reason, r.status, r.requested_by, r.reviewed_by, r.reviewed_at,
    r.decision_note, r.created_at, r.updated_at,
    c.name AS contractor_name,
    p.name AS project_name, p.code AS project_code,
    s.name AS site_name,
    COALESCE(fulfil.assigned_count, 0) AS assigned_count
  FROM labour_requests r
  JOIN contractors c ON c.id = r.contractor_id
  JOIN projects p ON p.id = r.project_id
  JOIN sites s ON s.id = r.site_id
  LEFT JOIN (
    SELECT labour_request_id, COUNT(*) AS assigned_count
    FROM labour_request_assignments
    GROUP BY labour_request_id
  ) fulfil ON fulfil.labour_request_id = r.id
`;

function buildFilters({ contractorId, projectId, siteId, status, priority, search }) {
  const where = [];
  const params = [];

  if (contractorId) {
    where.push('r.contractor_id = ?');
    params.push(Number(contractorId));
  }
  if (projectId) {
    where.push('r.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId) {
    where.push('r.site_id = ?');
    params.push(Number(siteId));
  }
  if (status && status !== 'all') {
    where.push('r.status = ?');
    params.push(status);
  }
  if (priority && priority !== 'all') {
    where.push('r.priority = ?');
    params.push(priority);
  }
  if (search) {
    where.push('(r.request_number LIKE ? OR r.skill_category LIKE ? OR c.name LIKE ?)');
    params.push(...Array(3).fill(`%${search}%`));
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findAll({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${LIST_SELECT} ${whereSql}
     ORDER BY FIELD(r.status,'SUBMITTED','UNDER_REVIEW','APPROVED','PARTIALLY_ASSIGNED','DRAFT','FULLY_ASSIGNED','COMPLETED','REJECTED','CANCELLED'),
              r.required_date, r.id DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM labour_requests r
     JOIN contractors c ON c.id = r.contractor_id ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id, contractorId = null) {
  const where = contractorId ? 'r.id = ? AND r.contractor_id = ?' : 'r.id = ?';
  const params = contractorId ? [id, contractorId] : [id];
  const [rows] = await pool.query(`${LIST_SELECT} WHERE ${where} LIMIT 1`, params);
  return rows[0] || null;
}

async function findByRequestNumber(requestNumber) {
  const [rows] = await pool.query('SELECT id FROM labour_requests WHERE request_number = ? LIMIT 1', [requestNumber]);
  return rows[0] || null;
}

/** Highest request number in play, so a generated LR-#### never collides. */
async function nextRequestNumber() {
  const [rows] = await pool.query(
    `SELECT GREATEST(
              COALESCE(MAX(CASE WHEN request_number REGEXP '^LR-[0-9]+$'
                                THEN CAST(SUBSTRING(request_number, 4) AS UNSIGNED) END), 0),
              COALESCE(MAX(id), 0)
            ) AS max_num
     FROM labour_requests`
  );
  return Number(rows[0]?.max_num || 0) + 1;
}

const WRITABLE = [
  'request_number', 'contractor_id', 'project_id', 'site_id', 'skill_category',
  'quantity', 'required_date', 'duration_days', 'priority', 'reason', 'status', 'requested_by',
];

async function create(payload) {
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO labour_requests (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

const EDITABLE = ['project_id', 'site_id', 'skill_category', 'quantity', 'required_date', 'duration_days', 'priority', 'reason'];

async function update(id, payload) {
  const columns = EDITABLE.filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE labour_requests SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

async function updateStatus(id, status) {
  await pool.query('UPDATE labour_requests SET status = ? WHERE id = ?', [status, id]);
}

/** Records the Admin/HR decision (approve/reject) in one write. */
async function decide(id, { status, reviewedBy, decisionNote }) {
  await pool.query(
    `UPDATE labour_requests
     SET status = ?, reviewed_by = ?, reviewed_at = NOW(), decision_note = ?
     WHERE id = ?`,
    [status, reviewedBy ?? null, decisionNote ?? null, id]
  );
}

// --------------------------------------------------------- fulfilment rows

async function createFulfilment(payload) {
  const [result] = await pool.query(
    `INSERT INTO labour_request_assignments
       (labour_request_id, labour_assignment_id, labour_type, employee_id, contractor_worker_id, assigned_by, assigned_on, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.labour_request_id,
      payload.labour_assignment_id ?? null,
      payload.labour_type,
      payload.employee_id ?? null,
      payload.contractor_worker_id ?? null,
      payload.assigned_by ?? null,
      payload.assigned_on ?? new Date().toISOString().slice(0, 10),
      payload.notes ?? null,
    ]
  );
  return result.insertId;
}

async function findFulfilments(requestId) {
  const [rows] = await pool.query(
    `SELECT f.id, f.labour_type, f.employee_id, f.contractor_worker_id, f.assigned_on, f.notes,
            e.full_name AS employee_name, w.full_name AS worker_name, w.skill_category AS worker_skill
     FROM labour_request_assignments f
     LEFT JOIN employees e ON e.id = f.employee_id
     LEFT JOIN contractor_workers w ON w.id = f.contractor_worker_id
     WHERE f.labour_request_id = ?
     ORDER BY f.id`,
    [requestId]
  );
  return rows;
}

async function countFulfilments(requestId) {
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM labour_request_assignments WHERE labour_request_id = ?',
    [requestId]
  );
  return Number(total || 0);
}

module.exports = {
  findAll, findById, findByRequestNumber, nextRequestNumber, create, update,
  updateStatus, decide, createFulfilment, findFulfilments, countFulfilments,
};
