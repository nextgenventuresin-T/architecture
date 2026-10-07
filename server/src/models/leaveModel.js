'use strict';

const { pool } = require('../config/db');

/** Read/write access for company-employee leave applications. */

const LIST_SELECT = `
  SELECT
    l.id, l.employee_id, l.leave_type, l.start_date, l.end_date, l.reason,
    l.status, l.applied_on, l.decided_by, l.decided_on, l.decision_note,
    l.created_at, l.updated_at,
    (DATEDIFF(l.end_date, l.start_date) + 1) AS days,
    e.full_name AS employee_name, e.designation AS employee_designation,
    e.employee_code AS employee_code
  FROM leave_records l
  JOIN employees e ON e.id = l.employee_id
`;

function buildFilters({ employeeId, status, leaveType, search }) {
  const where = [];
  const params = [];

  if (employeeId) {
    where.push('l.employee_id = ?');
    params.push(Number(employeeId));
  }
  if (status && status !== 'all') {
    where.push('l.status = ?');
    params.push(status);
  }
  if (leaveType && leaveType !== 'all') {
    where.push('l.leave_type = ?');
    params.push(leaveType);
  }
  if (search) {
    where.push('(e.full_name LIKE ? OR e.employee_code LIKE ?)');
    params.push(...Array(2).fill(`%${search}%`));
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findAll({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${LIST_SELECT} ${whereSql} ORDER BY FIELD(l.status,'PENDING','APPROVED','REJECTED','CANCELLED'), l.start_date DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM leave_records l JOIN employees e ON e.id = l.employee_id ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id, employeeId = null) {
  const where = employeeId ? 'l.id = ? AND l.employee_id = ?' : 'l.id = ?';
  const params = employeeId ? [id, employeeId] : [id];
  const [rows] = await pool.query(`${LIST_SELECT} WHERE ${where} LIMIT 1`, params);
  return rows[0] || null;
}

/** Approved leave overlapping a date range — used to block double-booking
 * attendance/assignment for an employee already on leave. */
async function findOverlapping(employeeId, startDate, endDate) {
  const [rows] = await pool.query(
    `SELECT id FROM leave_records
     WHERE employee_id = ? AND status IN ('PENDING','APPROVED')
       AND start_date <= ? AND end_date >= ?`,
    [employeeId, endDate, startDate]
  );
  return rows;
}

const WRITABLE = ['employee_id', 'leave_type', 'start_date', 'end_date', 'reason', 'status', 'applied_on'];

async function create(payload) {
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO leave_records (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

const EDITABLE = ['leave_type', 'start_date', 'end_date', 'reason'];

async function update(id, payload) {
  const columns = EDITABLE.filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE leave_records SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

async function decide(id, { status, decidedBy, decisionNote }) {
  await pool.query(
    `UPDATE leave_records SET status = ?, decided_by = ?, decided_on = NOW(), decision_note = ? WHERE id = ?`,
    [status, decidedBy ?? null, decisionNote ?? null, id]
  );
}

async function cancel(id) {
  await pool.query(`UPDATE leave_records SET status = 'CANCELLED' WHERE id = ?`, [id]);
}

module.exports = { findAll, findById, findOverlapping, create, update, decide, cancel };
