'use strict';

const { pool } = require('../config/db');

const BASE_SELECT = `
  SELECT u.id, u.full_name, u.email, u.username, u.password_hash,
         u.preferred_language, u.is_active, u.failed_login_count,
         u.locked_until, u.last_login_at, r.slug AS role, r.name AS role_name
  FROM users u
  JOIN roles r ON r.id = u.role_id
`;

/** Looks a user up by email or username — the login field accepts either. */
async function findByIdentifier(identifier) {
  const [rows] = await pool.query(
    `${BASE_SELECT} WHERE u.email = ? OR u.username = ? LIMIT 1`,
    [identifier, identifier]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query(`${BASE_SELECT} WHERE u.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function registerFailedAttempt(userId, lockedUntil) {
  await pool.query(
    'UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = ? WHERE id = ?',
    [lockedUntil, userId]
  );
}

async function clearFailedAttempts(userId) {
  await pool.query(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?',
    [userId]
  );
}

/** Shape sent to the client. Never includes password_hash or lockout counters. */
function toPublicUser(user, permissions = []) {
  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    username: user.username,
    role: user.role,
    roleName: user.role_name,
    permissions,
    preferredLanguage: user.preferred_language,
    lastLoginAt: user.last_login_at,
  };
}

module.exports = {
  findByIdentifier,
  findById,
  registerFailedAttempt,
  clearFailedAttempts,
  toPublicUser,
};
