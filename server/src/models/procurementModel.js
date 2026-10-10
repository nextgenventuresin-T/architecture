'use strict';

const { pool } = require('../config/db');

/**
 * Read/write access for procurement requests and their receiving records.
 *
 * Received/remaining quantity is never stored — it is derived by summing
 * `procurement_receipts` against `ordered_quantity`, mirroring the
 * "derive, don't cache" rule schema_projects.sql set for material_entries
 * stock (see materialModel.js's STOCK_ROLLUP).
 */

const RECEIVED_ROLLUP = `
  SELECT pr.procurement_request_id,
         COALESCE(SUM(pr.received_quantity), 0) AS received_qty,
         COUNT(*)                               AS receipt_count,
         MAX(pr.receiving_date)                 AS last_received
  FROM procurement_receipts pr
  GROUP BY pr.procurement_request_id
`;

const LIST_SELECT = `
  SELECT
    r.id, r.request_number, r.project_id, r.site_id, r.task_id, pt.name AS task_name, r.material_id,
    r.is_excess, r.excess_quantity, r.excess_reason, r.planned_quantity_at_request, r.procured_quantity_at_request,
    r.supplier, r.supplier_contact, r.quantity, r.unit, r.estimated_rate,
    (r.quantity * r.estimated_rate) AS estimated_total,
    r.purchase_rate, r.total_amount, r.purchase_date, r.bill_reference,
    r.bill_file_path, r.bill_file_name, r.bill_file_type, r.bill_file_size, r.bill_uploaded_at,
    r.required_date, r.priority, r.requested_by, r.notes, r.reason, r.status,
    r.procurement_kind, r.source_type, r.destination_type,
    r.source_warehouse_id, r.destination_warehouse_id,
    r.source_contractor_id, r.destination_contractor_id,
    r.source_site_id, r.destination_site_id,
    r.warehouse_transaction_id, r.fulfilled_at,
    r.po_number, r.ordered_quantity, r.order_date, r.expected_delivery_date,
    r.created_at, r.updated_at,
    p.name AS project_name, p.code AS project_code,
    s.name AS site_name,
    m.name AS material_name, m.unit AS material_unit, m.category AS material_category, m.default_rate AS material_default_rate,
    u.full_name AS requested_by_name,
    sw.name AS source_warehouse_name, dw.name AS destination_warehouse_name,
    scn.name AS source_contractor_name, dcn.name AS destination_contractor_name,
    ss.name AS source_site_name, ds.name AS destination_site_name,
    COALESCE(rr.received_qty, 0) AS received_quantity,
    COALESCE(rr.receipt_count, 0) AS receipt_count,
    rr.last_received,
    CASE WHEN r.ordered_quantity IS NOT NULL
         THEN GREATEST(r.ordered_quantity - COALESCE(rr.received_qty, 0), 0)
         ELSE NULL END AS remaining_quantity,
    r.vendor_id, v.name AS vendor_name, v.contact_person AS vendor_contact_person, v.phone AS vendor_phone,
    r.vehicle_number, r.driver_name, r.driver_phone,
    r.challan_number, r.challan_date, r.invoice_number, r.invoice_date, r.remarks,
    r.item_type, r.tool_id, t.name AS tool_name, t.code AS tool_code, t.type AS tool_type,
    r.tool_procurement_type, r.rental_cost, r.usage_charge_rate, r.rental_days, r.rental_start_date, r.rental_end_date,
    r.amount_paid, r.amount_due, r.payment_status,
    r.tool_unit_id, tu.serial_number AS tool_unit_serial, r.usage_charge_total, r.usage_charge_days, r.usage_charge_policy,
    r.requester_role, r.contractor_id, rc.name AS responsible_contractor_name,
    r.received_by, r.received_vehicle_number
  FROM procurement_requests r
  LEFT JOIN projects p ON p.id = r.project_id
  LEFT JOIN sites s ON s.id = r.site_id
  LEFT JOIN project_tasks pt ON pt.id = r.task_id
  LEFT JOIN materials m ON m.id = r.material_id
  LEFT JOIN tools t ON t.id = r.tool_id
  LEFT JOIN users u ON u.id = r.requested_by
  LEFT JOIN warehouses sw  ON sw.id = r.source_warehouse_id
  LEFT JOIN warehouses dw  ON dw.id = r.destination_warehouse_id
  LEFT JOIN contractors scn ON scn.id = r.source_contractor_id
  LEFT JOIN contractors dcn ON dcn.id = r.destination_contractor_id
  LEFT JOIN sites ss ON ss.id = r.source_site_id
  LEFT JOIN sites ds ON ds.id = r.destination_site_id
  LEFT JOIN (${RECEIVED_ROLLUP}) rr ON rr.procurement_request_id = r.id
  LEFT JOIN vendors v ON v.id = r.vendor_id
  LEFT JOIN tool_units tu ON tu.id = r.tool_unit_id
  LEFT JOIN contractors rc ON rc.id = r.contractor_id
`;

