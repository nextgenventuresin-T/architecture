'use strict';

const { pool } = require('../config/db');

/**
 * Resolves the actual cost per unit for a material:
 * 1. Latest external procurement purchase_rate > 0
 * 2. Latest material_entries rate > 0
 * 3. materials.default_rate
 * 4. Fallback: 0
 */
async function getActualMaterialRate(materialId) {
  if (!materialId) return 0;

  // 1. Check procurement requests (favouring received purchases, else ordered/approved)
  const [prRows] = await pool.query(
    `SELECT purchase_rate FROM procurement_requests
     WHERE material_id = ? AND purchase_rate IS NOT NULL AND purchase_rate > 0
     ORDER BY (status = 'received') DESC, id DESC LIMIT 1`,
    [materialId]
  );
  if (prRows.length && Number(prRows[0].purchase_rate) > 0) {
    return Number(prRows[0].purchase_rate);
  }

  // 2. Check material entries
  try {
    const [entryRows] = await pool.query(
      `SELECT rate FROM material_entries
       WHERE material_id = ? AND rate IS NOT NULL AND rate > 0
       ORDER BY id DESC LIMIT 1`,
      [materialId]
    );
    if (entryRows.length && Number(entryRows[0].rate) > 0) {
      return Number(entryRows[0].rate);
    }
  } catch (_) {}

  // 3. Fallback to material master default_rate
  const [matRows] = await pool.query(
    `SELECT default_rate FROM materials WHERE id = ? LIMIT 1`,
    [materialId]
  );
  if (matRows.length && Number(matRows[0].default_rate) > 0) {
    return Number(matRows[0].default_rate);
  }

  return 0;
}

/**
 * Cost per unit of material CONSUMED out of one warehouse.
 *
 * The cost is linked to where the stock actually came from, in this order:
 *   1. the issue ledger row (weighted-average cost of the warehouse's costed
 *      receipts - vendor purchases and inbound movements carry their real cost),
 *   2. the warehouse's weighted average computed now,
 *   3. the latest actual purchase rate for the material (legacy stock that was
 *      received before receipts carried a cost).
 * Never the catalogue default alone - that is what produced zero material cost.
 */
async function getConsumptionUnitCost({ warehouseId, materialId, issueTx }) {
  const fromTx = issueTx && (issueTx.unitCost ?? issueTx.unit_cost);
  if (fromTx && Number(fromTx) > 0) return Number(fromTx);
  if (warehouseId && materialId) {
    const warehouseModel = require('../models/warehouseModel');
    const avg = await warehouseModel.averageUnitCost(warehouseId, materialId);
    if (avg && avg > 0) return avg;
  }
  return getActualMaterialRate(materialId);
}

module.exports = { getActualMaterialRate, getConsumptionUnitCost };
