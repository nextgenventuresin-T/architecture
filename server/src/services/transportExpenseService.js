'use strict';

const { pool } = require('../config/db');
const { TRANSPORT_CATEGORIES, transportCategoryFor } = require('../config/costBuckets');

/**
 * Transport (freight) cost of a material / machine shipment.
 *
 * The sender records transport_cost and other_expenses on the dispatch. It becomes
 * a real cost only once the shipment is received, so it is booked exactly once,
 * in the receive transaction, as one expense row:
 *   category 'Material Transport' or 'Machine Transport' (by what was shipped),
 *   source_type 'material_transport', source_id = movement id,
 *   expense_number EXP-TR-<movement id> (unique, so it can never be booked twice).
 * It is charged to the project / site / task the shipment was for, and counts under
 * Material or Machines (see config/costBuckets) in Budget vs Actual, Project Summary
 * and Profitability - never also under Miscellaneous.
 *
 * Direct vendor-to-site deliveries carry their freight on each receipt instead:
 * bookForReceipt() books EXP-TRR-<receipt id>, and bookForToolDelivery() books
 * EXP-TRM-<request id> for a machine delivered straight to site.
 */
const TRANSPORT_CATEGORY = TRANSPORT_CATEGORIES.material;

async function bookForMovement(movementId, userId = null, conn = pool) {
  const [[mm]] = await conn.query(
    `SELECT mm.id, mm.movement_number, mm.status, mm.transport_cost, mm.other_expenses,
            mm.vehicle_number, mm.received_at, mm.destination_contractor_id, mm.item_type, mm.material_id, mm.tool_id,
            COALESCE(mm.project_id, pr.project_id) AS project_id,
            COALESCE(mm.site_id, pr.site_id) AS site_id,
            pr.task_id, pr.subtask_id, pr.request_number,
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
       (expense_number, project_id, site_id, task_id, subtask_id, contractor_id, category, description, amount, expense_date,
        paid_by, party_name, payment_method, reference, status, notes, created_by, source_type, source_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Company', ?, 'other', ?, 'approved', ?, ?, 'material_transport', ?)`,
    [
      expenseNumber, mm.project_id || null, mm.site_id || null, mm.task_id || null, mm.task_id ? (mm.subtask_id || null) : null,
      mm.destination_contractor_id || null,
      transportCategoryFor(mm.item_type === 'tool' || (!mm.material_id && mm.tool_id) ? 'tool' : 'material'),
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

/** Inserts one transport expense unless that expense number already exists. Returns its id. */
async function insertOnce(conn, row) {
  const [existing] = await conn.query('SELECT id FROM expenses WHERE expense_number = ? LIMIT 1', [row.expenseNumber]);
  if (existing.length) return existing[0].id;
  const [res] = await conn.query(
    `INSERT INTO expenses
       (expense_number, project_id, site_id, task_id, subtask_id, contractor_id, category, description, amount, expense_date,
        paid_by, party_name, payment_method, reference, status, notes, created_by, source_type, source_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Company', ?, 'other', ?, 'approved', ?, ?, ?, ?)`,
    [
      row.expenseNumber, row.projectId, row.siteId || null, row.taskId || null, row.taskId ? (row.subtaskId || null) : null,
      row.contractorId || null, row.category, String(row.description).slice(0, 255), row.amount, row.date || new Date(),
      row.partyName || null, row.reference || null, row.notes || null, row.userId || null, row.sourceType, row.sourceId,
    ]
  );
  return res.insertId;
}

/**
 * Freight paid on ONE delivery of a direct vendor-to-site purchase (procurement
 * receipt). Booked once per receipt as 'Material Transport', so it counts under
 * Material. A delivery with no project (central-warehouse restock) stays on the
 * receipt only - there is no project to charge.
 */
async function bookForReceipt(receiptId, userId = null, conn = pool) {
  const [[r]] = await conn.query(
    `SELECT rc.id, rc.transport_cost, rc.receiving_date, rc.transport_expense_id,
            pr.id AS request_id, pr.request_number, pr.po_number, pr.project_id, pr.site_id, pr.task_id, pr.subtask_id,
            pr.contractor_id, pr.item_type, pr.material_id, pr.tool_id, pr.supplier, v.name AS vendor_name,
            COALESCE(m.name, t.name, 'Item') AS item_name
     FROM procurement_receipts rc
     JOIN procurement_requests pr ON pr.id = rc.procurement_request_id
     LEFT JOIN vendors v ON v.id = pr.vendor_id
     LEFT JOIN materials m ON m.id = pr.material_id
     LEFT JOIN tools t ON t.id = pr.tool_id
     WHERE rc.id = ?`,
    [receiptId]
  );
  const amount = Number(Number(r?.transport_cost || 0).toFixed(2));
  if (!r || !(amount > 0) || !r.project_id) return null;
  const id = await insertOnce(conn, {
    expenseNumber: `EXP-TRR-${r.id}`,
    projectId: r.project_id, siteId: r.site_id, taskId: r.task_id, subtaskId: r.subtask_id, contractorId: r.contractor_id,
    category: transportCategoryFor(r.item_type === 'tool' || (!r.material_id && r.tool_id) ? 'tool' : 'material'),
    description: `Transport - ${r.item_name} - ${r.po_number || r.request_number} (direct to site)`,
    amount,
    date: r.receiving_date ? new Date(r.receiving_date) : new Date(),
    partyName: r.vendor_name || r.supplier || null,
    reference: r.po_number || r.request_number,
    notes: `Freight on vendor delivery ${r.request_number}${r.po_number ? ` / ${r.po_number}` : ''}`,
    userId, sourceType: 'procurement_transport', sourceId: r.id,
  });
  await conn.query('UPDATE procurement_receipts SET transport_expense_id = ? WHERE id = ?', [id, r.id]);
  return id;
}

/**
 * Freight paid to bring a purchased / rented machine straight to site.
 * Booked once per request as 'Machine Transport', so it counts under Machines.
 */
async function bookForToolDelivery(requestId, amount, userId = null, conn = pool) {
  const value = Number(Number(amount || 0).toFixed(2));
  if (!(value > 0)) return null;
  const [[r]] = await conn.query(
    `SELECT pr.id, pr.request_number, pr.project_id, pr.site_id, pr.task_id, pr.subtask_id, pr.contractor_id,
            pr.supplier, v.name AS vendor_name, COALESCE(t.name, 'Machine') AS item_name
     FROM procurement_requests pr
     LEFT JOIN vendors v ON v.id = pr.vendor_id
     LEFT JOIN tools t ON t.id = pr.tool_id
     WHERE pr.id = ?`,
    [requestId]
  );
  if (!r || !r.project_id) return null;
  return insertOnce(conn, {
    expenseNumber: `EXP-TRM-${r.id}`,
    projectId: r.project_id, siteId: r.site_id, taskId: r.task_id, subtaskId: r.subtask_id, contractorId: r.contractor_id,
    category: TRANSPORT_CATEGORIES.machine,
    description: `Transport - ${r.item_name} - ${r.request_number} (machine delivery)`,
    amount: value,
    date: new Date(),
    partyName: r.vendor_name || r.supplier || null,
    reference: r.request_number,
    notes: `Freight to deliver machine for ${r.request_number}`,
    userId, sourceType: 'machine_transport', sourceId: r.id,
  });
}

module.exports = { bookForMovement, bookForReceipt, bookForToolDelivery, TRANSPORT_CATEGORY };
