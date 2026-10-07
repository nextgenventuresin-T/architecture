'use strict';

const bcrypt = require('bcryptjs');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { ROLES } = require('../config/roles');
const model = require('../models/userAccessModel');

/**
 * Business rules for Users & Access.
 *
 * Password handling goes through bcrypt with the same salt rounds the existing
 * auth system uses (env.auth.saltRounds), writing to the same
 * `users.password_hash` column. There is no second credential store and no
 * second login path.
 */

const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'];
const MIN_PASSWORD_LENGTH = 12;

// ------------------------------------------------------------------ shaping

/** Never includes password_hash — the model does not even select it. */
function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    username: row.username,
    phone: row.phone,
    department: row.department,
    role: row.role,
    roleId: row.role_id,
    roleName: row.role_name,
    status: row.is_active ? 'active' : 'inactive',
    isActive: Boolean(row.is_active),
    hasCustomPermissions: Boolean(row.has_custom_permissions),
    lastLoginAt: row.last_login_at,
    notes: row.notes,
    projectCount: Number(row.project_count || 0),
    siteCount: Number(row.site_count || 0),
    createdBy: row.created_by ? { id: row.created_by, name: row.created_by_name } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRole(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.is_active ? 'active' : 'inactive',
    isActive: Boolean(row.is_active),
    isSystem: Boolean(row.is_system),
    userCount: Number(row.user_count || 0),
    activeUserCount: Number(row.active_user_count || 0),
    permissionCount: Number(row.permission_count || 0),
    createdAt: row.created_at,
  };
}

// --------------------------------------------------------------- validation

function assertPassword(password, confirm) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      password: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }
  if (confirm !== undefined && password !== confirm) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      confirmPassword: 'The two passwords do not match.',
    });
  }
  // Length alone is weak against "aaaaaaaaaaaa"; requiring a mix of character
  // types raises the floor without frustrating a normal passphrase.
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((re) => re.test(password)).length;
  if (classes < 2) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      password: 'Mix upper case, lower case and numbers.',
    });
  }
}

async function assertUniqueLogin({ email, username, excludeId }) {
  const clash = await model.findUserByLogin({ email, username, excludeId });
  if (!clash) return;
  const field = clash.email === email ? 'email' : 'username';
  throw ApiError.badRequest('Check the highlighted fields.', {
    [field]: field === 'email' ? 'That email is already registered.' : 'That username is already taken.',
  });
}

async function resolveRole(roleIdOrSlug) {
  const roles = await model.findAllRoles();
  const role = roles.find(
    (r) => String(r.id) === String(roleIdOrSlug) || r.slug === roleIdOrSlug
  );
  if (!role) {
    throw ApiError.badRequest('Check the highlighted fields.', { role: 'Choose a valid role.' });
  }
  if (!role.is_active) {
    throw ApiError.badRequest('Check the highlighted fields.', { role: 'That role is inactive.' });
  }
  return role;
}

// -------------------------------------------------------------------- users