const COUNT_FROM = `
  FROM procurement_requests r
  LEFT JOIN projects p ON p.id = r.project_id
  LEFT JOIN sites s ON s.id = r.site_id
  LEFT JOIN materials m ON m.id = r.material_id
  LEFT JOIN tools t ON t.id = r.tool_id
`;

function buildFilters({ search, status, projectId, siteId, materialId, toolId, itemType, supplier, priority, kind, contractorId, userId, pmProjectIds }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(r.request_number LIKE ? OR r.po_number LIKE ? OR m.name LIKE ? OR t.name LIKE ? OR r.supplier LIKE ? OR p.name LIKE ?)');
    params.push(...Array(6).fill(`%${search}%`));
  }
  if (status && status !== 'all') {
    where.push('r.status = ?');
    params.push(status);
  }
  if (projectId) {
    where.push('r.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId) {
    where.push('r.site_id = ?');
    params.push(Number(siteId));
  }
  if (materialId) {
    where.push('r.material_id = ?');
    params.push(Number(materialId));
  }
  if (toolId) {
    where.push('r.tool_id = ?');
    params.push(Number(toolId));
  }
  if (itemType && itemType !== 'all') {
    where.push('r.item_type = ?');
    params.push(itemType);
  }
  if (supplier) {
    where.push('r.supplier LIKE ?');
    params.push(`%${supplier}%`);
  }
  if (priority && priority !== 'all') {
    where.push('r.priority = ?');
    params.push(priority);
  }
  if (kind && kind !== 'all') {
    where.push('r.procurement_kind = ?');
    params.push(kind);
  }
  if (contractorId) {
    where.push('(r.requested_by = ? OR p.contractor_id = ? OR s.contractor_id = ? OR r.source_contractor_id = ? OR r.destination_contractor_id = ?)');
    params.push(Number(userId), Number(contractorId), Number(contractorId), Number(contractorId), Number(contractorId));
  }

  // Project Manager: only requests on their assigned projects. An empty
  // assignment list matches nothing (deny-by-default).
  if (Array.isArray(pmProjectIds)) {
    if (pmProjectIds.length === 0) {
      where.push('1 = 0');
    } else {
      where.push(`r.project_id IN (${pmProjectIds.map(() => '?').join(',')})`);
      params.push(...pmProjectIds.map(Number));
    }
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findAll({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${LIST_SELECT} ${whereSql} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total ${COUNT_FROM} ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id, { contractorId, userId, pmProjectIds } = {}) {
  const { whereSql, params } = buildFilters({ contractorId, userId, pmProjectIds });
  const ownershipSql = whereSql ? ` AND ${whereSql.slice(6)}` : '';
  const [rows] = await pool.query(`${LIST_SELECT} WHERE r.id = ?${ownershipSql} LIMIT 1`, [id, ...params]);
  return rows[0] || null;
}

async function findRawById(id, { contractorId, userId, pmProjectIds } = {}) {
  const { whereSql, params } = buildFilters({ contractorId, userId, pmProjectIds });
  const ownershipSql = whereSql ? ` AND ${whereSql.slice(6)}` : '';
  const [rows] = await pool.query(
    `SELECT r.* FROM procurement_requests r
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN sites s ON s.id = r.site_id
     WHERE r.id = ?${ownershipSql} LIMIT 1`,
    [id, ...params]
  );
  return rows[0] || null;
}

async function findByRequestNumber(requestNumber) {
  const [rows] = await pool.query(
    'SELECT id FROM procurement_requests WHERE request_number = ? LIMIT 1',
    [requestNumber]
  );
  return rows[0] || null;
}

async function findByPoNumber(poNumber) {
  const [rows] = await pool.query(
    'SELECT id FROM procurement_requests WHERE po_number = ? LIMIT 1',
    [poNumber]
  );
  return rows[0] || null;
}

/** Highest number in play, so a generated request number cannot collide. */
async function nextRequestNumber() {
  const [rows] = await pool.query(
    `SELECT GREATEST(
              COALESCE(MAX(CASE WHEN request_number REGEXP '^PR-[0-9]+$'
                                THEN CAST(SUBSTRING(request_number, 4) AS UNSIGNED) END), 0),
              COALESCE(MAX(id), 0)
            ) AS max_num
     FROM procurement_requests`
  );
  return Number(rows[0]?.max_num || 0) + 1;
}

/** Highest PO number in play, so a generated one cannot collide. */
async function nextPoNumber() {
  const [rows] = await pool.query(
    `SELECT COALESCE(MAX(CASE WHEN po_number REGEXP '^PO-[0-9]+$'
                              THEN CAST(SUBSTRING(po_number, 4) AS UNSIGNED) END), 0) AS max_num
     FROM procurement_requests`
  );
  return Number(rows[0]?.max_num || 0) + 1;
}

const WRITABLE = [
  'request_number', 'project_id', 'site_id', 'task_id', 'material_id', 'supplier',
  'supplier_contact', 'quantity', 'unit', 'estimated_rate', 'required_date',
  'priority', 'requested_by', 'notes', 'reason', 'status',
  'is_excess', 'excess_quantity', 'excess_reason', 'planned_quantity_at_request', 'procured_quantity_at_request',
  'procurement_kind', 'source_type', 'destination_type',
  'source_warehouse_id', 'destination_warehouse_id',
  'source_contractor_id', 'destination_contractor_id',
  'source_site_id', 'destination_site_id',
  'purchase_rate', 'total_amount', 'purchase_date', 'bill_reference',
  'vendor_id', 'vehicle_number', 'driver_name', 'driver_phone',
  'challan_number', 'challan_date', 'invoice_number', 'invoice_date', 'remarks',
  'item_type', 'tool_id', 'amount_paid', 'amount_due', 'payment_status',
  'tool_procurement_type', 'rental_cost', 'usage_charge_rate', 'rental_days', 'rental_start_date', 'rental_end_date',
  'tool_unit_id', 'usage_charge_total', 'usage_charge_days', 'usage_charge_policy', 'requester_role', 'contractor_id',
];

async function create(payload) {
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO procurement_requests (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

const UPDATABLE = [
  'project_id', 'site_id', 'material_id', 'supplier', 'quantity', 'unit',
  'estimated_rate', 'required_date', 'priority', 'notes',
  'purchase_rate', 'total_amount', 'purchase_date', 'bill_reference',
  'vendor_id', 'vehicle_number', 'driver_name', 'driver_phone',
  'challan_number', 'challan_date', 'invoice_number', 'invoice_date', 'remarks',
  'item_type', 'tool_id', 'amount_paid', 'amount_due', 'payment_status',
  'tool_procurement_type', 'rental_cost', 'usage_charge_rate', 'rental_days', 'rental_start_date', 'rental_end_date',
  'usage_charge_total', 'usage_charge_days', 'usage_charge_policy', 'tool_unit_id',
];

async function update(id, payload) {
  const columns = UPDATABLE.filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE procurement_requests SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

async function updatePayment(id, { amountPaid, amountDue, paymentStatus }) {
  await pool.query(
    `UPDATE procurement_requests
     SET amount_paid = ?, amount_due = ?, payment_status = ?
     WHERE id = ?`,
    [amountPaid, amountDue, paymentStatus, id]
  );
}

/** Pure status flip, used when no other field on the request changes. */
async function updateStatus(id, status) {
  await pool.query('UPDATE procurement_requests SET status = ? WHERE id = ?', [status, id]);
}

/** Moves a request into "ordered", stamping the purchase-order fields. */
async function markOrdered(id, { poNumber, orderedQuantity, orderDate, expectedDeliveryDate }) {
  await pool.query(
    `UPDATE procurement_requests
     SET status = 'ordered', po_number = ?, ordered_quantity = ?, order_date = ?, expected_delivery_date = ?
     WHERE id = ?`,
    [poNumber, orderedQuantity, orderDate, expectedDeliveryDate ?? null, id]
  );
}

// --------------------------------------------------------------- receipts

async function findReceipts(requestId) {
  const [rows] = await pool.query(
    `SELECT id, procurement_request_id, received_quantity, receiving_date, notes,
            received_by, material_entry_id, created_at
     FROM procurement_receipts
     WHERE procurement_request_id = ?
     ORDER BY receiving_date DESC, id DESC`,
    [requestId]
  );
  return rows;
}

async function findReceiptById(id) {
  const [rows] = await pool.query('SELECT * FROM procurement_receipts WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

/** Total already received against a request, before a new/edited receipt is applied. */
async function totalReceived(requestId, excludingReceiptId = null) {
  const params = [requestId];
  let sql = 'SELECT COALESCE(SUM(received_quantity), 0) AS total FROM procurement_receipts WHERE procurement_request_id = ?';
  if (excludingReceiptId) {
    sql += ' AND id <> ?';
    params.push(excludingReceiptId);
  }
  const [[row]] = await pool.query(sql, params);
  return Number(row.total || 0);
}

async function createReceipt(payload) {
  const [result] = await pool.query(
    `INSERT INTO procurement_receipts
       (procurement_request_id, received_quantity, receiving_date, notes, received_by, material_entry_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      payload.procurement_request_id,
      payload.received_quantity,
      payload.receiving_date,
      payload.notes ?? null,
      payload.received_by ?? null,
      payload.material_entry_id ?? null,
    ]
  );
  return result.insertId;
}

async function updateReceipt(id, payload) {
  const columns = ['received_quantity', 'receiving_date', 'notes'].filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE procurement_receipts SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

/** Lookup data for the request/PO forms: projects, sites, materials the caller already has access to. */
async function findSuppliers({ contractorId, userId } = {}) {
  const scope = contractorId
    ? 'AND (r.requested_by = ? OR p.contractor_id = ? OR s.contractor_id = ?)'
    : '';
  const params = contractorId ? [Number(userId), Number(contractorId), Number(contractorId)] : [];
  const [rows] = await pool.query(
    `SELECT DISTINCT r.supplier FROM procurement_requests r
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN sites s ON s.id = r.site_id
     WHERE r.supplier IS NOT NULL AND r.supplier <> '' ${scope}
     ORDER BY r.supplier`,
    params
  );
  return rows.map((row) => row.supplier);
}

/** Headline counts for the procurement overview strip. */
async function findSummary() {
  const [[row]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'draft')              AS draft,
       SUM(status = 'requested')          AS requested,
       SUM(status = 'pending_approval')   AS pending_approval,
       SUM(status = 'approved')           AS approved,
       SUM(status = 'rejected')           AS rejected,
       SUM(status = 'ordered')            AS ordered,
       SUM(status = 'partially_received') AS partially_received,
       SUM(status = 'received')           AS received,
       SUM(status = 'cancelled')          AS cancelled,
       COALESCE(SUM(quantity * estimated_rate), 0) AS estimated_value
     FROM procurement_requests`
  );
  return row;
}

/** Stamps the single warehouse-ledger movement that fulfilled a request. */
async function updateFulfilment(id, { warehouseTransactionId, status, billReference, totalAmount, purchaseRate, purchaseDate }) {
  const sets = ['warehouse_transaction_id = ?', 'fulfilled_at = NOW()', 'status = ?'];
  const params = [warehouseTransactionId ?? null, status];
  if (billReference !== undefined) { sets.push('bill_reference = ?'); params.push(billReference); }
  if (totalAmount !== undefined) { sets.push('total_amount = ?'); params.push(totalAmount); }
  if (purchaseRate !== undefined) { sets.push('purchase_rate = ?'); params.push(purchaseRate); }
  if (purchaseDate !== undefined) { sets.push('purchase_date = ?'); params.push(purchaseDate); }
  params.push(id);
  await pool.query(`UPDATE procurement_requests SET ${sets.join(', ')} WHERE id = ?`, params);
}

/** Links a real uploaded bill/invoice file to a request (or clears it). */
async function updateBillFile(id, { path = null, name = null, type = null, size = null, uploadedBy = null }) {
  await pool.query(
    `UPDATE procurement_requests
     SET bill_file_path = ?, bill_file_name = ?, bill_file_type = ?, bill_file_size = ?,
         bill_uploaded_at = ${path ? 'NOW()' : 'NULL'}, bill_uploaded_by = ?
     WHERE id = ?`,
    [path, name, type, size, uploadedBy, id]
  );
}

module.exports = {
  findAll, findById, findRawById, findByRequestNumber, findByPoNumber,
  nextRequestNumber, nextPoNumber, create, update, updateStatus, updatePayment, markOrdered,
  findReceipts, findReceiptById, totalReceived, createReceipt, updateReceipt,
  findSuppliers, findSummary, updateFulfilment, updateBillFile,
};
