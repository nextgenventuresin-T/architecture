'use strict';

const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/userAccessService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** GET /api/users */
const list = asyncHandler(async (req, res) => ok(res, await service.listUsers(req.query)));

/** GET /api/users/lookups */
const lookups = asyncHandler(async (req, res) => ok(res, await service.getLookups()));

/** GET /api/users/roles */
const listRoles = asyncHandler(async (req, res) => ok(res, await service.listRoles()));

/** GET /api/users/permissions */
const listPermissions = asyncHandler(async (req, res) => ok(res, await service.listPermissions()));

/** GET /api/users/roles/:id */
const getRole = asyncHandler(async (req, res) => ok(res, await service.getRole(req.params.id)));

/** PUT /api/users/roles/:id */
const updateRole = asyncHandler(async (req, res) =>
  ok(res, await service.updateRole(req.params.id, req.body))
);

/** PUT /api/users/roles/:id/permissions */
const updateRolePermissions = asyncHandler(async (req, res) =>
  ok(res, await service.updateRolePermissions(req.params.id, req.body.permissionIds || []))
);

/** POST /api/users/change-password — the signed-in user changes their own. */
const changeOwnPassword = asyncHandler(async (req, res) =>
  ok(res, await service.changeOwnPassword(req.user.id, req.body))
);

/** GET /api/users/:id */
const detail = asyncHandler(async (req, res) => ok(res, await service.getUserDetail(req.params.id)));

/** POST /api/users */
const create = asyncHandler(async (req, res) =>
  ok(res, { user: await service.createUser(req.body, req.user.id) }, 201)
);

/** PUT /api/users/:id */
const update = asyncHandler(async (req, res) =>
  ok(res, { user: await service.updateUser(req.params.id, req.body, req.user.id) })
);

/** PATCH /api/users/:id/status */
const setStatus = asyncHandler(async (req, res) =>
  ok(res, { user: await service.setStatus(req.params.id, req.body.status, req.user.id) })
);

/** POST /api/users/:id/reset-password — admin-initiated. */
const resetPassword = asyncHandler(async (req, res) =>
  ok(res, await service.resetPassword(req.params.id, req.body))
);

/** GET /api/users/:id/access */
const getAccess = asyncHandler(async (req, res) => ok(res, await service.getUserAccess(req.params.id)));

/** PUT /api/users/:id/access/projects */
const setProjectAccess = asyncHandler(async (req, res) =>
  ok(res, await service.setUserProjectAccess(req.params.id, req.body.projectIds || [], req.user.id))
);

/** PUT /api/users/:id/access/sites */
const setSiteAccess = asyncHandler(async (req, res) =>
  ok(res, await service.setUserSiteAccess(req.params.id, req.body.siteIds || [], req.user.id))
);

/** PUT /api/users/:id/permissions */
const updateUserPermissions = asyncHandler(async (req, res) =>
  ok(res, await service.updateUserPermissions(req.params.id, req.body.permissionIds, req.body.useCustom !== false))
);

module.exports = {
  list, lookups, listRoles, listPermissions, getRole, updateRole, updateRolePermissions,
  changeOwnPassword, detail, create, update, setStatus, resetPassword,
  getAccess, setProjectAccess, setSiteAccess, updateUserPermissions,
};
