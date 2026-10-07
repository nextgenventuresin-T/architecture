'use strict';

const { pool } = require('../config/db');

/**
 * Read/write access for posting company or contractor labour to a
 * project/site. As with contractorWorkerModel, every list/detail query takes
 * an explicit `contractorId` filter for CONTRACTOR callers — the service
 * layer supplies the signed-in contractor's own id, never a client-supplied
 * one.
 */

const LIST_SELECT = `
  SELECT
    a.id, a.labour_type, a.employee_id, a.contractor_worker_id, a.contractor_id,
    a.project_id, a.site_id, a.start_date, a.end_date, a.status, a.notes,
    a.assigned_by, a.created_at, a.updated_at,
    e.full_name       AS employee_name,
    e.designation      AS employee_designation,
    w.full_name        AS worker_name,
    w.skill_category    AS worker_skill,
    c.name              AS contractor_name,
    p.name              AS project_name,
    p.code              AS project_code,
    s.name              AS site_name
  FROM labour_assignments a
  LEFT JOIN employees e ON e.id = a.employee_id
  LEFT JOIN contractor_workers w ON w.id = a.contractor_worker_id
  LEFT JOIN contractors c ON c.id = a.contractor_id
  JOIN projects p ON p.id = a.project_id
  LEFT JOIN sites s ON s.id = a.site_id
`;

function buildFilters({ contractorId, labourType, projectId, siteId, status, search }) {
  const where = [];
  const params = [];

  if (contractorId) {
    where.push('a.contractor_id = ?');
    params.push(Number(contractorId));
  }
  if (labourType && labourType !== 'all') {
    where.push('a.labour_type = ?');
    params.push(labourType);
  }
  if (projectId) {
    where.push('a.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId) {
    where.push('a.site_id = ?');
    params.push(Number(siteId));
  }
  if (status && status !== 'all') {
    where.push('a.status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(e.full_name LIKE ? OR w.full_name LIKE ? OR c.name LIKE ?)');
    params.push(...Array(3).fill(`%${search}%`));
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findAll({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${LIST_SELECT} ${whereSql} ORDER BY a.status = 'active' DESC, a.start_date DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM labour_assignments a
     LEFT JOIN employees e ON e.id = a.employee_id
     LEFT JOIN contractor_workers w ON w.id = a.contractor_worker_id
     LEFT JOIN contractors c ON c.id = a.contractor_id
     ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id, contractorId = null) {
  const where = contractorId ? 'a.id = ? AND a.contractor_id = ?' : 'a.id = ?';
  const params = contractorId ? [id, contractorId] : [id];
  const [rows] = await pool.query(`${LIST_SELECT} WHERE ${where} LIMIT 1`, params);
  return rows[0] || null;
}

/** Currently-active assignments for one employee — used to block a double
 * posting to the same site and to show "current work" on Employee Management. */
async function findActiveForEmployee(employeeId) {
  const [rows] = await pool.query(
    `SELECT id, project_id, site_id FROM labour_assignments
     WHERE employee_id = ? AND status = 'active'`,
    [employeeId]
  );
  return rows;
}

async function findActiveForWorker(workerId) {
  const [rows] = await pool.query(
    `SELECT id, project_id, site_id FROM labour_assignments
     WHERE contractor_worker_id = ? AND status = 'active'`,
    [workerId]
  );
  return rows;
}

const WRITABLE = [
  'labour_type', 'employee_id', 'contractor_worker_id', 'contractor_id',
  'project_id', 'site_id', 'start_date', 'end_date', 'status', 'assigned_by', 'notes',
];

async function create(payload) {
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO labour_assignments (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

async function update(id, payload) {
  const columns = WRITABLE.filter((key) =>
    payload[key] !== undefined && !['labour_type', 'employee_id', 'contractor_worker_id', 'contractor_id'].includes(key)
  );
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE labour_assignments SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

async function endAssignment(id, endDate, status = 'completed') {
  await pool.query(
    'UPDATE labour_assignments SET status = ?, end_date = COALESCE(?, end_date, CURDATE()) WHERE id = ?',
    [status, endDate ?? null, id]
  );
}

module.exports = {
  findAll, findById, findActiveForEmployee, findActiveForWorker, create, update, endAssignment,
};
