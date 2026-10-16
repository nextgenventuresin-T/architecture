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
 * record, a task / subtask of the project is assigned to that employee
 * (assigned_manager_id), or an admin granted the user that project (user_project_access).
 * Sites are all sites of those projects, narrowed to the explicitly granted
 * ones when the admin granted any site rows on those projects.
 *
 * Unlike the legacy read-only PM dashboard (which treats "no assignment" as
 * "see everything"), this is DENY-BY-DEFAULT: a PM with no assignment can
 * neither write nor read these records.
 */
/**
 * The employee record of a signed-in user. Projects and tasks name a Project Manager by
 * EMPLOYEE, while the PM signs in as a USER - so the two must be linked. When an admin
 * created both but never linked them, the one unlinked employee with the same email as
 * the user is that person: link it once here, so their assignments reach them.
 */
async function employeeIdForUser(userId) {
  const [[linked]] = await pool.query('SELECT id FROM employees WHERE user_id = ? LIMIT 1', [userId]);
  if (linked) return Number(linked.id);
  const [matches] = await pool.query(
    `SELECT e.id FROM employees e JOIN users u ON u.id = ?
     WHERE e.user_id IS NULL AND e.email IS NOT NULL AND LOWER(TRIM(e.email)) = LOWER(TRIM(u.email))`,
    [userId]
  );
  if (matches.length !== 1) return null; // none, or ambiguous: leave it to an admin
  await pool.query('UPDATE employees SET user_id = ? WHERE id = ? AND user_id IS NULL', [userId, matches[0].id]);
  return Number(matches[0].id);
}

async function resolve(userId) {
  const projectIds = new Set();
  let employeeId = null;

  const empId = await employeeIdForUser(userId);
  if (empId) {
    employeeId = empId;
    const [rows] = await pool.query(
      'SELECT id FROM projects WHERE project_manager_id = ? AND is_archived = 0',
      [employeeId]
    );
    rows.forEach((r) => projectIds.add(Number(r.id)));
    const [taskProjects] = await pool.query(
      `SELECT DISTINCT t.project_id FROM project_tasks t
       JOIN projects p ON p.id = t.project_id AND p.is_archived = 0
       WHERE t.assigned_manager_id = ?
          OR EXISTS (SELECT 1 FROM task_subtasks st WHERE st.task_id = t.id AND st.assigned_manager_id = ?)`,
      [employeeId, employeeId]
    );
    taskProjects.forEach((r) => projectIds.add(Number(r.project_id)));
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

/**
 * Who holds stock for a site: its contractor, or - when neither the site nor its
 * project has a contractor - the site's own Site Store, run by its Project Manager.
 * Returns null when there is nothing to hold it (no contractor and no site).
 */
async function siteHolder(projectId, siteId) {
  const contractorId = await responsibleContractorId(projectId, siteId);
  if (contractorId) return { contractorId, warehouseId: null, siteId: siteId ? Number(siteId) : null, pmRun: false };
  if (!siteId) return null;
  const store = await require('../models/warehouseModel').ensureSiteStore(Number(siteId));
  return store ? { contractorId: null, warehouseId: Number(store.id), siteId: Number(siteId), pmRun: true } : null;
}

/** True when this PM is assigned to the given site. */
function pmHasSite(hrScope, siteId) {
  return isPm(hrScope) && siteId != null && (hrScope.pmSiteIds || []).includes(Number(siteId));
}

/** User ids of the Project Manager of a project (for notifications on a PM-run site). */
async function projectManagerUserIds(projectId) {
  if (!projectId) return [];
  const [rows] = await pool.query(
    `SELECT e.user_id FROM projects p JOIN employees e ON e.id = p.project_manager_id
     WHERE p.id = ? AND e.user_id IS NOT NULL`,
    [projectId]
  );
  return rows.map((r) => Number(r.user_id));
}

module.exports = { resolve, isPm, assertPmAssigned, responsibleContractorId, siteHolder, pmHasSite, projectManagerUserIds };
