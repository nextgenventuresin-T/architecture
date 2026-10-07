'use strict';

const { pool } = require('../config/db');

async function findAll({ search, status, page = 1, pageSize = 20 } = {}) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(name LIKE ? OR contact_person LIKE ? OR email LIKE ? OR phone LIKE ? OR pan LIKE ? OR gstin LIKE ? OR cin LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (status && status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT id, name, client_type, pan, gstin, cin, website, status,
            contact_person, email, alternate_email, phone, alternate_phone,
            address, corporate_address, billing_address,
            efy, adherence, notes, created_at, updated_at
     FROM clients ${whereSql}
     ORDER BY name ASC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM clients ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT id, name, client_type, pan, gstin, cin, website, status,
            contact_person, email, alternate_email, phone, alternate_phone,
            address, corporate_address, billing_address,
            efy, adherence, notes, created_at, updated_at
     FROM clients WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.query('SELECT id FROM clients WHERE name = ? LIMIT 1', [name]);
  return rows[0] || null;
}

const WRITABLE = [
  'name', 'client_type', 'pan', 'gstin', 'cin', 'website', 'status',
  'contact_person', 'email', 'alternate_email', 'phone', 'alternate_phone',
  'address', 'corporate_address', 'billing_address',
  'efy', 'adherence', 'notes',
];

async function create(payload) {
  const cols = WRITABLE.filter((k) => payload[k] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO clients (${cols.map((c) => `\`${c}\``).join(', ')})
     VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((k) => payload[k])
  );
  return result.insertId;
}

async function update(id, payload) {
  const cols = WRITABLE.filter((k) => payload[k] !== undefined);
  if (!cols.length) return;
  await pool.query(
    `UPDATE clients SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...cols.map((k) => payload[k]), id]
  );
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM clients WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

module.exports = { findAll, findById, findByName, create, update, remove };
