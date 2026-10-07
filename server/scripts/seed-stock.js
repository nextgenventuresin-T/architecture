'use strict';

/**
 * Seed opening stock into a warehouse THROUGH the warehouse ledger.
 *
 * This creates a proper `warehouse_transactions` receipt and updates
 * `warehouse_stock` — the single source of truth — instead of editing stock
 * tables directly. Use it to give a warehouse some starting quantity of a
 * material (e.g. so it can be dispatched to a contractor).
 *
 * Usage:
 *   node scripts/seed-stock.js "Sand" 10000
 *   node scripts/seed-stock.js "Sand" 10000 "Main Store"
 *
 * Args: <materialName> <quantity> [warehouseName]
 *   materialName   – matched case-insensitively; created if it does not exist.
 *   quantity       – how much to add.
 *   warehouseName  – optional; defaults to the (first) central company warehouse.
 */

require('dotenv').config();
const { pool } = require('../src/config/db');
const warehouseService = require('../src/services/warehouseService');
const warehouseModel = require('../src/models/warehouseModel');

const MATERIAL = process.argv[2] || 'Sand';
const QUANTITY = Number(process.argv[3] || 10000);
const WAREHOUSE = process.argv[4] || null; // null => central

async function main() {
  if (!(QUANTITY > 0)) throw new Error('Quantity must be greater than zero.');

  // 1) Resolve the material (create a master row if missing — identity only).
  let [[material]] = await pool.query(
    'SELECT id, name, unit FROM materials WHERE LOWER(name) = LOWER(?) OR LOWER(name) LIKE LOWER(?) LIMIT 1',
    [MATERIAL, `${MATERIAL}%`]
  );
  if (!material) {
    const [res] = await pool.query(
      "INSERT INTO materials (name, category, unit) VALUES (?, 'Aggregate', 'cu.m')",
      [MATERIAL]
    );
    material = { id: res.insertId, name: MATERIAL, unit: 'cu.m' };
    console.log(`Created material master: ${material.name} (id ${material.id})`);
  }

  // 2) Resolve the destination warehouse (default: central company warehouse).
  await warehouseModel.ensureContractorWarehouses();
  let warehouseId;
  let warehouseName;
  if (WAREHOUSE) {
    const [[w]] = await pool.query('SELECT id, name FROM warehouses WHERE LOWER(name) = LOWER(?) LIMIT 1', [WAREHOUSE]);
    if (!w) throw new Error(`Warehouse "${WAREHOUSE}" not found.`);
    warehouseId = w.id; warehouseName = w.name;
  } else {
    const { central } = await warehouseModel.findScopes();
    if (!central.length) throw new Error('No central company warehouse is configured.');
    warehouseId = central[0].id; warehouseName = central[0].name;
  }

  const before = await stock(warehouseId, material.id);

  // 3) Add the stock via the ledger (creates a receipt transaction).
  const tx = await warehouseService.receiveStock({
    material_id: material.id,
    warehouse_id: warehouseId,
    quantity: QUANTITY,
    unit: material.unit,
    reference: 'OPENING-STOCK',
    notes: 'Seeded opening stock',
  }, null);

  const after = await stock(warehouseId, material.id);
  console.log(`Received ${QUANTITY} ${material.unit} of ${material.name} into ${warehouseName}.`);
  console.log(`  transaction id : ${tx.id}`);
  console.log(`  stock ${before} -> ${after} ${material.unit}`);
}

async function stock(w, m) {
  const [[r]] = await pool.query(
    'SELECT COALESCE(SUM(quantity),0) q FROM warehouse_stock WHERE warehouse_id=? AND material_id=?',
    [w, m]
  );
  return Number(r.q);
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
