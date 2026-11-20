'use strict';

const { pool } = require('../config/db');
const { ROLES, isPmRole } = require('../config/roles');

/**
 * WHO MAY RECEIVE MATERIAL AT A SITE, besides the site's contractor and Admin.
 *
 *   Project Manager : every site they are assigned to (hrScope.pmSiteIds, resolved by
 *                     pmScopeService - deny-by-default).
 *   Site Engineer   : an EMPLOYEE login whose employee record is
 *                       - the site's engineer (sites.site_engineer_id), or
 *                       - the project's site engineer (projects.site_engineer_id -> all its sites), or
 *                       - currently posted to the site / project (employee_assignments) AND is an
 *                         engineer by designation or by the posting's role ("Site Engineer",
 *                         "Project Engineer", ...).
 *
 * Every check reads the database for the signed-in user; ids sent by the client are
 * never trusted. An empty list means "receives nowhere".
 */

const ENGINEER_LIKE = '%engineer%';

/** Site ids an employee is the engineer for. */
async function engineerSiteIds(employeeId) {
  if (!employeeId) return [];
  const [rows] = await pool.query(
    `SELECT s.id FROM sites s WHERE s.site_engineer_id = ?
     UNION
     SELECT s.id FROM sites s JOIN projects p ON p.id = s.project_id
      WHERE p.site_engineer_id = ? AND p.is_archived = 0
     UNION
     SELECT se.site_id FROM site_engineers se WHERE se.employee_id = ?
     UNION
     SELECT s.id FROM project_engineers pe JOIN sites s ON s.project_id = pe.project_id
       JOIN projects p ON p.id = pe.project_id AND p.is_archived = 0
      WHERE pe.employee_id = ?
     UNION
     SELECT s.id
       FROM employee_assignments a
       JOIN employees e ON e.id = a.employee_id
       JOIN sites s ON (a.site_id IS NOT NULL AND s.id = a.site_id)
                    OR (a.site_id IS NULL AND a.project_id IS NOT NULL AND s.project_id = a.project_id)
      WHERE a.employee_id = ? AND a.is_current = 1
        AND (LOWER(COALESCE(e.designation, '')) LIKE ? OR LOWER(COALESCE(a.role, '')) LIKE ?)`,
    [employeeId, employeeId, employeeId, employeeId, employeeId, ENGINEER_LIKE, ENGINEER_LIKE]
  );
  return rows.map((r) => Number(r.id));
}

/**
 * Sites this viewer receives at as a PM or site engineer, or null when the viewer
 * is not one of those roles (Admin / Warehouse / contractor have their own rules).
 * Cached on the hrScope object for the rest of the request.
 */
async function receiverSiteIds(hrScope) {
  if (!hrScope) return null;
  if (hrScope.receiverSiteIds) return hrScope.receiverSiteIds;
  let ids = null;
  if (isPmRole(hrScope.role)) ids = (hrScope.pmSiteIds || []).map(Number);
  else if (hrScope.role === ROLES.EMPLOYEE) ids = await engineerSiteIds(hrScope.employeeId);
  if (ids) hrScope.receiverSiteIds = ids; // eslint-disable-line no-param-reassign
  return ids;
}

/** True when this PM / site engineer may receive at the site. */
async function canReceiveAtSite(hrScope, siteId) {
  if (siteId == null) return false;
  const ids = await receiverSiteIds(hrScope);
  return Boolean(ids && ids.includes(Number(siteId)));
}

const isSiteReceiverRole = (hrScope) => [ROLES.PROJECT_MANAGER, ROLES.SITE_ENGINEER, ROLES.EMPLOYEE].includes(hrScope?.role);

module.exports = { engineerSiteIds, receiverSiteIds, canReceiveAtSite, isSiteReceiverRole };
