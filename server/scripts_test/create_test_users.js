'use strict';
process.env.DB_USER = 'erp';
process.env.DB_PASSWORD = 'erp_pw';
process.env.DB_NAME = 'architecture_erp';

const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

async function upsertUser({ email, password, fullName, roleSlug }) {
  const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  if (!role) throw new Error(`Role not found: ${roleSlug}`);
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role_id, is_active)
     VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1, role_id = VALUES(role_id)`,
    [fullName, email, hash, role.id]
  );
  const [[user]] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  return user.id;
}

async function main() {
  const hrUserId = await upsertUser({ email: 'hr@test.local', password: 'TestHrPass123', fullName: 'Test HR', roleSlug: 'hr' });
  const c1UserId = await upsertUser({ email: 'contractor1@test.local', password: 'TestC1Pass123', fullName: 'Contractor One', roleSlug: 'contractor' });
  const c2UserId = await upsertUser({ email: 'contractor2@test.local', password: 'TestC2Pass123', fullName: 'Contractor Two', roleSlug: 'contractor' });
  const empUserId = await upsertUser({ email: 'employee1@test.local', password: 'TestEmpPass123', fullName: 'Test Employee', roleSlug: 'employee' });

  await pool.query('UPDATE contractors SET user_id = ? WHERE id = 1', [c1UserId]);
  await pool.query('UPDATE contractors SET user_id = ? WHERE id = 2', [c2UserId]);
  await pool.query('UPDATE employees SET user_id = ? WHERE id = 1', [empUserId]);

  console.log(JSON.stringify({ hrUserId, c1UserId, c2UserId, empUserId }, null, 2));
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
