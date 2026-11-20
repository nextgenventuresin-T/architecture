'use strict';

/**
 * Migration 20261120b — purchase unit and sub-unit for materials.
 *
 * A material can be bought in one unit (kg) and used in another (units):
 *
 *   materials.purchase_unit             the unit it is bought in (kg); NULL = no sub-unit
 *   materials.units_per_purchase_unit   default sub-units in one purchase unit (1 kg = 5 units)
 *
 * When purchase_unit is set, `materials.unit` is the SUB-unit: the unit stock,
 * transfers, task plans and daily logs count in. Every existing query that reads
 * `materials.unit` therefore shows the sub-unit with no change.
 *
 *   procurement_requests.purchase_quantity        what was bought, in the purchase unit (20 kg)
 *   procurement_requests.purchase_unit            that unit (kg)
 *   procurement_requests.units_per_purchase_unit  the conversion used for this purchase (5)
 *
 * `procurement_requests.quantity` stays the quantity in the material's unit
 * (100 units), so receiving, stock and costing are unchanged.
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
  ['materials', 'purchase_unit', 'VARCHAR(20) NULL'],
  ['materials', 'units_per_purchase_unit', 'DECIMAL(14,4) NULL'],
  ['procurement_requests', 'purchase_quantity', 'DECIMAL(14,3) NULL'],
  ['procurement_requests', 'purchase_unit', 'VARCHAR(20) NULL'],
  ['procurement_requests', 'units_per_purchase_unit', 'DECIMAL(14,4) NULL'],
];

async function up(conn) {
  for (const [table, column, definition] of COLUMNS) {
    if (!(await columnExists(conn, table, column))) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`Added ${table}.${column}`);
    }
  }
}

module.exports = { up, COLUMNS };
