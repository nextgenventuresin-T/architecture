'use strict';

/**
 * Migration 20261009 — serial-numbered machines, verified receipts, linked costs.
 *
 * Idempotent: every step checks information_schema first, so it is safe to
 * re-run. Nothing is dropped, renamed or deleted; historic rows are only
 * back-filled where a value was previously lost (expenses.task_id, receipt
 * unit costs).
 *
 *  1. tool_units / tool_unit_history / tool_allocations / tool_rentals
 *       Physical machines keyed by a mandatory UNIQUE serial number, with
 *       health, location, allocation, rental and audit history.
 *  2. warehouse_transactions.unit_cost/total_cost/vehicle_number
 *       The actual cost travels with each stock receipt so consumption can be
 *       valued from the cost the stock was really acquired at.
 *  3. procurement_requests: tool unit link, usage-charge policy, requester role,
 *       responsible contractor, receiving verification.
 *  4. material_movements.received_vehicle_number (receipt verification trail).
 *  5. expenses.source_type/source_id/tool_unit_id (+ task_id back-fill).
 *  6. daily_work_updates.unit_cost/material_cost (consumption cost snapshot).
 *  7. attendance_records.task_id.
 */

const path = require('path');

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index]
  );
  return rows.length > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function addColumn(conn, table, column, definition, log) {
  if (!(await tableExists(conn, table))) return;
  if (await columnExists(conn, table, column)) return;
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  log(`  + ${table}.${column}`);
}

