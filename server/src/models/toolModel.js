'use strict';

const { pool } = require('../config/db');

async function findAll({ search, type, status, page = 1, pageSize = 50 } = {}) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(name LIKE ? OR code LIKE ? OR description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (type && type !== 'all') {
    where.push('type = ?');
    params.push(type);
  }
  if (status && status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT id, code, name, type, description, status, created_at
     FROM tools ${whereSql}
     ORDER BY name ASC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM tools ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM tools WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.query('SELECT id FROM tools WHERE name = ? LIMIT 1', [name]);
  return rows[0] || null;
}

async function nextCode() {
  const [rows] = await pool.query(
    "SELECT code FROM tools WHERE code LIKE 'TOOL-%' ORDER BY id DESC LIMIT 1"
  );
  if (!rows.length) return 'TOOL-0001';
  const match = rows[0].code.match(/TOOL-(\d+)/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `TOOL-${String(num).padStart(4, '0')}`;
}

async function create({ code, name, type, description, status = 'active' }) {
  const assignedCode = code || (await nextCode());
  const [result] = await pool.query(
    'INSERT INTO tools (code, name, type, description, status) VALUES (?, ?, ?, ?, ?)',
    [assignedCode, name, type, description || null, status]
  );
  return result.insertId;
}

async function update(id, { name, type, description, status }) {
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (type !== undefined) { updates.push('type = ?'); params.push(type); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }

  if (!updates.length) return;
  await pool.query(`UPDATE tools SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM tools WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = { findAll, findById, findByName, create, update, remove, nextCode };
