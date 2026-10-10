'use strict';

/**
 * Migration 20261010 — machines & tools in a task budget are planned by days, like labour.
 *
 * Adds task_tools.working_days. A rented machine is budgeted as
 * quantity x rate per day x days; a purchased one stays quantity x cost.
 * Idempotent and additive: existing rows keep their stored total_cost and get
 * working_days = 1, so no historical budget changes.
 */

async function up(conn) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_tools' AND COLUMN_NAME = 'working_days' LIMIT 1`
  );
  if (!rows.length) {
    await conn.query('ALTER TABLE task_tools ADD COLUMN working_days DECIMAL(10,2) NOT NULL DEFAULT 1 AFTER cost');
  }
}

module.exports = { up };
