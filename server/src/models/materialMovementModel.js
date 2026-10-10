'use strict';

const { pool } = require('../config/db');

/**
 * Read/write for the contractor material-movement lifecycle
 * (SEND -> IN TRANSIT -> RECEIVE). Stock itself lives in the warehouse ledger;
 * this table only records the shipment, its transport details and its PO link.
 */

const LIST_SELECT = `
  SELECT
    mm.id, mm.movement_number, mm.item_type, mm.material_id, mm.tool_id, mm.unit,
    mm.source_warehouse_id, mm.destination_warehouse_id,
    mm.source_contractor_id, mm.destination_contractor_id,
    mm.project_id, mm.site_id,
    mm.requested_quantity, mm.sent_quantity, mm.received_quantity,
    mm.status, mm.vehicle_number, mm.driver_name, mm.driver_phone,
    mm.transport_cost, mm.other_expenses, mm.reference, mm.remarks,
    mm.cost_per_unit, mm.total_cost,
    mm.procurement_request_id, mm.issue_transaction_id, mm.receive_transaction_id,
    mm.sent_by, mm.sent_at, mm.received_by, mm.received_at, mm.received_vehicle_number,
    mm.created_at, mm.updated_at,
    m.name AS material_name, m.category AS material_category, m.default_rate AS material_default_rate,
    t.name AS tool_name, t.code AS tool_code, t.type AS tool_type,
    sw.name AS source_warehouse_name, sw.contractor_id AS source_warehouse_contractor_id,
    dw.name AS destination_warehouse_name, dw.contractor_id AS destination_warehouse_contractor_id,
    sc.name AS source_contractor_name, dc.name AS destination_contractor_name,
    p.name AS project_name, s.name AS site_name,
    su.full_name AS sent_by_name, ru.full_name AS received_by_name,
    pr.request_number AS procurement_request_number,
    pr.requested_by AS procurement_requested_by,
    pr.source_contractor_id AS procurement_source_contractor_id,
    pr.destination_contractor_id AS procurement_dest_contractor_id,
    pr.purchase_rate AS procurement_purchase_rate,
    pr.estimated_rate AS procurement_estimated_rate,
    pr.total_amount AS procurement_total_amount,
    pr.task_id AS procurement_task_id,
    pt.name AS procurement_task_name,
    pr.procurement_kind
  FROM material_movements mm
  LEFT JOIN materials m ON m.id = mm.material_id
  LEFT JOIN tools t ON t.id = mm.tool_id
  JOIN warehouses sw ON sw.id = mm.source_warehouse_id
  JOIN warehouses dw ON dw.id = mm.destination_warehouse_id
  LEFT JOIN contractors sc ON sc.id = mm.source_contractor_id
  LEFT JOIN contractors dc ON dc.id = mm.destination_contractor_id
  LEFT JOIN projects p ON p.id = mm.project_id
  LEFT JOIN sites s ON s.id = mm.site_id
  LEFT JOIN users su ON su.id = mm.sent_by
  LEFT JOIN users ru ON ru.id = mm.received_by
  LEFT JOIN procurement_requests pr ON pr.id = mm.procurement_request_id
  LEFT JOIN project_tasks pt ON pt.id = pr.task_id
`;

