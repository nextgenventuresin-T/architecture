'use strict';

/**
 * Migration 20261010 — book transport cost of already-received shipments.
 *
 * Shipments received before transport was booked carry transport_cost /
 * other_expenses on the movement only. This books each one as its single
 * 'Material Transport' expense (EXP-TR-<movement id>). Idempotent: a movement
 * that already has its expense is skipped.
 */
const transportExpenseService = require('../../services/transportExpenseService');

async function up(conn) {
  const [rows] = await conn.query(
    `SELECT id FROM material_movements
     WHERE status = 'received' AND (COALESCE(transport_cost, 0) + COALESCE(other_expenses, 0)) > 0`
  );
  let booked = 0;
  for (const r of rows) {
    if (await transportExpenseService.bookForMovement(r.id, null, conn)) booked += 1;
  }
  return booked;
}

module.exports = { up };