async function listUsers(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));

  const { rows, total } = await model.findAllUsers({ ...query, page, pageSize });

  return {
    users: rows.map(toUser),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getUser(id) {
  const row = await model.findUserById(id);
  if (!row) throw ApiError.notFound('That user does not exist.');
  return toUser(row);
}

/** Full detail: account, role, resolved module access, project/site scope, sessions. */
async function getUserDetail(id) {
  const user = await getUser(id);

  const [permissions, permissionIds, projects, sites, sessions] = await Promise.all([
    model.findPermissionsForUser(id),
    model.findUserPermissionIds(id),
    model.findUserProjects(id),
    model.findUserSites(id),
    model.findRecentSessions(id, 5),
  ]);

  // Group "module:action" strings into a per-module summary for the screen.
  const modules = new Map();
  for (const entry of permissions) {
    const [module, action] = entry.split(':');
    if (!modules.has(module)) modules.set(module, []);
    modules.get(module).push(action);
  }

  return {
    user,
    role: { slug: user.role, name: user.roleName, id: user.roleId },
    access: {
      hasCustomPermissions: user.hasCustomPermissions,
      permissionIds,
      modules: [...modules.entries()]
        .map(([module, actions]) => ({
          module,
          actions: ACTIONS.filter((a) => actions.includes(a)),
        }))
        .sort((a, b) => a.module.localeCompare(b.module)),
      projects,
      sites,
      // Surfaced so an admin can see at a glance whether this account is
      // scoped to specific projects or can reach everything.
      projectScoped: projects.length > 0,
      siteScoped: sites.length > 0,
    },
    activity: {
      lastLoginAt: user.lastLoginAt,
      sessions: sessions.map((s) => ({
        id: s.id,
        userAgent: s.user_agent,
        ipAddress: s.ip_address,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
        revokedAt: s.revoked_at,
        isActive: !s.revoked_at && new Date(s.expires_at) > new Date(),
      })),
    },
  };
}

async function createUser(payload, actorId) {
  const email = payload.email?.trim().toLowerCase();
  const username = payload.username?.trim() || null;

  if (!payload.full_name?.trim()) {
    throw ApiError.badRequest('Check the highlighted fields.', { full_name: 'Enter a full name.' });
  }
  if (!email) {
    throw ApiError.badRequest('Check the highlighted fields.', { email: 'Enter an email address.' });
  }

  assertPassword(payload.password, payload.confirmPassword);
  await assertUniqueLogin({ email, username });

  const role = await resolveRole(payload.role ?? payload.role_id);
  const passwordHash = await bcrypt.hash(payload.password, env.auth.saltRounds);

  const id = await model.createUser({
    full_name: payload.full_name.trim(),
    email,
    username,
    phone: payload.phone?.trim() || null,
    department: payload.department?.trim() || null,
    role_id: role.id,
    is_active: payload.status === 'inactive' ? 0 : 1,
    notes: payload.notes?.trim() || null,
    password_hash: passwordHash,
    created_by: actorId ?? null,
  });

  if (Array.isArray(payload.permissionIds)) {
    const all = await model.findAllPermissions();
    const valid = new Set(all.map((p) => p.id));
    const cleaned = [...new Set(payload.permissionIds.map(Number))].filter((pid) => valid.has(pid));
    await model.replaceUserPermissions(id, cleaned, true);
  }

  return getUser(id);
}

/**
 * `actorId` is the signed-in admin. Several guards below exist to stop an
 * admin locking the ERP out of its own administration.
 */
async function updateUser(id, payload, actorId) {
  const existing = await model.findUserById(id);
  if (!existing) throw ApiError.notFound('That user does not exist.');

  const email = payload.email !== undefined ? payload.email.trim().toLowerCase() : undefined;
  const username = payload.username !== undefined ? payload.username?.trim() || null : undefined;

  if (email !== undefined || username !== undefined) {
    await assertUniqueLogin({
      email: email ?? existing.email,
      username: username ?? existing.username,
      excludeId: Number(id),
    });
  }

  let roleId;
  if (payload.role !== undefined || payload.role_id !== undefined) {
    const role = await resolveRole(payload.role ?? payload.role_id);

    // An admin must not be able to demote themselves — doing so would revoke
    // the very permission needed to undo it.
    if (Number(id) === Number(actorId) && existing.role === ROLES.ADMIN && role.slug !== ROLES.ADMIN) {
      throw ApiError.badRequest('You cannot change your own role. Ask another administrator.');
    }

    // Never let the last active administrator be demoted.
    if (existing.role === ROLES.ADMIN && role.slug !== ROLES.ADMIN) {
      if ((await model.countActiveAdmins(Number(id))) === 0) {
        throw ApiError.badRequest('This is the last active administrator. Promote another user first.');
      }
    }

    roleId = role.id;
  }

  let isActive;
  if (payload.status !== undefined) {
    isActive = payload.status === 'active' ? 1 : 0;
    if (Number(id) === Number(actorId) && isActive === 0) {
      throw ApiError.badRequest('You cannot deactivate your own account.');
    }
  }

  await model.updateUser(id, {
    ...(payload.full_name !== undefined && { full_name: payload.full_name.trim() }),
    ...(email !== undefined && { email }),
    ...(username !== undefined && { username }),
    ...(payload.phone !== undefined && { phone: payload.phone?.trim() || null }),
    ...(payload.department !== undefined && { department: payload.department?.trim() || null }),
    ...(roleId !== undefined && { role_id: roleId }),
    ...(isActive !== undefined && { is_active: isActive }),
    ...(payload.notes !== undefined && { notes: payload.notes?.trim() || null }),
  });

  if (payload.permissionIds !== undefined) {
    if (Array.isArray(payload.permissionIds)) {
      const all = await model.findAllPermissions();
      const valid = new Set(all.map((p) => p.id));
      const cleaned = [...new Set(payload.permissionIds.map(Number))].filter((pid) => valid.has(pid));
      await model.replaceUserPermissions(id, cleaned, true);
    } else if (payload.permissionIds === null || payload.resetPermissionsToRole) {
      await model.replaceUserPermissions(id, [], false);
    }
  }

  return getUser(id);
}

/**
 * Activate/deactivate. Users are never deleted — historical records (expenses
 * recorded, stock issued, approvals decided) must keep pointing at a real row.
 */
async function setStatus(id, status, actorId) {
  const existing = await model.findUserById(id);
  if (!existing) throw ApiError.notFound('That user does not exist.');

  const isActive = status === 'active';

  if (!isActive && Number(id) === Number(actorId)) {
    throw ApiError.badRequest('You cannot deactivate your own account.');
  }
  if (!isActive && existing.role === ROLES.ADMIN && (await model.countActiveAdmins(Number(id))) === 0) {
    throw ApiError.badRequest('This is the last active administrator. Activate another one first.');
  }

  await model.setUserStatus(id, isActive);
  return getUser(id);
}

/** Admin-initiated reset. Revokes every existing session for that user. */
async function resetPassword(id, { password, confirmPassword }) {
  const existing = await model.findUserById(id);
  if (!existing) throw ApiError.notFound('That user does not exist.');

  assertPassword(password, confirmPassword);
  const passwordHash = await bcrypt.hash(password, env.auth.saltRounds);
  await model.setPasswordHash(id, passwordHash);

  return { id: Number(id), message: 'Password reset. Existing sessions were signed out.' };
}

/** A user changing their own password must prove the current one first. */
async function changeOwnPassword(userId, { currentPassword, password, confirmPassword }) {
  const currentHash = await model.findPasswordHash(userId);
  if (!currentHash) throw ApiError.notFound('That user does not exist.');

  const matches = await bcrypt.compare(currentPassword || '', currentHash);
  if (!matches) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      currentPassword: 'That is not your current password.',
    });
  }

  assertPassword(password, confirmPassword);
  const passwordHash = await bcrypt.hash(password, env.auth.saltRounds);
  await model.setPasswordHash(userId, passwordHash);

  return { message: 'Password changed. Other sessions were signed out.' };
}

