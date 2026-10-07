'use strict';

const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/roles');
const userAccessModel = require('../models/userAccessModel');
const { pool } = require('../config/db');

/**
 * Server-side authorization for the whole ERP.
 *
 * This is the single place permissions and project/site scope are decided.
 * Controllers call the exported middleware rather than re-implementing checks,
 * so an endpoint cannot accidentally ship without enforcement — and hiding a
 * button on the frontend is never what protects an operation.
 *
 * Permissions are resolved per request from the database, not read from the
 * JWT. A token issued before an admin revoked a permission would otherwise
 * keep working until it expired.
 */

/**
 * Small per-request cache. A single request may consult permissions several
 * times (module check, then a project scope check); this avoids re-querying
 * for each one without ever caching across requests, which would let a
 * revoked permission survive.
 */
async function loadContext(req) {
  if (req.accessContext) return req.accessContext;

  const userId = req.user?.id;
  if (!userId) throw ApiError.unauthorized();

  const [permissions, projectIds, siteIds] = await Promise.all([
    userAccessModel.findPermissionsForUser(userId),
    userAccessModel.findUserProjectIds(userId),
    userAccessModel.findUserSiteIds(userId),
  ]);

  req.accessContext = {
    userId,
    role: req.user.role,
    isAdmin: req.user.role === ROLES.ADMIN,
    permissions: new Set(permissions),
    projectIds,
    siteIds,
    // Empty means unrestricted. Interfaces 1-9 shipped before these tables
    // existed, so every pre-existing user has no rows — defaulting to "denied"
    // would lock the whole organisation out. Scoping switches on per user the
    // moment an admin grants their first explicit project.
    projectScoped: projectIds.length > 0,
    siteScoped: siteIds.length > 0,
  };

  return req.accessContext;
}

/** True when the user's role holds `module:action`. Admin always passes. */
async function can(req, module, action) {
  const context = await loadContext(req);
  if (context.isAdmin) return true;
  return context.permissions.has(`${module}:${action}`);
}

/**
 * Requires a module permission.
 * e.g. router.post('/', requireAuth, requirePermission('projects', 'create'), ...)
 */
function requirePermission(module, action) {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(ApiError.unauthorized());
      if (await can(req, module, action)) return next();
      return next(
        ApiError.forbidden(`You do not have permission to ${action} ${module.replace(/_/g, ' ')}.`)
      );
    } catch (error) {
      return next(error);
    }
  };
}

/** True when the user may see this project. */
async function canAccessProject(req, projectId) {
  if (projectId === null || projectId === undefined) return true;
  const context = await loadContext(req);
  if (req.hrScope?.role === ROLES.CONTRACTOR) {
    const [[project]] = await pool.query(
      'SELECT id FROM projects WHERE id = ? AND (contractor_id = ? OR id IN (SELECT project_id FROM sites WHERE contractor_id = ?)) LIMIT 1',
      [projectId, req.hrScope.contractorId, req.hrScope.contractorId]
    );
    return Boolean(project);
  }
  if (context.isAdmin || !context.projectScoped) return true;
  return context.projectIds.includes(Number(projectId));
}

/** True when the user may see this site. */
async function canAccessSite(req, siteId) {
  if (siteId === null || siteId === undefined) return true;
  const context = await loadContext(req);
  if (context.isAdmin || !context.siteScoped) return true;
  return context.siteIds.includes(Number(siteId));
}

/**
 * Blocks ID-tampering on project-scoped routes: changing /api/projects/12 to
 * /api/projects/13 is refused unless 13 is genuinely granted.
 *
 * Returns 404 rather than 403 on purpose — a 403 would confirm that project 13
 * exists, which leaks the shape of the data to someone with no access to it.
 */
function requireProjectAccess(param = 'id') {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(ApiError.unauthorized());
      const projectId = req.params[param] ?? req.body?.project_id;
      if (await canAccessProject(req, projectId)) return next();
      return next(ApiError.notFound('That project does not exist.'));
    } catch (error) {
      return next(error);
    }
  };
}

function requireSiteAccess(param = 'id') {
  return async (req, res, next) => {
    try {
      if (!req.user) return next(ApiError.unauthorized());
      const siteId = req.params[param] ?? req.body?.site_id;
      if (await canAccessSite(req, siteId)) return next();
      return next(ApiError.notFound('That site does not exist.'));
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * Attaches scope to the request without blocking, so list endpoints can filter
 * their results down to what the user may see.
 */
function attachAccessContext() {
  return async (req, res, next) => {
    try {
      if (req.user) await loadContext(req);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  loadContext, can, canAccessProject, canAccessSite,
  requirePermission, requireProjectAccess, requireSiteAccess, attachAccessContext,
};
