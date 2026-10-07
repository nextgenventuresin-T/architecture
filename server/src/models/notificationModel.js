'use strict';

const { pool } = require('../config/db');

async function findAll({
  userId = null,
  role = null,
  isRead = null,
  category = null,
  type = null,
  search = '',
  page = 1,
  pageSize = 20,
} = {}) {
  const offset = (Number(page) - 1) * Number(pageSize);
  const whereClauses = [];
  const params = [];

  // Scoping: visible if broadcast (user_id IS NULL) or specifically for this user
  if (userId) {
    whereClauses.push('(user_id IS NULL OR user_id = ?)');
    params.push(Number(userId));
  }

  // Scoping: visible if no role specified or matches user's role or 'all'
  if (role) {
    whereClauses.push('(role IS NULL OR role = ? OR role = "all")');
    params.push(role);
  }

  if (isRead !== null && isRead !== undefined && isRead !== 'all') {
    whereClauses.push('is_read = ?');
    params.push(isRead === true || isRead === '1' || isRead === 1 ? 1 : 0);
  }

  if (category && category !== 'all') {
    whereClauses.push('category = ?');
    params.push(category);
  }

  if (type && type !== 'all') {
    whereClauses.push('type = ?');
    params.push(type);
  }

  if (search && search.trim()) {
    whereClauses.push('(title LIKE ? OR message LIKE ?)');
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Get total matching
  const countSql = `SELECT COUNT(*) AS total FROM notifications ${whereSql}`;
  const [[{ total }]] = await pool.query(countSql, params);

  // Get unread count for current user scope
  const unreadParams = [];
  const unreadWhere = ['is_read = 0'];
  if (userId) {
    unreadWhere.push('(user_id IS NULL OR user_id = ?)');
    unreadParams.push(Number(userId));
  }
  if (role) {
    unreadWhere.push('(role IS NULL OR role = ? OR role = "all")');
    unreadParams.push(role);
  }
  const [[{ unreadCount }]] = await pool.query(
    `SELECT COUNT(*) AS unreadCount FROM notifications WHERE ${unreadWhere.join(' AND ')}`,
    unreadParams
  );

  // Get paginated rows
  const dataSql = `
    SELECT
      id,
      user_id,
      role,
      title,
      message,
      type,
      category,
      action_url,
      is_read,
      read_at,
      metadata,
      created_at,
      updated_at
    FROM notifications
    ${whereSql}
    ORDER BY is_read ASC, created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(dataSql, [...params, Number(pageSize), Number(offset)]);

  const notifications = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    role: r.role,
    title: r.title,
    message: r.message,
    type: r.type,
    category: r.category,
    actionUrl: r.action_url,
    isRead: Boolean(r.is_read),
    readAt: r.read_at,
    metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return {
    notifications,
    total: Number(total || 0),
    unreadCount: Number(unreadCount || 0),
  };
}

async function countUnread({ userId = null, role = null } = {}) {
  const whereClauses = ['is_read = 0'];
  const params = [];

  if (userId) {
    whereClauses.push('(user_id IS NULL OR user_id = ?)');
    params.push(Number(userId));
  }
  if (role) {
    whereClauses.push('(role IS NULL OR role = ? OR role = "all")');
    params.push(role);
  }

  const [[{ count }]] = await pool.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE ${whereClauses.join(' AND ')}`,
    params
  );
  return Number(count || 0);
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ? LIMIT 1', [Number(id)]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    userId: r.user_id,
    role: r.role,
    title: r.title,
    message: r.message,
    type: r.type,
    category: r.category,
    actionUrl: r.action_url,
    isRead: Boolean(r.is_read),
    readAt: r.read_at,
    metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function markAsRead(id) {
  await pool.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ?', [Number(id)]);
  return findById(id);
}

async function markAllAsRead({ userId = null, role = null } = {}) {
  const whereClauses = ['is_read = 0'];
  const params = [];

  if (userId) {
    whereClauses.push('(user_id IS NULL OR user_id = ?)');
    params.push(Number(userId));
  }
  if (role) {
    whereClauses.push('(role IS NULL OR role = ? OR role = "all")');
    params.push(role);
  }

  const [res] = await pool.query(
    `UPDATE notifications SET is_read = 1, read_at = NOW() WHERE ${whereClauses.join(' AND ')}`,
    params
  );
  return { affectedRows: res.affectedRows };
}

async function deleteById(id) {
  await pool.query('DELETE FROM notifications WHERE id = ?', [Number(id)]);
  return true;
}

async function clearAllRead({ userId = null, role = null } = {}) {
  const whereClauses = ['is_read = 1'];
  const params = [];

  if (userId) {
    whereClauses.push('(user_id IS NULL OR user_id = ?)');
    params.push(Number(userId));
  }
  if (role) {
    whereClauses.push('(role IS NULL OR role = ? OR role = "all")');
    params.push(role);
  }

  const [res] = await pool.query(
    `DELETE FROM notifications WHERE ${whereClauses.join(' AND ')}`,
    params
  );
  return { affectedRows: res.affectedRows };
}

async function create({
  userId = null,
  role = null,
  title,
  message,
  type = 'info',
  category = 'system',
  actionUrl = null,
  metadata = null,
}) {
  const metaJson = metadata ? JSON.stringify(metadata) : null;
  const [res] = await pool.query(
    `INSERT INTO notifications (user_id, role, title, message, type, category, action_url, metadata, is_read)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [userId, role, title, message, type, category, actionUrl, metaJson]
  );
  return findById(res.insertId);
}

module.exports = {
  findAll,
  countUnread,
  findById,
  markAsRead,
  markAllAsRead,
  deleteById,
  clearAllRead,
  create,
};