// -------------------------------------------------------------------- roles

async function listRoles() {
  const rows = await model.findAllRoles();
  return { roles: rows.map(toRole) };
}

async function getRole(id) {
  const row = await model.findRoleById(id);
  if (!row) throw ApiError.notFound('That role does not exist.');

  const permissions = await model.findRolePermissions(id);

  return {
    role: toRole(row),
    permissions: permissions.map((p) => ({
      id: p.id, module: p.module, action: p.action, label: p.label, key: `${p.module}:${p.action}`,
    })),
  };
}

async function updateRole(id, payload) {
  const existing = await model.findRoleById(id);
  if (!existing) throw ApiError.notFound('That role does not exist.');

  // The Admin role is the system role. Deactivating it would leave nobody able
  // to administer the ERP.
  if (existing.is_system && payload.is_active === false) {
    throw ApiError.badRequest('The Administrator role cannot be deactivated.');
  }

  await model.updateRole(id, payload);
  return getRole(id);
}

// -------------------------------------------------------------- permissions

async function listPermissions() {
  const [permissions, grants, roles] = await Promise.all([
    model.findAllPermissions(),
    model.findAllRolePermissions(),
    model.findAllRoles(),
  ]);

  // Modules in a stable order, each with the actions defined for it, so the
  // matrix renders straight from the database rather than a hardcoded list.
  const modules = new Map();
  for (const p of permissions) {
    if (!modules.has(p.module)) modules.set(p.module, []);
    modules.get(p.module).push({ id: p.id, action: p.action, label: p.label, key: `${p.module}:${p.action}` });
  }

  const matrix = {};
  for (const role of roles) matrix[role.id] = [];
  for (const grant of grants) {
    if (!matrix[grant.role_id]) matrix[grant.role_id] = [];
    matrix[grant.role_id].push(`${grant.module}:${grant.action}`);
  }

  return {
    permissions: permissions.map((p) => ({ ...p, key: `${p.module}:${p.action}` })),
    modules: [...modules.entries()].map(([module, actions]) => ({ module, actions })),
    actions: ACTIONS,
    roles: roles.map(toRole),
    matrix,
  };
}

