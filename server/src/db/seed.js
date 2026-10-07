'use strict';

/**
 * Creates the first administrator from environment variables so no credential
 * is ever written into the repository. Run with `npm run db:seed` after
 * setting SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env.
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const env = require('../config/env');
const { ROLES } = require('../config/roles');

async function seed() {
  const email = (process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || '';
  const fullName = process.env.SEED_ADMIN_NAME || 'System Administrator';

  if (!email || !password) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env before seeding.');
  }
  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
  }

  const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ? LIMIT 1', [ROLES.ADMIN]);
  if (!role) {
    throw new Error('Role "admin" is missing. Run `npm run db:migrate` first.');
  }

  const passwordHash = await bcrypt.hash(password, env.auth.saltRounds);

  await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role_id, is_active)
     VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1`,
    [fullName, email, passwordHash, role.id]
  );

  console.log(`Administrator ready: ${email}`);
}

seed()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('Seed failed:', error.message);
    await pool.end();
    process.exit(1);
  });