function buildFilters({ status, materialId, contractorId, userId, incomingForContractorId, direction, pmProjectIds }) {
  const where = [];
  const params = [];
  if (status && status !== 'all') { where.push('mm.status = ?'); params.push(status); }
  if (materialId) { where.push('mm.material_id = ?'); params.push(Number(materialId)); }
  // A contractor may see ONLY movements directly involving them:
  // - Central Warehouse -> their warehouse
  // - Another Contractor -> their warehouse
  // - Their warehouse -> another Contractor
  // - Outside Supplier -> their warehouse
  // - Materials they personally procure from outside
  // - Any movement where they are source or destination.
  if (contractorId) {
    const cId = Number(contractorId);
    if (userId) {
      where.push(`(
        mm.source_contractor_id = ?
        OR mm.destination_contractor_id = ?
        OR sw.contractor_id = ?
        OR dw.contractor_id = ?
        OR pr.source_contractor_id = ?
        OR pr.destination_contractor_id = ?
        OR (pr.requested_by = ? AND pr.procurement_kind IN ('outside_supplier', 'contractor_supply'))
      )`);
      params.push(cId, cId, cId, cId, cId, cId, Number(userId));
    } else {
      where.push(`(
        mm.source_contractor_id = ?
        OR mm.destination_contractor_id = ?
        OR sw.contractor_id = ?
        OR dw.contractor_id = ?
        OR pr.source_contractor_id = ?
        OR pr.destination_contractor_id = ?
      )`);
      params.push(cId, cId, cId, cId, cId, cId);
    }
  }
  // Incoming queue: still-in-transit shipments addressed to this contractor or their warehouse.
  if (incomingForContractorId) {
    const cId = Number(incomingForContractorId);
    where.push("(mm.destination_contractor_id = ? OR dw.contractor_id = ? OR pr.destination_contractor_id = ?) AND mm.status = 'in_transit'");
    params.push(cId, cId, cId);
  }
  if (direction === 'outgoing' && contractorId) {
    const cId = Number(contractorId);
    where.push('(mm.source_contractor_id = ? OR sw.contractor_id = ? OR pr.source_contractor_id = ?)');
    params.push(cId, cId, cId);
  }
  // Project Manager: movements on their assigned projects only (deny-by-default).
  if (Array.isArray(pmProjectIds)) {
    if (pmProjectIds.length === 0) {
      where.push('1 = 0');
    } else {
      const ph = pmProjectIds.map(() => '?').join(',');
      where.push(`(mm.project_id IN (${ph}) OR pr.project_id IN (${ph}))`);
      params.push(...pmProjectIds.map(Number), ...pmProjectIds.map(Number));
    }
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findAll(filters = {}) {
  const { whereSql, params } = buildFilters(filters);
  const [rows] = await pool.query(`${LIST_SELECT} ${whereSql} ORDER BY mm.sent_at DESC, mm.id DESC`, params);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(`${LIST_SELECT} WHERE mm.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function nextMovementNumber() {
  const [rows] = await pool.query(
    `SELECT COALESCE(MAX(CASE WHEN movement_number REGEXP '^MV-[0-9]+$'
                              THEN CAST(SUBSTRING(movement_number, 4) AS UNSIGNED) END), 0) AS max_num
     FROM material_movements`
  );
  return Number(rows[0]?.max_num || 0) + 1;
}

const WRITABLE = [
  'movement_number', 'item_type', 'material_id', 'tool_id', 'unit', 'source_warehouse_id', 'destination_warehouse_id',
  'source_contractor_id', 'destination_contractor_id', 'project_id', 'site_id',
  'requested_quantity', 'sent_quantity', 'status', 'vehicle_number', 'driver_name',
  'driver_phone', 'transport_cost', 'other_expenses', 'reference', 'remarks',
  'procurement_request_id', 'issue_transaction_id', 'sent_by',
  'cost_per_unit', 'total_cost',
];

async function create(payload, conn = null) {
  const columns = WRITABLE.filter((k) => payload[k] !== undefined);
  const [result] = await (conn || pool).query(
    `INSERT INTO material_movements (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((k) => payload[k])
  );
  return result.insertId;
}

async function markReceived(id, { receivedQuantity, receiveTransactionId, receivedBy, receivedVehicleNumber }, conn = null) {
  // `AND status = 'in_transit'` makes the flip itself the duplicate-receipt
  // guard: a second receive matches no row and reports false.
  const [result] = await (conn || pool).query(
    `UPDATE material_movements
     SET status = 'received', received_quantity = ?, receive_transaction_id = ?,
         received_by = ?, received_at = NOW(), received_vehicle_number = ?
     WHERE id = ? AND status = 'in_transit'`,
    [receivedQuantity, receiveTransactionId ?? null, receivedBy ?? null, receivedVehicleNumber ?? null, id]
  );
  return result.affectedRows === 1;
}

/** Row lock used by receiving, so two simultaneous receives serialise. */
async function lockById(id, conn) {
  const [rows] = await conn.query('SELECT id, status FROM material_movements WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

async function findByRequestId(procurementRequestId) {
  const [rows] = await pool.query(
    `${LIST_SELECT} WHERE mm.procurement_request_id = ? ORDER BY mm.id DESC LIMIT 1`,
    [procurementRequestId]
  );
  return rows[0] || null;
}

module.exports = { findAll, findById, findByRequestId, nextMovementNumber, create, markReceived, lockById };
