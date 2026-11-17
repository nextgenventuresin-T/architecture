'use strict';

/**
 * Migration 20261117 — columns the code saves as NULL but the Hostinger import kept NOT NULL.
 *
 * 1. Machine / tool requests have no material.
 *
 * A machine or tool line is saved with material_id = NULL and tool_id set. The Hostinger
 * database (imported from TiDB) still had procurement_requests.material_id NOT NULL, so
 * every machine / tool request failed with ER_BAD_NULL_ERROR. Material requests are
 * unaffected: they always send a material_id.
 *
 * Idempotent: only changes a column that is still NOT NULL. Keeps the existing type and
 * any foreign key (a nullable foreign key is allowed).
 */
const COLUMNS = [
  ['procurement_requests', 'material_id'],
  ['material_movements', 'material_id'],
  // Daily work logged against a TASK has no phase (phases are the older way of logging),
  // and the code saves these as NULL. The Hostinger import still had them NOT NULL, so
  // every task-based daily log failed with ER_BAD_NULL_ERROR (phase_number).
  ['daily_work_updates', 'phase_number'],
  ['daily_work_updates', 'phase_title'],
  ['daily_work_updates', 'subcategory'],
  ['daily_work_photos', 'phase_number'],
  ['daily_work_photos', 'subcategory'],
];

async function up(conn) {
  for (const [table, column] of COLUMNS) {
    const [[col]] = await conn.query(
      `SELECT IS_NULLABLE AS nullable, COLUMN_TYPE AS type FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [table, column]
    );
    if (col && col.nullable === 'NO') {
      await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${col.type} NULL`);
    }
  }
}

module.exports = { up };