async function up(conn, log = console.log) {
  log('--- Migration 20261009: serial machines, verified receipts, linked costs ---');

  // ------------------------------------------------------------------ 1. tools
  if (!(await tableExists(conn, 'tools'))) {
    log('  ! tools table missing - skipping machine tables (run the base tool migrations first)');
  } else {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS tool_units (
      id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
      tool_id               INT UNSIGNED NOT NULL,
      serial_number         VARCHAR(80) NOT NULL,
      ownership_type        VARCHAR(20) NOT NULL DEFAULT 'owned',
      purchase_date         DATE NULL,
      expiry_date           DATE NULL,
      purchase_cost         DECIMAL(14,2) NOT NULL DEFAULT 0,
      vendor_id             INT UNSIGNED NULL,
      health                VARCHAR(12) NOT NULL DEFAULT 'good',
      health_updated_at     DATETIME NULL,
      health_updated_by     BIGINT UNSIGNED NULL,
      warehouse_id          INT UNSIGNED NULL,
      current_contractor_id INT UNSIGNED NULL,
      current_project_id    INT UNSIGNED NULL,
      current_site_id       INT UNSIGNED NULL,
      current_task_id       INT UNSIGNED NULL,
      availability_status   VARCHAR(20) NOT NULL DEFAULT 'available',
      procurement_request_id INT UNSIGNED NULL,
      notes                 VARCHAR(255) NULL,
      created_by            BIGINT UNSIGNED NULL,
      created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_tool_units_serial (serial_number),
      KEY idx_tool_units_tool (tool_id),
      KEY idx_tool_units_status (availability_status),
      KEY idx_tool_units_contractor (current_contractor_id),
      CONSTRAINT fk_tool_units_tool FOREIGN KEY (tool_id) REFERENCES tools (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS tool_unit_history (
      id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
      unit_id          INT UNSIGNED NOT NULL,
      event_type       VARCHAR(30) NOT NULL,
      from_contractor_id INT UNSIGNED NULL,
      to_contractor_id INT UNSIGNED NULL,
      project_id       INT UNSIGNED NULL,
      site_id          INT UNSIGNED NULL,
      task_id          INT UNSIGNED NULL,
      allocation_id    INT UNSIGNED NULL,
      old_value        VARCHAR(120) NULL,
      new_value        VARCHAR(120) NULL,
      amount           DECIMAL(14,2) NULL,
      details          VARCHAR(500) NULL,
      actor_user_id    BIGINT UNSIGNED NULL,
      created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_tuh_unit (unit_id, id),
      CONSTRAINT fk_tuh_unit FOREIGN KEY (unit_id) REFERENCES tool_units (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // One row per (unit, holder, period). active_unit_key is a generated column
  // that is the unit id only while the allocation is active, so the UNIQUE
  // index makes two simultaneous active allocations of one serial impossible
  // at the database level, not just in service code.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS tool_allocations (
      id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
      unit_id                INT UNSIGNED NOT NULL,
      tool_id                INT UNSIGNED NOT NULL,
      contractor_id          INT UNSIGNED NULL,
      project_id             INT UNSIGNED NULL,
      site_id                INT UNSIGNED NULL,
      task_id                INT UNSIGNED NULL,
      requested_by           BIGINT UNSIGNED NULL,
      approved_by            BIGINT UNSIGNED NULL,
      procurement_request_id INT UNSIGNED NULL,
      previous_allocation_id INT UNSIGNED NULL,
      source_kind            VARCHAR(20) NOT NULL DEFAULT 'owned',
      start_date             DATE NOT NULL,
      expected_return_date   DATE NULL,
      returned_date          DATE NULL,
      status                 VARCHAR(12) NOT NULL DEFAULT 'active',
      charge_policy          VARCHAR(20) NOT NULL DEFAULT 'none',
      approved_charge_total  DECIMAL(14,2) NULL,
      approved_charge_days   DECIMAL(10,2) NULL,
      daily_charge_rate      DECIMAL(14,4) NOT NULL DEFAULT 0,
      unused_policy          VARCHAR(20) NOT NULL DEFAULT 'actual_days',
      usage_days             DECIMAL(10,2) NULL,
      usage_charge           DECIMAL(14,2) NOT NULL DEFAULT 0,
      rental_cost_allocated  DECIMAL(14,2) NOT NULL DEFAULT 0,
      unbilled_balance       DECIMAL(14,2) NOT NULL DEFAULT 0,
      expense_id             INT UNSIGNED NULL,
      return_notes           VARCHAR(255) NULL,
      returned_by            BIGINT UNSIGNED NULL,
      created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      active_unit_key        INT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', unit_id, NULL)) VIRTUAL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_tool_alloc_one_active (active_unit_key),
      KEY idx_tool_alloc_unit (unit_id, start_date),
      KEY idx_tool_alloc_contractor (contractor_id),
      KEY idx_tool_alloc_task (task_id),
      KEY idx_tool_alloc_request (procurement_request_id),
      CONSTRAINT fk_tool_alloc_unit FOREIGN KEY (unit_id) REFERENCES tool_units (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS tool_rentals (
      id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
      unit_id                INT UNSIGNED NOT NULL,
      tool_id                INT UNSIGNED NOT NULL,
      vendor_id              INT UNSIGNED NULL,
      rate_per_day           DECIMAL(14,2) NOT NULL DEFAULT 0,
      rental_start_date      DATE NOT NULL,
      expected_return_date   DATE NULL,
      actual_return_date     DATE NULL,
      planned_days           DECIMAL(10,2) NULL,
      planned_cost           DECIMAL(14,2) NOT NULL DEFAULT 0,
      total_cost             DECIMAL(14,2) NULL,
      allocated_cost         DECIMAL(14,2) NOT NULL DEFAULT 0,
      project_id             INT UNSIGNED NULL,
      site_id                INT UNSIGNED NULL,
      task_id                INT UNSIGNED NULL,
      procurement_request_id INT UNSIGNED NULL,
      status                 VARCHAR(12) NOT NULL DEFAULT 'active',
      created_by             BIGINT UNSIGNED NULL,
      created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_tool_rentals_unit (unit_id),
      KEY idx_tool_rentals_request (procurement_request_id),
      CONSTRAINT fk_tool_rentals_unit FOREIGN KEY (unit_id) REFERENCES tool_units (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  }

  // ------------------------------------------------- 2. warehouse transactions
  await addColumn(conn, 'warehouse_transactions', 'unit_cost', 'DECIMAL(14,2) NULL', log);
  await addColumn(conn, 'warehouse_transactions', 'total_cost', 'DECIMAL(16,2) NULL', log);
  await addColumn(conn, 'warehouse_transactions', 'vehicle_number', 'VARCHAR(50) NULL', log);

  // ------------------------------------------------------ 3. procurement requests
  await addColumn(conn, 'procurement_requests', 'tool_unit_id', 'INT UNSIGNED NULL', log);
  await addColumn(conn, 'procurement_requests', 'usage_charge_total', 'DECIMAL(14,2) NULL', log);
  await addColumn(conn, 'procurement_requests', 'usage_charge_days', 'DECIMAL(10,2) NULL', log);
  await addColumn(conn, 'procurement_requests', 'usage_charge_policy', "VARCHAR(20) NULL", log);
  await addColumn(conn, 'procurement_requests', 'requester_role', 'VARCHAR(30) NULL', log);
  await addColumn(conn, 'procurement_requests', 'contractor_id', 'INT UNSIGNED NULL', log);
  await addColumn(conn, 'procurement_requests', 'received_by', 'BIGINT UNSIGNED NULL', log);
  await addColumn(conn, 'procurement_requests', 'received_vehicle_number', 'VARCHAR(50) NULL', log);

  // ----------------------------------------------------- 4. material movements
  await addColumn(conn, 'material_movements', 'received_vehicle_number', 'VARCHAR(50) NULL', log);

  // ------------------------------------------------------------- 5. expenses
  await addColumn(conn, 'expenses', 'source_type', 'VARCHAR(40) NULL', log);
  await addColumn(conn, 'expenses', 'source_id', 'INT UNSIGNED NULL', log);
  await addColumn(conn, 'expenses', 'tool_unit_id', 'INT UNSIGNED NULL', log);

  // ------------------------------------------------- 6. daily work cost snapshot
  await addColumn(conn, 'daily_work_updates', 'unit_cost', 'DECIMAL(14,4) NULL', log);
  await addColumn(conn, 'daily_work_updates', 'material_cost', 'DECIMAL(14,2) NULL', log);

  // ------------------------------------------------------- 7. attendance
  await addColumn(conn, 'attendance_records', 'task_id', 'INT UNSIGNED NULL', log);

  // --------------------------------------------------------------- back-fills
  // expenses.task_id was never persisted (EXPENSE_WRITABLE omitted it), so every
  // material-consumption expense lost its task link. daily_work_updates still
  // holds the task for each one via expense_id.
  const [r1] = await conn.query(
    `UPDATE expenses e
       JOIN daily_work_updates d ON d.expense_id = e.id
       SET e.task_id = d.task_id, e.source_type = 'daily_work_material', e.source_id = d.id
     WHERE e.task_id IS NULL AND d.task_id IS NOT NULL AND e.category = 'Material Consumption'`
  );
  if (r1.affectedRows) log(`  ~ back-filled task_id on ${r1.affectedRows} material-consumption expenses`);

  // Consumption snapshot for historic updates = the amount already booked.
  const [r2] = await conn.query(
    `UPDATE daily_work_updates d
       JOIN expenses e ON e.id = d.expense_id
       SET d.material_cost = e.amount,
           d.unit_cost = CASE WHEN d.quantity_used > 0 THEN ROUND(e.amount / d.quantity_used, 4) ELSE NULL END
     WHERE d.material_cost IS NULL AND d.quantity_used > 0`
  );
  if (r2.affectedRows) log(`  ~ back-filled cost snapshot on ${r2.affectedRows} daily work updates`);

  // Receipt unit costs: movement receipts take the movement's cost; vendor
  // receipts take the purchase rate of the request that produced them.
  const [r3] = await conn.query(
    `UPDATE warehouse_transactions wt
       JOIN material_movements mm ON mm.receive_transaction_id = wt.id
       SET wt.unit_cost = mm.cost_per_unit, wt.total_cost = ROUND(mm.cost_per_unit * wt.quantity, 2)
     WHERE wt.unit_cost IS NULL AND mm.cost_per_unit > 0`
  );
  if (r3.affectedRows) log(`  ~ back-filled cost on ${r3.affectedRows} movement receipts`);
  const [r4] = await conn.query(
    `UPDATE warehouse_transactions wt
       JOIN procurement_requests pr ON pr.warehouse_transaction_id = wt.id
       SET wt.unit_cost = pr.purchase_rate, wt.total_cost = ROUND(pr.purchase_rate * wt.quantity, 2),
           wt.procurement_request_id = COALESCE(wt.procurement_request_id, pr.id)
     WHERE wt.unit_cost IS NULL AND pr.purchase_rate > 0 AND wt.transaction_type = 'receipt'`
  );
  if (r4.affectedRows) log(`  ~ back-filled cost on ${r4.affectedRows} vendor receipts`);

  // Requester role/contractor on historic requests (best effort, display only).
  await conn.query(
    `UPDATE procurement_requests r
       JOIN users u ON u.id = r.requested_by
       JOIN roles ro ON ro.id = u.role_id
       SET r.requester_role = ro.slug
     WHERE r.requester_role IS NULL`
  ).catch(() => {});

  log('--- Migration 20261009 complete ---');
}

module.exports = { up };

if (require.main === module) {
  // Standalone: node src/db/migrations/20261009_serials_receipts_cost.js
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });
  const { pool } = require('../../config/db');
  pool.getConnection()
    .then(async (conn) => {
      try { await up(conn); } finally { conn.release(); }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
