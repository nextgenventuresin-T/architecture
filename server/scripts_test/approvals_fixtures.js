'use strict';

/**
 * Fixtures for the Interface 12 approvals smoke test.
 *
 * Creates one test account per role and one PENDING record in each of the
 * four source modules, so the smoke test has something real to approve.
 * Re-runnable: accounts are upserted, and each run adds a fresh batch of
 * pending records (references are suffixed) rather than resetting anything
 * that already exists.
 *
 *   node scripts_test/approvals_fixtures.js
 */

const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

const suffix = String(Date.now() % 1000000);

async function upsertUser({ email, password, fullName, roleSlug }) {
  const [[role]] = await pool.query('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  if (!role) throw new Error(`Role not found: ${roleSlug}`);
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role_id, is_active)
     VALUES (?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1,
       role_id = VALUES(role_id), full_name = VALUES(full_name)`,
    [fullName, email, hash, role.id]
  );
  const [[user]] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  return user.id;
}

async function main() {
  const ids = {};
  ids.admin = await upsertUser({ email: 'admin@test.local', password: 'TestAdmin123', fullName: 'Test Admin', roleSlug: 'admin' });
  ids.hr = await upsertUser({ email: 'hr@test.local', password: 'TestHrPass123', fullName: 'Test HR', roleSlug: 'hr' });
  ids.proc = await upsertUser({ email: 'proc@test.local', password: 'TestProc123', fullName: 'Test Procurement', roleSlug: 'procurement' });
  ids.fin = await upsertUser({ email: 'fin@test.local', password: 'TestFin123', fullName: 'Test Finance', roleSlug: 'finance' });
  ids.wh = await upsertUser({ email: 'wh@test.local', password: 'TestWh123', fullName: 'Test Warehouse', roleSlug: 'warehouse' });
  ids.c1 = await upsertUser({ email: 'contractor1@test.local', password: 'TestC1Pass123', fullName: 'Contractor One', roleSlug: 'contractor' });
  ids.c2 = await upsertUser({ email: 'contractor2@test.local', password: 'TestC2Pass123', fullName: 'Contractor Two', roleSlug: 'contractor' });
  ids.emp = await upsertUser({ email: 'employee1@test.local', password: 'TestEmpPass123', fullName: 'Test Employee', roleSlug: 'employee' });

  await pool.query('UPDATE contractors SET user_id = ? WHERE id = 1', [ids.c1]);
  await pool.query('UPDATE contractors SET user_id = ? WHERE id = 2', [ids.c2]);
  await pool.query('UPDATE employees SET user_id = ? WHERE id = 1', [ids.emp]);

  const [[site]] = await pool.query('SELECT id, project_id FROM sites LIMIT 1');
  const [[material]] = await pool.query('SELECT id, unit FROM materials LIMIT 1');

  // --- general: approval_requests -----------------------------------------
  await pool.query(
    `INSERT INTO approval_requests
       (project_id, site_id, request_type, title, requested_by, amount, details, status, requested_on)
     VALUES (?, ?, 'material-request', ?, 'Site Engineer', 45000, 'Needed before Friday', 'pending', CURDATE())`,
    [site.project_id, site.id, `Extra cement for slab pour ${suffix}`]
  );

  // --- hr_labour: labour_requests -----------------------------------------
  // The contractor must own the site to raise a request against it, so the
  // site's contractor is flipped for each insert and left on contractor 1.
  await pool.query('UPDATE sites SET contractor_id = 1 WHERE id = ?', [site.id]);
  await pool.query(
    `INSERT INTO labour_requests
       (request_number, contractor_id, project_id, site_id, skill_category, quantity,
        required_date, duration_days, priority, reason, status, requested_by)
     VALUES (?, 1, ?, ?, 'mason', 4, CURDATE(), 10, 'high', 'Slab work', 'SUBMITTED', ?)`,
    [`LR-A${suffix}`, site.project_id, site.id, ids.c1]
  );

  await pool.query('UPDATE sites SET contractor_id = 2 WHERE id = ?', [site.id]);
  await pool.query(
    `INSERT INTO labour_requests
       (request_number, contractor_id, project_id, site_id, skill_category, quantity,
        required_date, duration_days, priority, reason, status, requested_by)
     VALUES (?, 2, ?, ?, 'helper', 2, CURDATE(), 5, 'low', 'Site cleanup', 'SUBMITTED', ?)`,
    [`LR-B${suffix}`, site.project_id, site.id, ids.c2]
  );
  await pool.query('UPDATE sites SET contractor_id = 1 WHERE id = ?', [site.id]);

  // --- procurement: procurement_requests ----------------------------------
  // Raised by Warehouse, so the Procurement role can legitimately approve it.
  await pool.query(
    `INSERT INTO procurement_requests
       (request_number, project_id, site_id, material_id, supplier, quantity, unit,
        estimated_rate, required_date, priority, requested_by, notes, status)
     VALUES (?, ?, ?, ?, 'ACME Supplies', 100, ?, 350, CURDATE(), 'urgent', ?, 'Urgent restock', 'pending_approval')`,
    [`PR-A${suffix}`, site.project_id, site.id, material.id, material.unit, ids.wh]
  );

  // Raised BY the procurement user, to prove nobody approves their own work.
  await pool.query(
    `INSERT INTO procurement_requests
       (request_number, project_id, site_id, material_id, supplier, quantity, unit,
        estimated_rate, required_date, priority, requested_by, notes, status)
     VALUES (?, ?, ?, ?, 'Self Supplies', 10, ?, 100, CURDATE(), 'low', ?, 'Raised by procurement themselves', 'pending_approval')`,
    [`PR-S${suffix}`, site.project_id, site.id, material.id, material.unit, ids.proc]
  );

  // --- finance: expenses ---------------------------------------------------
  await pool.query(
    `INSERT INTO expenses
       (expense_number, project_id, site_id, category, description, amount, expense_date,
        paid_by, payment_method, status, created_by)
     VALUES (?, ?, ?, 'transport', ?, 12500, CURDATE(), 'Site Office', 'cash', 'pending', ?)`,
    [`EXP-A${suffix}`, site.project_id, site.id, `Truck hire for material delivery ${suffix}`, ids.emp]
  );

  console.log(JSON.stringify({ users: ids, suffix }, null, 2));
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
