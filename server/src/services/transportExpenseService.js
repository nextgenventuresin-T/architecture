'use strict';

const { pool } = require('../config/db');

/**
 * Transport (freight) cost of a material / machine shipment.
 *
 * The sender records transport_cost and other_expenses on the dispatch. It becomes
 * a real cost only once the shipment is received, so it is booked exactly once,
 * in the receive transaction, as one expense row:
 *   category 'Material Transport', source_type 'material_transport', source_id = movement id,
 *   expense_number EXP-TR-<movement id> (unique, so it can never be booked twice).
 * It is charged to the project / site / task the shipment was for, and counts under
 * Miscellaneous in Budget vs Actual, Project Summary and Profitability.
 */
const TRANSPORT_CATEGORY = 'Material Transport';

async function bookForMovement(movementId, userId = null, conn = pool) {
  const [[mm]] = await conn.query(
    `SELECT mm.id, mm.movement_number, mm.status, mm.transport_cost, mm.other_expenses,
            mm.vehicle_number, mm.received_at, mm.destination_contractor_id,
            COALESCE(mm.project_id, pr.project_id) AS project_id,
            COALESCE(mm.site_id, pr.site_id) AS site_id,
            pr.task_id, pr.request_number,
            COALESCE(m.name, t.name, 'Item') AS item_name
     FROM material_movements mm
     LEFT JOIN procurement_requests pr ON pr.id = mm.procurement_request_id
     LEFT JOIN materials m ON m.id = mm.material_id
     LEFT JOIN tools t ON t.id = mm.tool_id
     WHERE mm.id = ?`,
    [movementId]
  );
  if (!mm || mm.status !== 'received') return null;
  const transport = Number(mm.transport_cost || 0);
  const other = Number(mm.other_expenses || 0);
  const amount = Number((transport + other).toFixed(2));
  // A shipment that is not for any project (e.g. restocking the central warehouse) has no
  // project to charge; it stays on the movement record.
  if (!(amount > 0) || !mm.project_id) return null;

  const expenseNumber = `EXP-TR-${mm.id}`;
  const [existing] = await conn.query('SELECT id FROM expenses WHERE expense_number = ? LIMIT 1', [expenseNumber]);
  if (existing.length) return existing[0].id;

  const parts = [];
  if (transport > 0) parts.push(`transport ${transport}`);
  if (other > 0) parts.push(`other ${other}`);
  const [res] = await conn.query(
    `INSERT INTO expenses
       (expense_number, project_id, site_id, task_id, contractor_id, category, description, amount, expense_date,
        paid_by, party_name, payment_method, reference, status, notes, created_by, source_type, source_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Company', ?, 'other', ?, 'approved', ?, ?, 'material_transport', ?)`,
    [
      expenseNumber, mm.project_id || null, mm.site_id || null, mm.task_id || null, mm.destination_contractor_id || null,
      TRANSPORT_CATEGORY,
      `Transport - ${mm.item_name} - ${mm.movement_number}`.slice(0, 255),
      amount,
      mm.received_at ? new Date(mm.received_at) : new Date(),
      mm.vehicle_number || null,
      mm.movement_number,
      `Shipment ${mm.movement_number}${mm.request_number ? ` (${mm.request_number})` : ''}: ${parts.join(' + ')}`,
      userId,
      mm.id,
    ]
  );
  return res.insertId;
}

module.exports = { bookForMovement, TRANSPORT_CATEGORY };
