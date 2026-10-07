'use strict';

const { pool } = require('../config/db');

/**
 * Read/write access for daily attendance, company and contractor labour
 * alike. Every list/detail query takes an explicit `contractorId` filter for
 * CONTRACTOR callers — supplied by the service layer, never from the request
 * — so a contractor can never read or mark another contractor's attendance.
 */

const LIST_SELECT = `
  SELECT
    a.id, a.attendance_date, a.labour_type, a.employee_id, a.contractor_worker_id,
    a.contractor_id, a.project_id, a.site_id, a.status, a.check_in, a.check_out,
    a.remarks, a.recorded_by, a.created_at, a.updated_at,
    e.full_name        AS employee_name,
    e.designation       AS employee_designation,
    w.full_name          AS worker_name,
    w.skill_category      AS worker_skill,
    c.name                AS contractor_name,
    p.name                AS project_name,
    s.name                AS site_name
  FROM attendance_records a
  LEFT JOIN employees e ON e.id = a.employee_id
  LEFT JOIN contractor_workers w ON w.id = a.contractor_worker_id
  LEFT JOIN contractors c ON c.id = a.contractor_id
  LEFT JOIN projects p ON p.id = a.project_id
  LEFT JOIN sites s ON s.id = a.site_id
`;

function buildFilters({ contractorId, labourType, projectId, siteId, status, date, dateFrom, dateTo, employeeId, workerId, search }) {
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
  if (date) {
    where.push('a.attendance_date = ?');
    params.push(date);
  }
  if (dateFrom) {
    where.push('a.attendance_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('a.attendance_date <= ?');
    params.push(dateTo);
  }
  if (employeeId) {
    where.push('a.employee_id = ?');
    params.push(Number(employeeId));
  }
  if (workerId) {
    where.push('a.contractor_worker_id = ?');
    params.push(Number(workerId));
  }
  if (search) {
    where.push('(e.full_name LIKE ? OR w.full_name LIKE ?)');
    params.push(...Array(2).fill(`%${search}%`));
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findAll({ page = 1, pageSize = 20, ...filters }) {
  const { whereSql, params } = buildFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${LIST_SELECT} ${whereSql} ORDER BY a.attendance_date DESC, a.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM attendance_records a
     LEFT JOIN employees e ON e.id = a.employee_id
     LEFT JOIN contractor_workers w ON w.id = a.contractor_worker_id
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

async function findExisting({ attendanceDate, employeeId, contractorWorkerId }) {
  if (employeeId) {
    const [rows] = await pool.query(
      'SELECT id FROM attendance_records WHERE attendance_date = ? AND employee_id = ? LIMIT 1',
      [attendanceDate, employeeId]
    );
    return rows[0] || null;
  }
  const [rows] = await pool.query(
    'SELECT id FROM attendance_records WHERE attendance_date = ? AND contractor_worker_id = ? LIMIT 1',
    [attendanceDate, contractorWorkerId]
  );
  return rows[0] || null;
}

const WRITABLE = [
  'attendance_date', 'labour_type', 'employee_id', 'contractor_worker_id', 'contractor_id',
  'project_id', 'site_id', 'status', 'check_in', 'check_out', 'remarks', 'recorded_by',
];

async function create(payload) {
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO attendance_records (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

const EDITABLE = ['status', 'check_in', 'check_out', 'remarks'];

async function update(id, payload) {
  const columns = EDITABLE.filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE attendance_records SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

/** Attendance counts for one day, split by labour type — the building block
 * for the Site Workforce dashboard. */
async function findDaySummaryForSite(siteId, date) {
  const [rows] = await pool.query(
    `SELECT labour_type, status, COUNT(*) AS total
     FROM attendance_records
     WHERE site_id = ? AND attendance_date = ?
     GROUP BY labour_type, status`,
    [siteId, date]
  );
  return rows;
}

module.exports = { findAll, findById, findExisting, create, update, findDaySummaryForSite };
