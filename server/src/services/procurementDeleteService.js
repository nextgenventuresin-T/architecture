'use strict';

/**
 * Deleting a procurement request (Admin only), undoing what it created:
 *   - stock it received (receipt transactions) or issued (dispatch transactions),
 *     including the dispatches (material movements) made for it
 *   - stock entries and receipts from its deliveries
 *   - transport expenses booked against it
 * Refused, with the reason, when undoing would leave the books wrong:
 *   - delivered material has since been used or moved (stock would go negative)
 *   - a vendor payment is recorded against it
 *   - machines have been allocated / registered from it
 * Everything runs in one transaction: either it is all undone, or nothing is.
 */
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

const refuse = (message) => { throw ApiError.badRequest(message); };

async function deleteRequest(id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[request]] = await conn.query('SELECT * FROM procurement_requests WHERE id = ? FOR UPDATE', [id]);
    if (!request) throw ApiError.notFound('That procurement request does not exist.');
    const label = request.request_number || `#${id}`;

    // Payments are real money - they are removed in Finance first, never silently.
    const [[paid]] = await conn.query('SELECT COUNT(*) AS n FROM vendor_payments WHERE procurement_request_id = ?', [id]);
    if (Number(paid.n) > 0 || Number(request.amount_paid || 0) > 0) {
      refuse(`${label} has a vendor payment recorded. Remove the payment in Finance first, then delete it.`);
    }

    // Machines registered / allocated from it are tracked by serial number.
    const [[machines]] = await conn.query(
      `SELECT (SELECT COUNT(*) FROM tool_allocations WHERE procurement_request_id = ?)
            + (SELECT COUNT(*) FROM tool_units WHERE procurement_request_id = ?)
            + (SELECT COUNT(*) FROM tool_rentals WHERE procurement_request_id = ?) AS n`,
      [id, id, id]
    ).catch(() => [[{ n: 0 }]]);
    if (Number(machines.n) > 0) {
      refuse(`Machines have already been allocated or registered from ${label}. Return them first, then delete it.`);
    }

    const [receipts] = await conn.query('SELECT id, material_entry_id FROM procurement_receipts WHERE procurement_request_id = ?', [id]);
    const [movements] = await conn.query(
      'SELECT id, issue_transaction_id, receive_transaction_id FROM material_movements WHERE procurement_request_id = ?',
      [id]
    );
    const receiptIds = receipts.map((r) => r.id);
    const movementIds = movements.map((m) => m.id);

    // Every stock transaction it caused.
    const txIds = new Set();
    const [direct] = await conn.query(
      `SELECT id FROM warehouse_transactions
       WHERE procurement_request_id = ? ${receiptIds.length ? 'OR procurement_receipt_id IN (?)' : ''}`,
      receiptIds.length ? [id, receiptIds] : [id]
    );
    direct.forEach((t) => txIds.add(t.id));
    movements.forEach((m) => { if (m.issue_transaction_id) txIds.add(m.issue_transaction_id); if (m.receive_transaction_id) txIds.add(m.receive_transaction_id); });
    if (request.warehouse_transaction_id) txIds.add(request.warehouse_transaction_id);

    let transactions = [];
    if (txIds.size) {
      [transactions] = await conn.query('SELECT * FROM warehouse_transactions WHERE id IN (?)', [[...txIds]]);
    }
    const unsupported = transactions.find((t) => !['receipt', 'issue'].includes(t.transaction_type));
    if (unsupported) {
      refuse(`${label} has a stock ${unsupported.transaction_type} (${unsupported.transaction_number}) that cannot be undone automatically. Adjust that stock by hand, then delete it.`);
    }

    // Net stock change per slot: a receipt is taken back out, an issue is put back.
    const slots = new Map();
    for (const t of transactions) {
      const key = [t.warehouse_id, t.material_id, t.project_id ?? '', t.site_id ?? ''].join('|');
      const slot = slots.get(key) || { warehouseId: t.warehouse_id, materialId: t.material_id, projectId: t.project_id, siteId: t.site_id, delta: 0 };
      slot.delta += t.transaction_type === 'receipt' ? -Number(t.quantity) : Number(t.quantity);
      slots.set(key, slot);
    }
    for (const s of slots.values()) {
      const [[row]] = await conn.query(
        `SELECT ws.id, ws.quantity, m.name, m.unit FROM warehouse_stock ws JOIN materials m ON m.id = ws.material_id
         WHERE ws.warehouse_id = ? AND ws.material_id = ? AND ws.project_id <=> ? AND ws.site_id <=> ? FOR UPDATE`,
        [s.warehouseId, s.materialId, s.projectId ?? null, s.siteId ?? null]
      );
      const have = Number(row?.quantity || 0);
      if (have + s.delta < -0.0001) {
        refuse(`Some of the material from ${label} has already been used or moved (only ${have} ${row?.unit || ''} of ${row?.name || 'it'} is left where it was delivered). Delete is not possible.`);
      }
      s.rowId = row?.id || null;
    }

    // Stock entries from its deliveries must not have been used either.
    const entryIds = receipts.map((r) => r.material_entry_id).filter(Boolean);
    if (entryIds.length) {
      const [[used]] = await conn.query('SELECT COALESCE(SUM(used_quantity), 0) AS u FROM material_entries WHERE id IN (?)', [entryIds]);
      if (Number(used.u) > 0) refuse(`Material delivered by ${label} has already been used on site. Delete is not possible.`);
    }

    // ---- Undo.
    for (const s of slots.values()) {
      if (s.rowId && s.delta) await conn.query('UPDATE warehouse_stock SET quantity = quantity + ? WHERE id = ?', [s.delta, s.rowId]);
    }
    const expenseWhere = ["(source_type = 'machine_transport' AND source_id = ?)"];
    const expenseArgs = [id];
    if (receiptIds.length) { expenseWhere.push("(source_type = 'procurement_transport' AND source_id IN (?))"); expenseArgs.push(receiptIds); }
    if (movementIds.length) { expenseWhere.push("(source_type = 'material_transport' AND source_id IN (?))"); expenseArgs.push(movementIds); }
    await conn.query(`DELETE FROM expenses WHERE ${expenseWhere.join(' OR ')}`, expenseArgs);

    await conn.query('UPDATE procurement_requests SET warehouse_transaction_id = NULL WHERE id = ?', [id]);
    if (movementIds.length) {
      await conn.query('UPDATE material_movements SET issue_transaction_id = NULL, receive_transaction_id = NULL WHERE id IN (?)', [movementIds]);
    }
    if (txIds.size) await conn.query('DELETE FROM warehouse_transactions WHERE id IN (?)', [[...txIds]]);
    if (movementIds.length) await conn.query('DELETE FROM material_movements WHERE id IN (?)', [movementIds]);
    if (receiptIds.length) await conn.query('DELETE FROM procurement_receipts WHERE id IN (?)', [receiptIds]);
    if (entryIds.length) await conn.query('DELETE FROM material_entries WHERE id IN (?)', [entryIds]);
    await conn.query('DELETE FROM procurement_requests WHERE id = ?', [id]);
    if (request.batch_id) {
      await conn.query(
        'DELETE FROM procurement_batches WHERE id = ? AND NOT EXISTS (SELECT 1 FROM procurement_requests WHERE batch_id = ?)',
        [request.batch_id, request.batch_id]
      );
    }

    await conn.commit();
    return {
      deleted: label,
      undone: { stockEntries: transactions.length, dispatches: movementIds.length, receipts: receiptIds.length },
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { deleteRequest };
