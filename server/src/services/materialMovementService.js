'use strict';

const ApiError = require('../utils/ApiError');
const { pool } = require('../config/db');
const { ROLES } = require('../config/roles');
const movementModel = require('../models/materialMovementModel');
const warehouseModel = require('../models/warehouseModel');
const warehouseService = require('./warehouseService');
const materialModel = require('../models/materialModel');
const procurementModel = require('../models/procurementModel');

function num(v) { return v === null || v === undefined ? null : Number(v); }

function toMovement(row) {
  if (!row) return null;
  const costPerUnit = num(row.procurement_purchase_rate) || num(row.procurement_estimated_rate) || num(row.material_default_rate) || 0;
  const qty = num(row.sent_quantity) != null ? num(row.sent_quantity) : (num(row.requested_quantity) || 0);
  const totalMaterialCost = num(row.procurement_total_amount) != null
    ? num(row.procurement_total_amount)
    : Number((qty * costPerUnit).toFixed(2));

  return {
    id: row.id,
    movementNumber: row.movement_number,
    material: { id: row.material_id, name: row.material_name, category: row.material_category, defaultRate: num(row.material_default_rate) },
    unit: row.unit,
    source: { warehouseId: row.source_warehouse_id, warehouseName: row.source_warehouse_name, contractorId: row.source_contractor_id, contractorName: row.source_contractor_name },
    destination: { warehouseId: row.destination_warehouse_id, warehouseName: row.destination_warehouse_name, contractorId: row.destination_contractor_id, contractorName: row.destination_contractor_name },
    project: row.project_id ? { id: row.project_id, name: row.project_name } : null,
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    task: row.procurement_task_id ? { id: row.procurement_task_id, name: row.procurement_task_name } : null,
    costPerUnit,
    totalMaterialCost,
    requestedQuantity: num(row.requested_quantity),
    sentQuantity: num(row.sent_quantity),
    receivedQuantity: num(row.received_quantity),
    status: row.status,
    vehicleNumber: row.vehicle_number,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    transportCost: num(row.transport_cost) || 0,
    otherExpenses: num(row.other_expenses) || 0,
    reference: row.reference,
    remarks: row.remarks,
    procurement: row.procurement_request_id ? { id: row.procurement_request_id, requestNumber: row.procurement_request_number } : null,
    sentBy: row.sent_by ? { id: row.sent_by, name: row.sent_by_name } : null,
    sentAt: row.sent_at,
    receivedBy: row.received_by ? { id: row.received_by, name: row.received_by_name } : null,
    receivedAt: row.received_at,
  };
}

function contractorId(hrScope) {
  return hrScope?.role === ROLES.CONTRACTOR ? Number(hrScope.contractorId) : null;
}

/** Resolves the warehouse row for a contractor (provisioning if needed). */
async function contractorWarehouse(cId) {
  await warehouseModel.ensureContractorWarehouses();
  const { contractors } = await warehouseModel.findScopes();
  const match = contractors.find((c) => Number(c.contractor_id) === Number(cId));
  if (!match) throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'That contractor has no warehouse.' });
  return match;
}

async function listMovements(query, hrScope, userId) {
  const cId = contractorId(hrScope);
  const rows = await movementModel.findAll({
    status: query.status,
    materialId: query.materialId,
    contractorId: cId,
    userId: cId ? userId : null,
  });
  return rows.map(toMovement);
}

async function listIncoming(hrScope) {
  const cId = contractorId(hrScope);
  const rows = await movementModel.findAll(cId ? { incomingForContractorId: cId } : { status: 'in_transit' });
  return rows.map(toMovement);
}

async function getById(id, hrScope) {
  const row = await movementModel.findById(id);
  if (!row) throw ApiError.notFound('That material movement does not exist.');
  const cId = contractorId(hrScope);
  if (cId) {
    const isSource = Number(row.source_contractor_id) === cId
      || Number(row.source_warehouse_contractor_id) === cId
      || Number(row.procurement_source_contractor_id) === cId;
    const isDest = Number(row.destination_contractor_id) === cId
      || Number(row.destination_warehouse_contractor_id) === cId
      || Number(row.procurement_dest_contractor_id) === cId;
    if (!isSource && !isDest) {
      throw ApiError.notFound('That material movement does not exist.');
    }
  }
  return toMovement(row);
}

/**
 * SEND MATERIAL. Issues the sent quantity out of the source contractor's
 * warehouse now (source stock drops immediately) and records an in-transit
 * shipment. Destination stock is NOT touched until it is received.
 */
/**
 * Core dispatch: issues the sent quantity out of the SOURCE warehouse now and
 * records an in-transit movement. Destination stock is untouched until receive.
 * Used by both the contractor "Send material" UI and procurement-request
 * dispatch, so there is exactly one place that moves stock for a shipment.
 */
