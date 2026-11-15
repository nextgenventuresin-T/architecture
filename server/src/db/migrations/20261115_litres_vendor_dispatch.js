'use strict';

/**
 * Migration 20261115b — litres for bucket / liquid materials, and vendor dispatch confirmation.
 *
 *   procurement_requests.litres_per_unit    litres in one unit (e.g. 20 L per bucket); NULL = not a liquid
 *   procurement_requests.total_litres       litres ordered (quantity x litres_per_unit, or typed)
 *   procurement_requests.vendor_confirmed_at / vendor_confirmed_by
 *                                           when the vendor confirmed the order and the dispatch
 *                                           (vehicle / driver / challan) was recorded
 *   material_movements.sent_litres / received_litres   litres sent / received on a movement
 *   daily_work_updates.litres_used          litres consumed in a day's work
 *
 * Purely additive and idempotent: existing rows keep NULL.
 */
async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}
async function tableExists(conn, table) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
    [table]
  );
  return rows.length > 0;
}

const COLUMNS = [
  ['procurement_requests', 'litres_per_unit', 'DECIMAL(12,3) NULL'],
  ['procurement_requests', 'total_litres', 'DECIMAL(14,3) NULL'],
  ['procurement_requests', 'vendor_confirmed_at', 'DATETIME NULL'],
  ['procurement_requests', 'vendor_confirmed_by', 'BIGINT UNSIGNED NULL'],
  ['material_movements', 'sent_litres', 'DECIMAL(14,3) NULL'],
  ['material_movements', 'received_litres', 'DECIMAL(14,3) NULL'],
  ['daily_work_updates', 'litres_used', 'DECIMAL(14,3) NULL'],
];

async function up(conn) {
  for (const [table, column, type] of COLUMNS) {
    if (!(await tableExists(conn, table))) continue;
    if (!(await columnExists(conn, table, column))) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`);
    }
  }
  // Vendor deliveries already carrying a vehicle were, in effect, already confirmed.
  await conn.query(
    `UPDATE procurement_requests SET vendor_confirmed_at = COALESCE(updated_at, created_at)
     WHERE vendor_confirmed_at IS NULL AND source_type = 'supplier' AND vehicle_number IS NOT NULL AND vehicle_number <> ''`
  );
}

module.exports = { up };
