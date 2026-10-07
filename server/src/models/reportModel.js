'use strict';

const { pool } = require('../config/db');

/**
 * Reports & Analytics (Interface 13) is a read-only layer over every module
 * that already exists. Almost every KPI on its dashboard is already computed
 * somewhere — financeService.getSummary(), procurementModel.findSummary(),
 * materialModel.findStockSummary(), warehouseService.getSummary(),
 * hrDashboardModel.findSummary() — and reportService simply calls those
 * rather than recomputing the same figures a second way.
 *
 * What is genuinely missing is a handful of org-wide counts (projects by
 * status, sites, employees, contractors) that no existing summary exposes,
 * plus a flat cross-project site list, which no interface has ever needed
 * before (Interface 3 only ever reads sites through a project). Both are
 * added here, scoped to a single contractor's own projects/sites when asked,
 * so a CONTRACTOR viewing Reports never sees another contractor's numbers.
 */

/** Project counts by lifecycle group. Optionally scoped to one contractor. */
async function findProjectCounts({ contractorId } = {}) {
  const where = ['p.is_archived = 0'];
  const params = [];
  if (contractorId) {
    where.push('p.contractor_id = ?');
    params.push(contractorId);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [[row]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(p.status <> 'completed') AS active,
       SUM(p.status = 'completed')  AS completed,
       SUM(p.status = 'on-track')   AS on_track,
       SUM(p.status = 'attention')  AS attention,
      SUM(p.status = 'delayed')    AS \`delayed\`,
       SUM(p.status = 'on-hold')    AS on_hold
     FROM projects p ${whereSql}`,
    params
  );
  return row;
}

/** Total sites, optionally scoped to one contractor's own sites. */
async function findSiteCount({ contractorId } = {}) {
  const where = [];
  const params = [];
  if (contractorId) {
    where.push('s.contractor_id = ?');
    params.push(contractorId);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM sites s ${whereSql}`,
    params
  );
  return row;
}

const SITE_LIST_SELECT = `
  SELECT
    s.id, s.name, s.address, s.labour_count, s.progress, s.status, s.safety_status,
    s.created_at, s.updated_at,
    p.id AS project_id, p.name AS project_name, p.code AS project_code,
    e.id AS site_engineer_id, e.full_name AS site_engineer_name,
    c.id AS contractor_id, c.name AS contractor_name,
    (SELECT COUNT(*) FROM project_issues i WHERE i.site_id = s.id AND i.status = 'open') AS open_issues
  FROM sites s
  JOIN projects p ON p.id = s.project_id
  LEFT JOIN employees e ON e.id = s.site_engineer_id
  LEFT JOIN contractors c ON c.id = s.contractor_id
`;

function buildSiteFilters({ search, status, projectId, contractorId, safetyStatus }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(s.name LIKE ? OR s.address LIKE ? OR p.name LIKE ?)');
    params.push(...Array(3).fill(`%${search}%`));
  }
  if (status && status !== 'all') {
    where.push('s.status = ?');
    params.push(status);
  }
  if (safetyStatus && safetyStatus !== 'all') {
    where.push('s.safety_status = ?');
    params.push(safetyStatus);
  }
  if (projectId && projectId !== 'all') {
    where.push('s.project_id = ?');
    params.push(Number(projectId));
  }
  // Always applied when set (a signed-in CONTRACTOR), never overridable by
  // a client-supplied contractorId — the caller passes their own id here.
  if (contractorId) {
    where.push('s.contractor_id = ?');
    params.push(Number(contractorId));
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/** Flat, cross-project site list — the "Total Sites" drill-down. */
async function findSites({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildSiteFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${SITE_LIST_SELECT} ${whereSql} ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM sites s JOIN projects p ON p.id = s.project_id ${whereSql}`,
    params
  );

  return { rows, total };
}

/** Employee headcount, active vs total. */
async function findEmployeeCounts() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(status = 'active') AS active FROM employees`
  );
  return row;
}

/** Contractor headcount, active vs total. */
async function findContractorCounts() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(status = 'active') AS active FROM contractors`
  );
  return row;
}

module.exports = {
  findProjectCounts,
  findSiteCount,
  findSites,
  findEmployeeCounts,
  findContractorCounts,
};