async function createDispatch(spec, userId) {
  const material = await materialModel.findById(spec.materialId);
  if (!material) throw ApiError.badRequest('Check the highlighted fields.', { material_id: 'That material does not exist.' });
  const sentQuantity = Number(spec.sentQuantity);
  if (!(sentQuantity > 0)) throw ApiError.badRequest('Check the highlighted fields.', { sent_quantity: 'Enter a quantity greater than zero.' });

  // Leg 1: issue out of source. A warehouse-to-warehouse movement moves
  // warehouse-level stock, so it draws from the source warehouse's general
  // (unslotted) stock — the project/site are recorded on the movement itself
  // for traceability, not used as the stock slot. This keeps Central -> Contractor
  // working regardless of which project the destination request is for.
  const issueTx = await warehouseService.issueStock({
    material_id: spec.materialId,
    warehouse_id: spec.sourceWarehouseId,
    project_id: null,
    site_id: null,
    quantity: sentQuantity,
    unit: spec.unit || material.unit,
    reference: spec.reference || null,
    transaction_date: spec.transactionDate || undefined,
  }, userId);

  const id = await movementModel.create({
    movement_number: `MV-${String(await movementModel.nextMovementNumber()).padStart(4, '0')}`,
    material_id: spec.materialId,
    unit: spec.unit || material.unit,
    source_warehouse_id: spec.sourceWarehouseId,
    destination_warehouse_id: spec.destWarehouseId,
    source_contractor_id: spec.sourceContractorId ?? null,
    destination_contractor_id: spec.destContractorId ?? null,
    project_id: spec.projectId ?? null,
    site_id: spec.siteId ?? null,
    requested_quantity: spec.requestedQuantity ?? null,
    sent_quantity: sentQuantity,
    status: 'in_transit',
    vehicle_number: spec.vehicleNumber ?? null,
    driver_name: spec.driverName ?? null,
    driver_phone: spec.driverPhone ?? null,
    transport_cost: spec.transportCost ?? 0,
    other_expenses: spec.otherExpenses ?? 0,
    reference: spec.reference ?? null,
    remarks: spec.remarks ?? null,
    procurement_request_id: spec.procurementRequestId ?? null,
    issue_transaction_id: issueTx.id,
    sent_by: userId ?? null,
  });

  return toMovement(await movementModel.findById(id));
}

/** Contractor "Send material" UI path — both ends are contractors. */
async function sendMaterial(payload, hrScope, userId) {
  const cId = contractorId(hrScope);
  const sourceContractorId = cId || (payload.source_contractor_id ? Number(payload.source_contractor_id) : null);
  const sourceWarehouseId = !cId && payload.source_warehouse_id ? Number(payload.source_warehouse_id) : null;

  if (!sourceContractorId && !sourceWarehouseId) {
    throw ApiError.badRequest('Check the highlighted fields.', { source_contractor_id: 'Select the source warehouse or contractor.' });
  }
  const destContractorId = Number(payload.destination_contractor_id);
  if (!destContractorId) throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'Select the destination contractor.' });

  let source;
  if (sourceWarehouseId) {
    source = await warehouseModel.findRawById(sourceWarehouseId);
    if (!source || source.status !== 'active') {
      throw ApiError.badRequest('Check the highlighted fields.', { source_warehouse_id: 'That source warehouse does not exist or is inactive.' });
    }
  } else {
    source = await contractorWarehouse(sourceContractorId);
  }

  const dest = await contractorWarehouse(destContractorId);
  if (source.id === dest.id) {
    throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'Choose a different destination to send to.' });
  }

  return createDispatch({
    materialId: payload.material_id,
    unit: payload.unit,
    sourceWarehouseId: source.id,
    destWarehouseId: dest.id,
    sourceContractorId: source.contractor_id ?? sourceContractorId,
    destContractorId,
    projectId: payload.project_id,
    siteId: payload.site_id,
    requestedQuantity: payload.requested_quantity,
    sentQuantity: payload.sent_quantity ?? payload.quantity,
    vehicleNumber: payload.vehicle_number,
    driverName: payload.driver_name,
    driverPhone: payload.driver_phone,
    transportCost: payload.transport_cost,
    otherExpenses: payload.other_expenses,
    reference: payload.reference,
    remarks: payload.remarks,
    procurementRequestId: payload.procurement_request_id,
  }, userId);
}

/**
 * Dispatch driven by an approved procurement request. Uses the warehouse and
 * contractor ids already resolved on the request, and links the movement back
 * to the request. Works for Central->Contractor (no source contractor) and
 * Contractor->Contractor alike.
 */
async function dispatchForRequest(request, payload, userId) {
  const existing = await movementModel.findAll({}).then((rows) => rows.find((m) => Number(m.procurement_request_id) === Number(request.id) && m.status !== 'cancelled'));
  if (existing) throw ApiError.badRequest('This request has already been dispatched.');
  return createDispatch({
    materialId: request.material_id,
    unit: request.unit,
    sourceWarehouseId: request.source_warehouse_id,
    destWarehouseId: request.destination_warehouse_id,
    sourceContractorId: request.source_contractor_id,
    destContractorId: request.destination_contractor_id,
    projectId: request.project_id,
    siteId: request.destination_site_id ?? request.site_id,
    requestedQuantity: Number(request.quantity),
    sentQuantity: payload.sent_quantity ?? request.quantity,
    vehicleNumber: payload.vehicle_number,
    driverName: payload.driver_name,
    driverPhone: payload.driver_phone,
    transportCost: payload.transport_cost,
    otherExpenses: payload.other_expenses,
    reference: payload.reference || request.request_number,
    remarks: payload.remarks,
    procurementRequestId: request.id,
  }, userId);
}

