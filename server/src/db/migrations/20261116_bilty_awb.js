'use strict';

/**
 * Migration 20261116 — Bilty / AWB number on vendor deliveries.
 *
 *   procurement_requests.bilty_number           recorded when the vendor confirms (replaces
 *                                               the vehicle number as the delivery token)
 *   procurement_requests.received_bilty_number  what the receiver entered on arrival
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

async function up(conn) {
  for (const column of ['bilty_number', 'received_bilty_number']) {
    if (!(await columnExists(conn, 'procurement_requests', column))) {
      await conn.query(`ALTER TABLE \`procurement_requests\` ADD COLUMN \`${column}\` VARCHAR(60) NULL`);
    }
  }
}

module.exports = { up };
