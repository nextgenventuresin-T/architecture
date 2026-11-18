'use strict';

/**
 * Applies the small, additive column migrations at startup, so a deploy (e.g. to
 * Hostinger, where there is no shell to run `npm run db:migrate`) brings its own
 * database up to date. Each migration only ADDS missing columns and is idempotent:
 * on a database that already has them it does nothing. No data is copied or exported.
 */
const { pool } = require('../config/db');

const STARTUP_MIGRATIONS = [
  '20261115_area_measure_engineer_receiving',
  '20261115_litres_vendor_dispatch',
  '20261116_bilty_awb',
  '20261116_named_attendance',
  '20261117_tool_requests_nullable_material',
  '20261117_restore_failed_daily_log_stock',
  '20261118_site_teams',
  '20261118_area_progress',
];

const startup = { startedAt: new Date().toISOString(), migrationErrors: [] };

/** Columns the current code reads; reported by /api/health so a deploy can be checked. */
const REQUIRED_COLUMNS = [
  ['projects', 'area_value'], ['sites', 'area_value'], ['task_subtasks', 'area_value'],
  ['procurement_requests', 'litres_per_unit'], ['procurement_requests', 'vendor_confirmed_at'],
  ['procurement_requests', 'bilty_number'], ['procurement_requests', 'received_bilty_number'],
  ['material_movements', 'sent_litres'], ['daily_work_updates', 'litres_used'],
  ['project_tasks', 'area_value'], ['daily_work_updates', 'area_done'],
  ['labour_records', 'worker_name'], ['labour_records', 'worker_id'], ['labour_records', 'worker_type'],
];

async function missingColumns() {
  const [rows] = await pool.query(
    `SELECT CONCAT(TABLE_NAME, '.', COLUMN_NAME) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND (${REQUIRED_COLUMNS.map(() => '(TABLE_NAME = ? AND COLUMN_NAME = ?)').join(' OR ')})`,
    REQUIRED_COLUMNS.flat()
  );
  const have = new Set(rows.map((r) => r.c));
  return REQUIRED_COLUMNS.map(([t, c]) => `${t}.${c}`).filter((k) => !have.has(k));
}

async function ensureSchema() {
  const conn = await pool.getConnection();
  try {
    for (const name of STARTUP_MIGRATIONS) {
      try {
        await require(`./migrations/${name}`).up(conn);
      } catch (error) {
        // Never block the app from starting; the log says what to fix.
        console.error(`Startup migration ${name} failed: ${error.message}`);
        startup.migrationErrors.push(`${name}: ${error.code || ''} ${String(error.message).slice(0, 200)}`);
      }
    }
  } finally {
    conn.release();
  }
}

module.exports = { ensureSchema, missingColumns, startup };
