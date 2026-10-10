'use strict';

/**
 * Project Manager workspace: what a PM may SEE and DO for the projects and sites
 * they are assigned to. Every query is filtered by the assignment resolved from
 * the database in attachHrScope (never from the request), and an empty
 * assignment returns nothing.
 */

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/roles');
const attendanceService = require('./attendanceService');

function ids(hrScope) {
  if (hrScope?.role === ROLES.ADMIN) return null; // unrestricted
  return hrScope?.pmProjectIds || [];
}

/** Assigned projects, their sites (with the responsible contractor) and open tasks. */
async function getScope(hrScope) {
  const projectIds = ids(hrScope);
  const where = ['p.is_archived = 0'];
  const params = [];
  if (projectIds) {
    if (!projectIds.length) return { projects: [] };
    where.push(`p.id IN (${projectIds.map(() => '?').join(',')})`);
    params.push(...projectIds);
  }
  const [projects] = await pool.query(
    `SELECT p.id, p.code, p.name, p.contractor_id, c.name AS contractor_name
     FROM projects p LEFT JOIN contractors c ON c.id = p.contractor_id
     WHERE ${where.join(' AND ')} ORDER BY p.name`,
    params
  );
  if (!projects.length) return { projects: [] };
  const pIds = projects.map((p) => p.id);
  const [sites] = await pool.query(
    `SELECT s.id, s.project_id, s.name, s.contractor_id, c.name AS contractor_name
     FROM sites s LEFT JOIN contractors c ON c.id = s.contractor_id
     WHERE s.project_id IN (?) ORDER BY s.name`,
    [pIds]
  );
  const siteSet = hrScope?.role === ROLES.ADMIN ? null : new Set(hrScope.pmSiteIds || []);
  const [tasks] = await pool.query(
    "SELECT id, project_id, site_id, name, status FROM project_tasks WHERE project_id IN (?) AND status <> 'completed' ORDER BY id",
    [pIds]
  );
  return {
    projects: projects.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      contractor: p.contractor_id ? { id: p.contractor_id, name: p.contractor_name } : null,
      sites: sites
        .filter((s) => s.project_id === p.id && (!siteSet || siteSet.has(Number(s.id))))
        .map((s) => ({
          id: s.id,
          name: s.name,
          contractor: s.contractor_id ? { id: s.contractor_id, name: s.contractor_name } : (p.contractor_id ? { id: p.contractor_id, name: p.contractor_name } : null),
          tasks: tasks.filter((t) => t.project_id === p.id && (!t.site_id || t.site_id === s.id)).map((t) => ({ id: t.id, name: t.name, status: t.status })),
        })),
    })),
  };
}

/** Contractor labour a PM can record attendance for at one assigned site. */
async function listWorkers(query, hrScope) {
  const projectId = Number(query.projectId);
  const siteId = Number(query.siteId);
  if (!projectId || !siteId) throw ApiError.badRequest('Select a project and site.');
  const projectIds = ids(hrScope);
  if (projectIds && !projectIds.includes(projectId)) throw ApiError.notFound('That project does not exist.');
  if (hrScope?.role !== ROLES.ADMIN && !(hrScope.pmSiteIds || []).includes(siteId)) throw ApiError.notFound('That site does not exist.');

  const [[site]] = await pool.query(
    'SELECT s.id, COALESCE(s.contractor_id, p.contractor_id) AS contractor_id FROM sites s JOIN projects p ON p.id = s.project_id WHERE s.id = ? AND s.project_id = ?',
    [siteId, projectId]
  );
  if (!site) throw ApiError.notFound('That site does not exist on this project.');
  if (!site.contractor_id) return { contractorId: null, workers: [] };
  const [rows] = await pool.query(
    `SELECT id, full_name, skill_category, status FROM contractor_workers
     WHERE contractor_id = ? AND (status IS NULL OR status <> 'inactive') ORDER BY full_name`,
    [site.contractor_id]
  );
  return {
    contractorId: site.contractor_id,
    workers: rows.map((w) => ({ id: w.id, name: w.full_name, skillCategory: w.skill_category })),
  };
}

/** Read-only expense records for the PM's projects, each tied to its source. */
async function listExpenses(query, hrScope) {
  const projectIds = ids(hrScope);
  const where = ["e.status NOT IN ('rejected', 'cancelled')"];
  const params = [];
  if (projectIds) {
    if (!projectIds.length) return { expenses: [], total: 0, totalAmount: 0 };
    where.push(`e.project_id IN (${projectIds.map(() => '?').join(',')})`);
    params.push(...projectIds);
  }
  if (query.projectId) { where.push('e.project_id = ?'); params.push(Number(query.projectId)); }
  if (query.siteId) { where.push('e.site_id = ?'); params.push(Number(query.siteId)); }
  if (query.taskId) { where.push('e.task_id = ?'); params.push(Number(query.taskId)); }
  const [rows] = await pool.query(
    `SELECT e.id, e.expense_number, e.category, e.description, e.amount, e.expense_date, e.status,
            e.reference, e.source_type, e.source_id, e.tool_unit_id,
            p.name AS project_name, s.name AS site_name, pt.name AS task_name, c.name AS contractor_name,
            u.full_name AS created_by_name
     FROM expenses e
     JOIN projects p ON p.id = e.project_id
     LEFT JOIN sites s ON s.id = e.site_id
     LEFT JOIN project_tasks pt ON pt.id = e.task_id
     LEFT JOIN contractors c ON c.id = e.contractor_id
     LEFT JOIN users u ON u.id = e.created_by
     WHERE ${where.join(' AND ')}
     ORDER BY e.expense_date DESC, e.id DESC LIMIT 300`,
    params
  );
  const expenses = rows.map((r) => ({
    id: r.id,
    expenseNumber: r.expense_number,
    category: r.category,
    description: r.description,
    amount: Number(r.amount),
    date: r.expense_date,
    status: r.status,
    reference: r.reference,
    sourceType: r.source_type,
    sourceId: r.source_id,
    project: r.project_name,
    site: r.site_name,
    task: r.task_name,
    contractor: r.contractor_name,
    createdBy: r.created_by_name,
  }));
  return { expenses, total: expenses.length, totalAmount: Number(expenses.reduce((s, e) => s + e.amount, 0).toFixed(2)) };
}

module.exports = { getScope, listWorkers, listExpenses, attendance: attendanceService };
