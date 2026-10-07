'use strict';

const { pool } = require('../config/db');

/**
 * Data access for Interface 10.
 *
 * The `users` and `roles` tables are the ones Interface 1 created — this
 * module reads and writes those, it does not shadow them. `password_hash` is
 * never included in any SELECT that reaches a service, so a hash cannot leak
 * into an API response by accident.
 */

// Deliberately no password_hash, failed_login_count or locked_until here.
const USER_SELECT = `
  SELECT u.id, u.full_name, u.email, u.username, u.phone, u.department,
         u.is_active, u.has_custom_permissions, u.last_login_at, u.notes, u.created_by,
         u.preferred_language, u.created_at, u.updated_at,
         r.id AS role_id, r.slug AS role, r.name AS role_name,
         creator.full_name AS created_by_name,
         (SELECT COUNT(*) FROM user_project_access upa WHERE upa.user_id = u.id) AS project_count,
         (SELECT COUNT(*) FROM user_site_access usa WHERE usa.user_id = u.id)    AS site_count
  FROM users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN users creator ON creator.id = u.created_by
`;

function buildUserFilters({ search, role, status, projectId, siteId }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.username LIKE ? OR u.department LIKE ?)');
    params.push(...Array(4).fill(`%${search}%`));
  }
  if (role && role !== 'all') {
    where.push('r.slug = ?');
    params.push(role);
  }
  if (status && status !== 'all') {
    where.push('u.is_active = ?');
    params.push(status === 'active' ? 1 : 0);
  }
  if (projectId && projectId !== 'all') {
    where.push('EXISTS (SELECT 1 FROM user_project_access upa WHERE upa.user_id = u.id AND upa.project_id = ?)');
    params.push(Number(projectId));
  }
  if (siteId && siteId !== 'all') {
    where.push('EXISTS (SELECT 1 FROM user_site_access usa WHERE usa.user_id = u.id AND usa.site_id = ?)');
    params.push(Number(siteId));
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findAllUsers({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildUserFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${USER_SELECT} ${whereSql} ORDER BY u.full_name LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findUserById(id) {
  const [rows] = await pool.query(`${USER_SELECT} WHERE u.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

/** Email/username uniqueness check, optionally ignoring the user being edited. */
async function findUserByLogin({ email, username, excludeId = null }) {
  const clauses = [];
  const params = [];

  if (email) {
    clauses.push('u.email = ?');
    params.push(email);
  }
  if (username) {
    clauses.push('u.username = ?');
    params.push(username);
  }
  if (clauses.length === 0) return null;

  let sql = `SELECT u.id, u.email, u.username FROM users u WHERE (${clauses.join(' OR ')})`;
  if (excludeId) {
    sql += ' AND u.id <> ?';
    params.push(excludeId);
  }

  const [rows] = await pool.query(`${sql} LIMIT 1`, params);
  return rows[0] || null;
}

const USER_WRITABLE = [
  'full_name', 'email', 'username', 'phone', 'department',
  'role_id', 'is_active', 'notes', 'password_hash', 'created_by',
];

async function createUser(payload) {
  const columns = USER_WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO users (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

const USER_UPDATABLE = [
  'full_name', 'email', 'username', 'phone', 'department', 'role_id', 'is_active', 'notes',
];

async function updateUser(id, payload) {
  const columns = USER_UPDATABLE.filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE users SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

async function setUserStatus(id, isActive) {
  await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
}

/**
 * Writes a new bcrypt digest and clears any lockout, so an admin reset also
 * frees an account locked by failed attempts. Every refresh token for that
 * user is revoked in the same breath — a password change must not leave an
 * old session alive.
 */
async function setPasswordHash(id, passwordHash) {
  await pool.query(
    'UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?',
    [passwordHash, id]
  );
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [id]
  );
}

/** Used only to verify a user's own current password before changing it. */
async function findPasswordHash(id) {
  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [id]);
  return rows[0]?.password_hash || null;
}

async function countActiveAdmins(excludeUserId = null) {
  const params = [];
  let sql = `SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id
             WHERE r.slug = 'admin' AND u.is_active = 1`;
  if (excludeUserId) {
    sql += ' AND u.id <> ?';
    params.push(excludeUserId);
  }
  const [[row]] = await pool.query(sql, params);
  return Number(row.total || 0);
}

// ------------------------------------------------------------------- roles

async function findAllRoles() {
  const [rows] = await pool.query(
    `SELECT r.id, r.slug, r.name, r.description, r.is_active, r.is_system, r.created_at,
            (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id)                 AS user_count,
            (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id AND u.is_active) AS active_user_count,
            (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id)    AS permission_count
     FROM roles r
     ORDER BY r.is_system DESC, r.name`
  );
  return rows;
}

async function findRoleById(id) {
  const [rows] = await pool.query(
    `SELECT r.id, r.slug, r.name, r.description, r.is_active, r.is_system, r.created_at,
            (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
     FROM roles r WHERE r.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findRoleBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM roles WHERE slug = ? LIMIT 1', [slug]);
  return rows[0] || null;
}

async function updateRole(id, { name, description, is_active: isActive }) {
  const sets = [];
  const params = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (description !== undefined) { sets.push('description = ?'); params.push(description); }
  if (isActive !== undefined) { sets.push('is_active = ?'); params.push(isActive ? 1 : 0); }
  if (sets.length === 0) return;
  await pool.query(`UPDATE roles SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

// ------------------------------------------------------------- permissions

async function findAllPermissions() {
  const [rows] = await pool.query(
    'SELECT id, module, action, label FROM permissions ORDER BY module, FIELD(action, ?, ?, ?, ?, ?)',
    ['view', 'create', 'edit', 'delete', 'approve']
  );
  return rows;
}

async function findRolePermissions(roleId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.module, p.action, p.label
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ?`,
    [roleId]
  );
  return rows;
}

/** Every role's grants at once, for the matrix screen. */
async function findAllRolePermissions() {
  const [rows] = await pool.query(
    `SELECT rp.role_id, p.module, p.action
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id`
  );
  return rows;
}

/**
 * Replaces a role's grants wholesale, inside a transaction so the role is
 * never briefly left with no permissions at all.
 */
async function replaceRolePermissions(roleId, permissionIds) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    if (permissionIds.length > 0) {
      await conn.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ${permissionIds.map(() => '(?, ?)').join(', ')}`,
        permissionIds.flatMap((permissionId) => [roleId, permissionId])
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * The permission set for one user. If `has_custom_permissions` is true,
 * it resolves through `user_permissions`. Otherwise it resolves through their role.
 * Returned as "module:action" strings, which is what the authorization middleware checks.
 */
async function findPermissionsForUser(userId) {
  const [user] = await pool.query('SELECT is_active, has_custom_permissions, role_id FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!user[0] || !user[0].is_active) return [];

  if (user[0].has_custom_permissions) {
    const [rows] = await pool.query(
      `SELECT CONCAT(p.module, ':', p.action) AS permission
       FROM user_permissions up
       JOIN permissions p ON p.id = up.permission_id
       WHERE up.user_id = ?`,
      [userId]
    );
    return rows.map((row) => row.permission);
  }

  const [rows] = await pool.query(
    `SELECT CONCAT(p.module, ':', p.action) AS permission
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE u.id = ? AND u.is_active = 1 AND r.is_active = 1`,
    [userId]
  );
  return rows.map((row) => row.permission);
}

/**
 * Returns an array of permission IDs granted to the user, either from
 * `user_permissions` (if custom) or from `role_permissions` (default).
 */
async function findUserPermissionIds(userId) {
  const [user] = await pool.query('SELECT has_custom_permissions, role_id FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!user[0]) return [];

  if (user[0].has_custom_permissions) {
    const [rows] = await pool.query('SELECT permission_id FROM user_permissions WHERE user_id = ?', [userId]);
    return rows.map((r) => Number(r.permission_id));
  }

  const [rows] = await pool.query('SELECT permission_id FROM role_permissions WHERE role_id = ?', [user[0].role_id]);
  return rows.map((r) => Number(r.permission_id));
}

/**
 * Atomically replaces a user's individual custom permissions.
 * If useCustom is false, marks has_custom_permissions = 0 and clears user_permissions,
 * resetting the user to role-based permissions.
 */
async function replaceUserPermissions(userId, permissionIds, useCustom = true) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE users SET has_custom_permissions = ? WHERE id = ?', [useCustom ? 1 : 0, userId]);
    await conn.query('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
    if (useCustom && permissionIds && permissionIds.length > 0) {
      await conn.query(
        `INSERT INTO user_permissions (user_id, permission_id) VALUES ${permissionIds.map(() => '(?, ?)').join(', ')}`,
        permissionIds.flatMap((permissionId) => [userId, Number(permissionId)])
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ----------------------------------------------------------- scoped access

async function findUserProjectIds(userId) {
  const [rows] = await pool.query('SELECT project_id FROM user_project_access WHERE user_id = ?', [userId]);
  return rows.map((row) => Number(row.project_id));
}

async function findUserSiteIds(userId) {
  const [rows] = await pool.query('SELECT site_id FROM user_site_access WHERE user_id = ?', [userId]);
  return rows.map((row) => Number(row.site_id));
}

async function findUserProjects(userId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.code, p.name, p.status
     FROM user_project_access upa
     JOIN projects p ON p.id = upa.project_id
     WHERE upa.user_id = ?
     ORDER BY p.name`,
    [userId]
  );
  return rows;
}

async function findUserSites(userId) {
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.project_id, p.name AS project_name
     FROM user_site_access usa
     JOIN sites s ON s.id = usa.site_id
     LEFT JOIN projects p ON p.id = s.project_id
     WHERE usa.user_id = ?
     ORDER BY p.name, s.name`,
    [userId]
  );
  return rows;
}

async function replaceUserProjectAccess(userId, projectIds, grantedBy) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM user_project_access WHERE user_id = ?', [userId]);
    if (projectIds.length > 0) {
      await conn.query(
        `INSERT INTO user_project_access (user_id, project_id, granted_by)
         VALUES ${projectIds.map(() => '(?, ?, ?)').join(', ')}`,
        projectIds.flatMap((projectId) => [userId, projectId, grantedBy ?? null])
      );
    }
    // A site whose project is no longer granted would be unreachable, so those
    // rows are cleared in the same transaction rather than left dangling.
    if (projectIds.length > 0) {
      await conn.query(
        `DELETE usa FROM user_site_access usa
         JOIN sites s ON s.id = usa.site_id
         WHERE usa.user_id = ? AND s.project_id NOT IN (${projectIds.map(() => '?').join(', ')})`,
        [userId, ...projectIds]
      );
    } else {
      await conn.query('DELETE FROM user_site_access WHERE user_id = ?', [userId]);
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function replaceUserSiteAccess(userId, siteIds, grantedBy) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM user_site_access WHERE user_id = ?', [userId]);
    if (siteIds.length > 0) {
      await conn.query(
        `INSERT INTO user_site_access (user_id, site_id, granted_by)
         VALUES ${siteIds.map(() => '(?, ?, ?)').join(', ')}`,
        siteIds.flatMap((siteId) => [userId, siteId, grantedBy ?? null])
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/** Confirms every id exists before granting, so access cannot point at nothing. */
async function countExistingProjects(ids) {
  if (ids.length === 0) return 0;
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM projects WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids
  );
  return Number(row.total || 0);
}

async function findSitesByIds(ids) {
  if (ids.length === 0) return [];
  const [rows] = await pool.query(
    `SELECT id, project_id FROM sites WHERE id IN (${ids.map(() => '?').join(', ')})`,
    ids
  );
  return rows;
}

/** Recent sessions, derived from refresh_tokens — no new tracking table. */
async function findRecentSessions(userId, limit = 5) {
  const [rows] = await pool.query(
    `SELECT id, user_agent, ip_address, created_at, expires_at, revoked_at
     FROM refresh_tokens
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, Number(limit)]
  );
  return rows;
}

async function findDepartments() {
  const [rows] = await pool.query(
    "SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department <> '' ORDER BY department"
  );
  return rows.map((row) => row.department);
}

async function findUserSummary() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(is_active = 1) AS active,
            SUM(is_active = 0) AS inactive,
            SUM(last_login_at IS NOT NULL) AS have_logged_in
     FROM users`
  );
  return row;
}

module.exports = {
  findAllUsers, findUserById, findUserByLogin, createUser, updateUser,
  setUserStatus, setPasswordHash, findPasswordHash, countActiveAdmins,
  findAllRoles, findRoleById, findRoleBySlug, updateRole,
  findAllPermissions, findRolePermissions, findAllRolePermissions,
  replaceRolePermissions, findPermissionsForUser, findUserPermissionIds, replaceUserPermissions,
  findUserProjectIds, findUserSiteIds, findUserProjects, findUserSites,
  replaceUserProjectAccess, replaceUserSiteAccess,
  countExistingProjects, findSitesByIds,
  findRecentSessions, findDepartments, findUserSummary,
};