/**
 * RECEIVE MATERIAL. Only now is the destination warehouse increased. Pulls the
 * shipment details from the send transaction; the receiver may adjust the
 * received quantity (e.g. damage in transit), which stays traceable against the
 * sent quantity.
 */
async function receiveMaterial(id, payload, hrScope, userId) {
  const row = await movementModel.findById(id);
  if (!row) throw ApiError.notFound('That material movement does not exist.');

  const cId = contractorId(hrScope);
  if (cId) {
    const isDest = Number(row.destination_contractor_id) === cId
      || Number(row.destination_warehouse_contractor_id) === cId
      || Number(row.procurement_dest_contractor_id) === cId;
    if (!isDest) {
      throw ApiError.forbidden('Only the receiving contractor can receive this shipment.');
    }
  }
  if (row.status !== 'in_transit') {
    throw ApiError.badRequest(`This shipment is already ${row.status.replace('_', ' ')}.`);
  }

  // Vehicle confirmation: if the sender recorded a vehicle number on dispatch
  // and the receiver supplies one, they must match. (No vehicle supplied — e.g.
  // an Admin/Warehouse receive — is allowed as before.)
  if (payload.vehicle_number && row.vehicle_number) {
    const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
    if (norm(payload.vehicle_number) !== norm(row.vehicle_number)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        vehicle_number: 'Vehicle number does not match the dispatch.',
      });
    }
  }

  const sent = Number(row.sent_quantity);
  const receivedQuantity = payload.received_quantity !== undefined ? Number(payload.received_quantity) : sent;
  if (!(receivedQuantity > 0)) throw ApiError.badRequest('Check the highlighted fields.', { received_quantity: 'Enter a quantity greater than zero.' });
  if (receivedQuantity > sent) {
    throw ApiError.badRequest('Check the highlighted fields.', { received_quantity: `Only ${sent} ${row.unit} was sent.` });
  }

  // Leg 2: receive into destination now, at the destination warehouse's general
  // (unslotted) stock — mirroring the issue leg so warehouse-level stock stays
  // consistent. Project/site remain recorded on the movement for traceability.
  const receiveTx = await warehouseService.receiveStock({
    material_id: row.material_id,
    warehouse_id: row.destination_warehouse_id,
    project_id: null,
    site_id: null,
    quantity: receivedQuantity,
    unit: row.unit,
    reference: row.reference || row.movement_number,
    transaction_date: payload.receiving_date || undefined,
  }, userId);

  await movementModel.markReceived(id, {
    receivedQuantity,
    receiveTransactionId: receiveTx.id,
    receivedBy: userId ?? null,
  });

  // If this shipment fulfilled a procurement request, complete that request and
  // link the receipt transaction — closing the request -> movement -> ledger loop.
  if (row.procurement_request_id) {
    await procurementModel.updateFulfilment(row.procurement_request_id, {
      warehouseTransactionId: receiveTx.id,
      status: 'received',
    }).catch(() => {});
  }

  return toMovement(await movementModel.findById(id));
}

async function getByRequest(procurementRequestId) {
  const row = await movementModel.findByRequestId(procurementRequestId);
  return row ? toMovement(row) : null;
}

/**
 * Warehouse stock for the current contractor's own warehouse (for the
 * contractor dashboard). Admins get the aggregate across company warehouses.
 * Reads warehouse_stock — the single source of truth — grouped by material.
 */
async function myWarehouseStock(hrScope) {
  const cId = contractorId(hrScope);
  let warehouseIds;
  if (cId) {
    const w = await contractorWarehouse(cId);
    warehouseIds = [w.id];
  } else {
    const { central, contractors } = await warehouseModel.findScopes();
    warehouseIds = [...central.map((c) => c.id), ...contractors.map((c) => c.id)];
  }
  if (!warehouseIds.length) return { items: [], materialCount: 0, totalQuantity: 0 };
  const [rows] = await pool.query(
    `SELECT ws.material_id, m.name AS material_name, m.unit, SUM(ws.quantity) AS quantity
     FROM warehouse_stock ws
     JOIN materials m ON m.id = ws.material_id
     WHERE ws.warehouse_id IN (?)
     GROUP BY ws.material_id, m.name, m.unit
     HAVING quantity <> 0
     ORDER BY m.name`,
    [warehouseIds]
  );
  const items = rows.map((r) => ({ materialId: r.material_id, material: r.material_name, unit: r.unit, quantity: Number(r.quantity) }));
  return {
    items,
    materialCount: items.length,
    totalQuantity: items.reduce((s, i) => s + i.quantity, 0),
  };
}

module.exports = { listMovements, listIncoming, getById, getByRequest, sendMaterial, receiveMaterial, dispatchForRequest, myWarehouseStock, toMovement };
