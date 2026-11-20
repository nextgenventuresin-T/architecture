'use strict';

/**
 * Sub-units: a material bought in one unit (kg) and used in another (units).
 *
 * Storage (see migration 20261120_material_sub_units):
 *   materials.unit                     the unit stock is counted in (the sub-unit when set)
 *   materials.purchase_unit            the unit it is bought in; NULL = no sub-unit
 *   materials.units_per_purchase_unit  default sub-units in one purchase unit
 *
 * When a sub-unit is first given to a material that already has records, every
 * record of it is converted into the sub-unit in one transaction: quantities are
 * multiplied by the conversion and per-unit rates divided by it, so totals (and
 * stock value) stay the same. 50 kg at Rs 100/kg -> 250 units at Rs 20/unit.
 */
const { pool } = require('../config/db');

const r = (n) => Number(Number(n).toFixed(4));

/**
 * Records that hold a quantity or rate of a material. `where` selects the
 * material's rows (one `?` = material id); `multiply` are quantities, `divide`
 * are per-unit rates, `unit` is a copied unit label. Columns a database does
 * not have are skipped.
 */
const RECORDS = [
  { table: 'warehouse_stock', where: 'material_id = ?', multiply: ['quantity'] },
  { table: 'warehouse_transactions', where: 'material_id = ?', multiply: ['quantity'], divide: ['unit_cost'], unit: 'unit' },
  {
    table: 'material_movements', where: "material_id = ? AND (item_type IS NULL OR item_type <> 'tool')",
    multiply: ['requested_quantity', 'sent_quantity', 'received_quantity'], divide: ['cost_per_unit'], unit: 'unit',
  },
  {
    // The purchase columns are set first: MySQL applies SET left to right, so they
    // still see the original quantity / unit.
    table: 'procurement_requests', where: "material_id = ? AND (item_type IS NULL OR item_type <> 'tool')",
    purchase: true,
    multiply: ['quantity', 'excess_quantity', 'planned_quantity_at_request', 'procured_quantity_at_request', 'ordered_quantity'],
    divide: ['estimated_rate', 'purchase_rate'], unit: 'unit',
  },
  {
    table: 'procurement_receipts',
    where: "procurement_request_id IN (SELECT id FROM procurement_requests WHERE material_id = ? AND (item_type IS NULL OR item_type <> 'tool'))",
    multiply: ['received_quantity'],
  },
  { table: 'material_entries', where: 'material_id = ?', multiply: ['quantity', 'used_quantity'], divide: ['rate'] },
  { table: 'task_materials', where: 'material_id = ?', multiply: ['quantity', 'approved_additional_quantity'], divide: ['cost_per_unit'] },
  { table: 'project_phase_materials', where: 'material_id = ?', multiply: ['quantity'], divide: ['cost_per_unit'] },
  { table: 'daily_work_updates', where: 'material_id = ?', multiply: ['quantity_used'], divide: ['unit_cost'], unit: 'unit' },
];

async function columnsOf(conn, table) {
  const [rows] = await conn.query(
    'SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table]
  );
  return new Set(rows.map((row) => row.c));
}

/** True when anything (stock, purchases, plans, logs) refers to this material. */
async function hasRecords(materialId, conn = pool) {
  for (const rec of RECORDS) {
    const cols = await columnsOf(conn, rec.table);
    if (!cols.size) continue;
    const [[row]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${rec.table}\` WHERE ${rec.where}`, [materialId]);
    if (Number(row.n) > 0) return true;
  }
  return false;
}

/**
 * Converts every record of a material into its new sub-unit.
 * `purchaseUnit` is the unit the old records were in (kg), `subUnit` the new one.
 * Returns the number of rows changed. Runs inside the caller's transaction.
 */
async function convertRecords(conn, materialId, { factor, purchaseUnit, subUnit }) {
  const f = Number(factor);
  if (!(f > 0)) throw new Error('A conversion greater than 0 is needed.');
  let changed = 0;
  for (const rec of RECORDS) {
    const cols = await columnsOf(conn, rec.table);
    if (!cols.size) continue;
    const sets = [];
    const args = [];
    if (rec.purchase && cols.has('purchase_quantity')) {
      sets.push('purchase_quantity = COALESCE(purchase_quantity, quantity)');
      sets.push('purchase_unit = COALESCE(purchase_unit, ?)'); args.push(purchaseUnit);
      sets.push('units_per_purchase_unit = COALESCE(units_per_purchase_unit, ?)'); args.push(f);
    }
    for (const c of rec.multiply || []) if (cols.has(c)) { sets.push(`\`${c}\` = \`${c}\` * ?`); args.push(f); }
    for (const c of rec.divide || []) if (cols.has(c)) { sets.push(`\`${c}\` = \`${c}\` / ?`); args.push(f); }
    if (rec.unit && cols.has(rec.unit)) { sets.push(`\`${rec.unit}\` = ?`); args.push(subUnit); }
    if (!sets.length) continue;
    const [result] = await conn.query(`UPDATE \`${rec.table}\` SET ${sets.join(', ')} WHERE ${rec.where}`, [...args, materialId]);
    changed += result.affectedRows || 0;
  }
  return changed;
}

/** A renamed sub-unit: rewrite the unit label on the records that keep a copy. */
async function renameUnitCopies(conn, materialId, subUnit) {
  for (const rec of RECORDS) {
    if (!rec.unit) continue;
    const cols = await columnsOf(conn, rec.table);
    if (!cols.has(rec.unit)) continue;
    await conn.query(`UPDATE \`${rec.table}\` SET \`${rec.unit}\` = ? WHERE ${rec.where}`, [subUnit, materialId]);
  }
}

/**
 * Units for one purchase of a material: quantity in the material's own unit for a
 * purchase quantity, using the given conversion or the material's default.
 * Returns null when the material has no sub-unit or nothing usable was given.
 */
function stockQuantityFor(material, purchaseQuantity, unitsPerPurchaseUnit) {
  if (!material?.purchase_unit) return null;
  const pq = Number(purchaseQuantity);
  const f = Number(unitsPerPurchaseUnit) > 0 ? Number(unitsPerPurchaseUnit) : Number(material.units_per_purchase_unit);
  if (!(pq > 0) || !(f > 0)) return null;
  return { quantity: Number((pq * f).toFixed(2)), purchaseQuantity: r(pq), factor: r(f), purchaseUnit: material.purchase_unit };
}

module.exports = { RECORDS, hasRecords, convertRecords, renameUnitCopies, stockQuantityFor };
