'use strict';

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const employeeService = require('./employeeService');

/**
 * Project Managers module.
 *
 * A Project Manager is an employee record (designation "Project Manager") with,
 * optionally, a login whose role is project_manager. There is no separate table:
 * reusing `employees` keeps every existing link working - projects.project_manager_id,
 * PM scoping (pmScopeService), HR, attendance - and means a manager created here
 * immediately appears in every Project Manager dropdown (project team, task and
 * subtask assignment).
 */
const PM_DESIGNATION = 'Project Manager';
const PM_ROLE = 'project_manager';

// Who counts as a Project Manager: the designation, or a project_manager login.
const IS_PM_SQL = `(LOWER(TRIM(COALESCE(e.designation, ''))) = 'project manager' OR COALESCE(r.slug, '') = '${PM_ROLE}')`;

const BASE_FROM = `
  FROM employees e
  LEFT JOIN users u ON u.id = e.user_id
  LEFT JOIN roles r ON r.id = u.role_id`;

function toManager(row) {
  return {
    id: row.id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    designation: row.designation,
    department: row.department || null,
    email: row.email || null,
    phone: row.phone || null,
    address: row.address || null,
    workLocation: row.work_location || null,
    workMode: row.work_mode || null,
    employeeType: row.employee_type || null,
    joiningDate: row.joining_date || null,
    experienceYears: row.experience_years != null ? Number(row.experience_years) : null,
    status: row.status || (row.is_active ? 'active' : 'inactive'),
    isActive: Boolean(row.is_active),
    availabilityStatus: row.availability_status || null,
    notes: row.notes || null,
    reportingManager: row.reporting_manager_id ? { id: row.reporting_manager_id, name: row.reporting_manager_name || null } : null,
    login: row.user_id
      ? { id: row.user_id, email: row.user_email, role: row.user_role, isActive: Boolean(row.user_is_active), lastLoginAt: row.last_login_at || null }
      : null,
    projectCount: Number(row.project_count || 0),
    activeProjectCount: Number(row.active_project_count || 0),
    taskCount: Number(row.task_count || 0),
    openTaskCount: Number(row.open_task_count || 0),
    siteCount: Number(row.site_count || 0),
    createdAt: row.created_at,
  };
}

const COUNTS_SELECT = `
  (SELECT COUNT(*) FROM projects p WHERE p.project_manager_id = e.id AND p.is_archived = 0) AS project_count,
  (SELECT COUNT(*) FROM projects p WHERE p.project_manager_id = e.id AND p.is_archived = 0 AND p.status <> 'completed') AS active_project_count,
  (SELECT COUNT(*) FROM project_tasks t WHERE t.assigned_manager_id = e.id)
    + (SELECT COUNT(*) FROM task_subtasks st WHERE st.assigned_manager_id = e.id) AS task_count,
  (SELECT COUNT(*) FROM project_tasks t WHERE t.assigned_manager_id = e.id AND t.status <> 'completed' AND t.progress < 100)
    + (SELECT COUNT(*) FROM task_subtasks st WHERE st.assigned_manager_id = e.id AND st.status <> 'completed' AND st.progress < 100) AS open_task_count,
  (SELECT COUNT(*) FROM sites s JOIN projects p ON p.id = s.project_id WHERE p.project_manager_id = e.id AND p.is_archived = 0) AS site_count`;