/**
 * Replaces a role's permission set.
 *
 * The Administrator role is refused outright: stripping a permission from it
 * is the one change that could make the ERP unadministrable, and there would
 * be no way back through the UI.
 */
async function updateRolePermissions(roleId, permissionIds) {
  const role = await model.findRoleById(roleId);
  if (!role) throw ApiError.notFound('That role does not exist.');

  if (role.is_system) {
    throw ApiError.badRequest('The Administrator role always has full access and cannot be edited.');
  }

  const all = await model.findAllPermissions();
  const valid = new Set(all.map((p) => p.id));
  const cleaned = [...new Set(permissionIds.map(Number))].filter((id) => valid.has(id));

  if (cleaned.length !== permissionIds.length) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      permissions: 'One or more permissions were not recognised.',
    });
  }

  await model.replaceRolePermissions(roleId, cleaned);
  return getRole(roleId);
}

// ------------------------------------------------------------ user access

async function getUserAccess(id) {
  const user = await model.findUserById(id);
  if (!user) throw ApiError.notFound('That user does not exist.');

  const [projects, sites] = await Promise.all([model.findUserProjects(id), model.findUserSites(id)]);

  return {
    userId: Number(id),
    projects,
    sites,
    projectScoped: projects.length > 0,
    siteScoped: sites.length > 0,
  };
}

async function setUserProjectAccess(id, projectIds, actorId) {
  const user = await model.findUserById(id);
  if (!user) throw ApiError.notFound('That user does not exist.');

  const ids = [...new Set((projectIds || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);

  if ((await model.countExistingProjects(ids)) !== ids.length) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      projects: 'One or more projects were not recognised.',
    });
  }

  await model.replaceUserProjectAccess(id, ids, actorId);
  return getUserAccess(id);
}

async function setUserSiteAccess(id, siteIds, actorId) {
  const user = await model.findUserById(id);
  if (!user) throw ApiError.notFound('That user does not exist.');

  const ids = [...new Set((siteIds || []).map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  const sites = await model.findSitesByIds(ids);

  if (sites.length !== ids.length) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      sites: 'One or more sites were not recognised.',
    });
  }

  // Granting a site inside a project the user cannot open would be access they
  // could never actually use, so the parent project must be granted too.
  const projectIds = await model.findUserProjectIds(id);
  if (projectIds.length > 0) {
    const orphan = sites.find((s) => !projectIds.includes(Number(s.project_id)));
    if (orphan) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        sites: 'Grant access to a site’s project before granting the site.',
      });
    }
  }

  await model.replaceUserSiteAccess(id, ids, actorId);
  return getUserAccess(id);
}

async function updateUserPermissions(id, permissionIds, useCustom = true) {
  const user = await model.findUserById(id);
  if (!user) throw ApiError.notFound('That user does not exist.');

  if (!useCustom || permissionIds === null) {
    await model.replaceUserPermissions(id, [], false);
    return getUserDetail(id);
  }

  const all = await model.findAllPermissions();
  const valid = new Set(all.map((p) => p.id));
  const cleaned = [...new Set((permissionIds || []).map(Number))].filter((pid) => valid.has(pid));
  await model.replaceUserPermissions(id, cleaned, true);
  return getUserDetail(id);
}

// ------------------------------------------------------------------ lookups

async function getLookups() {
  const projectModel = require('../models/projectModel');

  const [roles, departments, projects, summary] = await Promise.all([
    model.findAllRoles(),
    model.findDepartments(),
    projectModel.findAll({ page: 1, pageSize: 100 }),
    model.findUserSummary(),
  ]);

  return {
    roles: roles.map(toRole),
    departments,
    projects: (projects.rows || []).map((p) => ({ id: p.id, code: p.code, name: p.name })),
    statuses: ['active', 'inactive'],
    actions: ACTIONS,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    summary: {
      total: Number(summary.total || 0),
      active: Number(summary.active || 0),
      inactive: Number(summary.inactive || 0),
      haveLoggedIn: Number(summary.have_logged_in || 0),
    },
  };
}

module.exports = {
  ACTIONS, MIN_PASSWORD_LENGTH,
  listUsers, getUser, getUserDetail, createUser, updateUser, setStatus,
  resetPassword, changeOwnPassword,
  listRoles, getRole, updateRole,
  listPermissions, updateRolePermissions,
  getUserAccess, setUserProjectAccess, setUserSiteAccess, updateUserPermissions,
  getLookups, toUser, toRole,
};
