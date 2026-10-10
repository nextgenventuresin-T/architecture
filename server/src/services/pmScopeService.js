'use strict';

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/roles');

/**
 * Which projects and sites a Project Manager is ASSIGNED to - the basis for
 * every PM write and every PM-scoped read added for procurement, machines,
 * labour attendance and daily work.
 *
 * Assigned means: the project's project_manager_id is the PM's linked employee
 * record, or an admin granted the user that project (user_project_access).
 * Sites are all sites of those projects, narrowed to the explicitly granted
 * ones when the admin granted any site rows on those projects.
 *
 * Unlike the legacy read-only PM dashboard (which treats "no assignment" as
 * "see everything"), this is DENY-BY-DEFAULT: a PM with no assignment can
 * neither write nor read these records.
 */
async function resolve(userId) {
  const projectIds = new Set();
  let employeeId = null;

  const [emp] = await pool.query('SELECT id FROM employees WHERE user_id = ? LIMIT 1', [userId]);
  if (emp[0]) {
    employeeId = emp[0].id;
    const [rows] = await pool.query(
      'SELECT id FROM projects WHERE project_manager_id = ? AND is_archived = 0',
      [employeeId]
    );
    rows.forEach((r) => projectIds.add(Number(r.id)));
  }
  const [granted] = await pool.query(
    `SELECT upa.project_id FROM user_project_access upa
     JOIN projects p ON p.id = upa.project_id AND p.is_archived = 0
     WHERE upa.user_id = ?`,
    [userId]
  );
  granted.forEach((r) => projectIds.add(Number(r.project_id)));

  const pIds = Array.from(projectIds);
  let siteIds = [];
  if (pIds.length) {
    const [sites] = await pool.query('SELECT id FROM sites WHERE project_id IN (?)', [pIds]);
    siteIds = sites.map((s) => Number(s.id));
    const [grantedSites] = await pool.query('SELECT site_id FROM user_site_access WHERE user_id = ?', [userId]);
    const grantedSet = new Set(grantedSites.map((r) => Number(r.site_id)));
    const narrowed = siteIds.filter((id) => grantedSet.has(id));
    if (narrowed.length) siteIds = narrowed;
  }
  return { employeeId, projectIds: pIds, siteIds };
}

const isPm = (hrScope) => hrScope?.role === ROLES.PROJECT_MANAGER;

/** Throws unless the PM is assigned to this project (and site, when given). */
function assertPmAssigned(hrScope, projectId, siteId = null) {
  if (!isPm(hrScope)) return;
  const projects = hrScope.pmProjectIds || [];
  const sites = hrScope.pmSiteIds || [];
  if (projectId == null || !projects.includes(Number(projectId))) {
    // 404 rather than 403: do not confirm that a project outside the PM's scope exists.
    throw ApiError.notFound('That project does not exist.');
  }
  if (siteId != null && !sites.includes(Number(siteId))) {
    throw ApiError.notFound('That site does not exist.');
  }
}

/** The contractor responsible for a site (falling back to its project's). */
async function responsibleContractorId(projectId, siteId) {
  if (siteId) {
    const [[s]] = await pool.query('SELECT contractor_id FROM sites WHERE id = ?', [siteId]);
    if (s?.contractor_id) return Number(s.contractor_id);
  }
  if (projectId) {
    const [[p]] = await pool.query('SELECT contractor_id FROM projects WHERE id = ?', [projectId]);
    if (p?.contractor_id) return Number(p.contractor_id);
  }
  return null;
}

module.exports = { resolve, isPm, assertPmAssigned, responsibleContractorId };