async function list(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const where = [IS_PM_SQL];
  const params = [];
  if (query.status && query.status !== 'all') {
    where.push('e.status = ?');
    params.push(query.status);
  }
  if (query.search && String(query.search).trim()) {
    for (const word of String(query.search).trim().split(/\s+/).slice(0, 6)) {
      where.push('(e.full_name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ? OR e.phone LIKE ? OR e.work_location LIKE ? OR e.department LIKE ?)');
      const q = `%${word}%`;
      params.push(q, q, q, q, q, q);
    }
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${BASE_FROM} ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT e.*, u.email AS user_email, r.slug AS user_role, u.is_active AS user_is_active, u.last_login_at,
            ${COUNTS_SELECT}
     ${BASE_FROM} ${whereSql}
     ORDER BY e.is_active DESC, e.full_name ASC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(e.is_active = 1) AS active, SUM(u.id IS NOT NULL) AS with_login ${BASE_FROM} WHERE ${IS_PM_SQL}`
  );
  return {
    managers: rows.map(toManager),
    summary: { total: Number(summary.total || 0), active: Number(summary.active || 0), withLogin: Number(summary.with_login || 0) },
    pagination: { page, pageSize, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / pageSize)) },
  };
}

async function findRow(id) {
  const [[row]] = await pool.query(
    `SELECT e.*, u.email AS user_email, r.slug AS user_role, u.is_active AS user_is_active, u.last_login_at,
            rm.full_name AS reporting_manager_name,
            ${COUNTS_SELECT}
     ${BASE_FROM}
     LEFT JOIN employees rm ON rm.id = e.reporting_manager_id
     WHERE e.id = ? AND ${IS_PM_SQL}`,
    [id]
  );
  return row || null;
}

async function getDetail(id) {
  const row = await findRow(id);
  if (!row) throw ApiError.notFound('That project manager does not exist.');

  const [projects] = await pool.query(
    `SELECT p.id, p.code, p.name, p.status, p.progress, p.location, p.start_date, p.expected_completion,
            c.name AS client_name,
            (SELECT COUNT(*) FROM sites s WHERE s.project_id = p.id) AS site_count,
            (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id) AS task_count
     FROM projects p
     LEFT JOIN clients c ON c.id = p.client_id
     WHERE p.project_manager_id = ? AND p.is_archived = 0
     ORDER BY p.name`,
    [id]
  );
  const [tasks] = await pool.query(
    `SELECT 'task' AS kind, t.id, t.id AS task_id, NULL AS subtask_id, t.name, NULL AS parent_name,
            t.status, t.progress, t.start_date, t.end_date,
            p.id AS project_id, p.name AS project_name, s.name AS site_name,
            a.name AS area_name, pa.name AS area_parent_name
     FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN sites s ON s.id = t.site_id
     LEFT JOIN project_areas a ON a.id = t.area_id
     LEFT JOIN project_areas pa ON pa.id = a.parent_id
     WHERE t.assigned_manager_id = ?
     UNION ALL
     SELECT 'subtask', st.id, st.task_id, st.id, st.name, t.name,
            st.status, st.progress, st.start_date, st.end_date,
            p.id, p.name, s.name, a.name, pa.name
     FROM task_subtasks st
     JOIN project_tasks t ON t.id = st.task_id
     JOIN projects p ON p.id = st.project_id
     LEFT JOIN sites s ON s.id = st.site_id
     LEFT JOIN project_areas a ON a.id = st.area_id
     LEFT JOIN project_areas pa ON pa.id = a.parent_id
     WHERE st.assigned_manager_id = ?
     ORDER BY start_date IS NULL, start_date, name`,
    [id, id]
  );
  const [sites] = await pool.query(
    `SELECT s.id, s.name, s.address, s.status, s.progress, p.id AS project_id, p.name AS project_name, c.name AS contractor_name
     FROM sites s
     JOIN projects p ON p.id = s.project_id
     LEFT JOIN contractors c ON c.id = s.contractor_id
     WHERE p.project_manager_id = ? AND p.is_archived = 0
     ORDER BY p.name, s.name`,
    [id]
  );

  return {
    manager: toManager(row),
    projects: projects.map((p) => ({
      id: p.id, code: p.code, name: p.name, status: p.status, progress: Number(p.progress || 0),
      location: p.location, startDate: p.start_date, expectedCompletion: p.expected_completion,
      clientName: p.client_name || null, siteCount: Number(p.site_count || 0), taskCount: Number(p.task_count || 0),
    })),
    tasks: tasks.map((t) => ({
      kind: t.kind, id: t.id, taskId: t.task_id, subtaskId: t.subtask_id, name: t.name, parentName: t.parent_name,
      status: t.status, progress: Number(t.progress || 0), startDate: t.start_date, endDate: t.end_date,
      projectId: t.project_id, projectName: t.project_name, siteName: t.site_name || null,
      areaName: t.area_name ? (t.area_parent_name ? `${t.area_parent_name} › ${t.area_name}` : t.area_name) : null,
    })),
    sites: sites.map((s) => ({
      id: s.id, name: s.name, address: s.address, status: s.status, progress: Number(s.progress || 0),
      projectId: s.project_id, projectName: s.project_name, contractorName: s.contractor_name || null,
    })),
  };
}

/**
 * Active employees who are not Project Managers yet - the people an admin can
 * make a Project Manager. Their details always come from the Employees module.
 */
async function candidates() {
  const [rows] = await pool.query(
    `SELECT e.id, e.employee_code, e.full_name, e.designation, e.department, e.phone, e.email, e.work_location,
            u.id AS user_id, u.email AS user_email, r.slug AS user_role
     ${BASE_FROM}
     WHERE e.is_active = 1 AND NOT ${IS_PM_SQL}
     ORDER BY e.full_name`
  );
  return rows.map((r) => ({
    id: r.id, employeeCode: r.employee_code, fullName: r.full_name, designation: r.designation,
    department: r.department, phone: r.phone, email: r.email, workLocation: r.work_location,
    login: r.user_id ? { id: r.user_id, email: r.user_email, role: r.user_role } : null,
  }));
}

/**
 * Makes an existing employee a Project Manager: their designation becomes
 * "Project Manager" and, if asked and they have no login yet, a Project Manager
 * login is created. Every other detail stays on - and is edited in - the employee record.
 */
async function assign(employeeId, { createUserAccess } = {}, actorId) {
  const employee = await employeeService.getById(employeeId); // 404s when missing
  if (!employee) throw ApiError.notFound('That employee does not exist.');
  const payload = { designation: PM_DESIGNATION };
  if (createUserAccess && typeof createUserAccess === 'object') {
    const [[linked]] = await pool.query('SELECT user_id FROM employees WHERE id = ?', [employeeId]);
    if (linked?.user_id) {
      throw ApiError.badRequest('This employee already has a login. Change its role in Users & Access if needed.');
    }
    payload.createUserAccess = { ...createUserAccess, role: PM_ROLE };
  }
  await employeeService.update(employeeId, payload, actorId);
  return getDetail(employeeId);
}

module.exports = { PM_DESIGNATION, list, getDetail, candidates, assign };
