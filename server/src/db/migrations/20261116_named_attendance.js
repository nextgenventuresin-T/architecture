'use strict';

/**
 * Migration 20261116b — name-wise labour attendance.
 *
 *   labour_records.worker_id / worker_name / worker_type
 *     one row per person picked from the Labour Directory (NULL for older crew-count rows)
 *
 * Purely additive and idempotent.
 */
async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

const COLUMNS = [
  ['worker_id', 'INT UNSIGNED NULL'],
  ['worker_name', 'VARCHAR(150) NULL'],
  ['worker_type', 'VARCHAR(30) NULL'],
];

async function up(conn) {
  for (const [column, type] of COLUMNS) {
    if (!(await columnExists(conn, 'labour_records', column))) {
      await conn.query(`ALTER TABLE \`labour_records\` ADD COLUMN \`${column}\` ${type}`);
    }
  }
}

module.exports = { up };
