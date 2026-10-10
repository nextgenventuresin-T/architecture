'use strict';

const ApiError = require('../utils/ApiError');
const { pool } = require('../config/db');
const { ROLES } = require('../config/roles');
const movementModel = require('../models/materialMovementModel');
const warehouseModel = require('../models/warehouseModel');
const warehouseService = require('./warehouseService');
const transportExpenseService = require('./transportExpenseService');
const materialModel = require('../models/materialModel');
const procurementModel = require('../models/procurementModel');
const toolModel = require('../models/toolModel');
const { getActualMaterialRate } = require('../utils/materialPricing');
const { normalizeVehicle, vehiclesMatch, vehicleSql } = require('../utils/vehicle');

function num(v) { return v === null || v === undefined ? null : Number(v); }

function toMovement(row) {
  if (!row) return null;
  const costPerUnit = num(row.cost_per_unit) || num(row.procurement_purchase_rate) || num(row.procurement_estimated_rate) || num(row.material_default_rate) || 0;
  const qty = num(row.sent_quantity) != null ? num(row.sent_quantity) : (num(row.requested_quantity) || 0);
  const totalMaterialCost = num(row.total_cost) != null
    ? num(row.total_cost)
    : (num(row.procurement_total_amount) != null
      ? num(row.procurement_total_amount)
      : Number((qty * costPerUnit).toFixed(2)));

  const isTool = row.item_type === 'tool' || (!row.material_id && row.tool_id);

  return {
    id: row.id,
    movementNumber: row.movement_number,
    itemType: isTool ? 'tool' : 'material',
    material: row.material_id
      ? { id: row.material_id, name: row.material_name, category: row.material_category, defaultRate: num(row.material_default_rate) }
      : (row.tool_id
          ? { id: row.tool_id, name: row.tool_name, category: row.tool_type || 'Tool/Machinery', defaultRate: 0 }
          : { id: null, name: '—', category: '—', defaultRate: 0 }),
    tool: row.tool_id ? { id: row.tool_id, name: row.tool_name, code: row.tool_code, type: row.tool_type } : null,
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
    receivedVehicleNumber: row.received_vehicle_number || null,
    dispatchDate: row.sent_at,
    requestedBy: row.procurement_requested_by || null,
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
    pmProjectIds: hrScope?.role === ROLES.PROJECT_MANAGER ? (hrScope.pmProjectIds || []) : undefined,
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
  if (hrScope?.role === ROLES.PROJECT_MANAGER) {
    const ids = hrScope.pmProjectIds || [];
    const pid = row.project_id != null ? Number(row.project_id) : null;
    if (pid == null || !ids.includes(pid)) throw ApiError.notFound('That material movement does not exist.');
  }
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
  const isTool = spec.itemType === 'tool' || (!spec.materialId && spec.toolId);
  let material = null;
  let tool = null;
  let unit = spec.unit || 'unit';

  if (isTool) {
    tool = await toolModel.findById(spec.toolId);
    if (!tool) throw ApiError.badRequest('Check the highlighted fields.', { tool_id: 'That tool does not exist.' });
  } else {
    material = await materialModel.findById(spec.materialId);
    if (!material) throw ApiError.badRequest('Check the highlighted fields.', { material_id: 'That material does not exist.' });
    unit = spec.unit || material.unit;
  }
  const sentQuantity = Number(spec.sentQuantity);
  if (!(sentQuantity > 0)) throw ApiError.badRequest('Check the highlighted fields.', { sent_quantity: 'Enter a quantity greater than zero.' });

  // The receiver identifies the shipment by this number, so every dispatch
  // must carry one.
  if (!normalizeVehicle(spec.vehicleNumber)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      vehicle_number: 'Vehicle number is required on dispatch - the receiver uses it to fetch and verify the shipment.',
    });
  }

  // Issue from the source and record the shipment in ONE transaction: stock can
  // never leave the source without a movement row to receive it against.
  const ownConn = !spec.conn;
  const conn = spec.conn || await pool.getConnection();
  try {
    if (ownConn) await conn.beginTransaction();

    // A request can be dispatched exactly once: lock it and require a
    // dispatchable status, so two simultaneous clicks cannot both ship.
    if (spec.procurementRequestId) {
      const [[lockedReq]] = await conn.query(
        'SELECT id, status FROM procurement_requests WHERE id = ? FOR UPDATE',
        [spec.procurementRequestId]
      );
      if (!lockedReq || !['approved', 'source_confirmed'].includes(lockedReq.status)) {
        throw ApiError.badRequest('This request has already been dispatched.');
      }
    }

    let issueTx = null;
    if (!isTool && spec.materialId) {
      issueTx = await warehouseService.issueStock({
        material_id: spec.materialId,
        warehouse_id: spec.sourceWarehouseId,
        project_id: null,
        site_id: null,
        quantity: sentQuantity,
        unit,
        reference: spec.reference || null,
        transaction_date: spec.transactionDate || undefined,
        vehicle_number: spec.vehicleNumber || null,
      }, userId, { conn });
    }

    // Value the shipment at what the SOURCE stock actually cost (weighted-average
    // of its costed receipts); fall back to the request's rate, then to history.
    let costPerUnit = issueTx?.unitCost > 0 ? Number(issueTx.unitCost) : null;
    if (costPerUnit === null && spec.costPerUnit != null && Number(spec.costPerUnit) > 0) costPerUnit = Number(spec.costPerUnit);
    if (costPerUnit === null) costPerUnit = (!isTool && spec.materialId) ? await getActualMaterialRate(spec.materialId) : 0;
    const totalCost = Number((costPerUnit * sentQuantity).toFixed(2));

    const id = await movementModel.create({
      movement_number: `MV-${String(await movementModel.nextMovementNumber()).padStart(4, '0')}`,
      item_type: isTool ? 'tool' : 'material',
      material_id: isTool ? null : spec.materialId,
      tool_id: isTool ? spec.toolId : null,
      unit,
      source_warehouse_id: spec.sourceWarehouseId,
      destination_warehouse_id: spec.destWarehouseId,
      source_contractor_id: spec.sourceContractorId ?? null,
      destination_contractor_id: spec.destContractorId ?? null,
      project_id: spec.projectId ?? null,
      site_id: spec.siteId ?? null,
      requested_quantity: spec.requestedQuantity ?? null,
      sent_quantity: sentQuantity,
      cost_per_unit: costPerUnit,
      total_cost: totalCost,
      status: 'in_transit',
      vehicle_number: String(spec.vehicleNumber).trim(),
      driver_name: spec.driverName ?? null,
      driver_phone: spec.driverPhone ?? null,
      transport_cost: spec.transportCost ?? 0,
      other_expenses: spec.otherExpenses ?? 0,
      reference: spec.reference ?? null,
      remarks: spec.remarks ?? null,
      procurement_request_id: spec.procurementRequestId ?? null,
      issue_transaction_id: issueTx ? issueTx.id : null,
      sent_by: userId ?? null,
    }, conn);

    if (spec.procurementRequestId) {
      // 'ordered' == dispatched / in transit.
      await conn.query("UPDATE procurement_requests SET status = 'ordered' WHERE id = ?", [spec.procurementRequestId]);
    }

    if (ownConn) await conn.commit();
    return { __movementId: id };
  } catch (error) {
    if (ownConn) await conn.rollback();
    throw error;
  } finally {
    if (ownConn) conn.release();
  }
}

/** Public wrapper: dispatch then return the shaped movement. */
async function dispatchAndLoad(spec, userId) {
  const { __movementId } = await createDispatch(spec, userId);
  return toMovement(await movementModel.findById(__movementId));
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
    if ((source.type === 'central' || source.name?.toLowerCase().includes('central')) && !payload.vehicle_number?.trim()) {
      throw ApiError.badRequest('Check the highlighted fields.', { vehicle_number: 'Vehicle number is mandatory for Central Warehouse movements.' });
    }
  } else {
    source = await contractorWarehouse(sourceContractorId);
  }

  const dest = await contractorWarehouse(destContractorId);
  if (source.id === dest.id) {
    throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'Choose a different destination to send to.' });
  }

  return dispatchAndLoad({
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
  const rate = Number(request.purchase_rate || request.estimated_rate || (request.material_id ? await getActualMaterialRate(request.material_id) : 0) || 0);
  if (!normalizeVehicle(payload.vehicle_number)) {
    throw ApiError.badRequest('Check the highlighted fields.', { vehicle_number: 'Vehicle number is mandatory on dispatch - the receiver verifies it.' });
  }

  const sentQuantity = payload.sent_quantity ?? request.quantity;
  const isTool = request.item_type === 'tool' || (!request.material_id && request.tool_id);
  const spec = {
    itemType: isTool ? 'tool' : 'material',
    materialId: isTool ? null : request.material_id,
    toolId: isTool ? request.tool_id : null,
    unit: request.unit,
    sourceWarehouseId: request.source_warehouse_id,
    destWarehouseId: request.destination_warehouse_id,
    sourceContractorId: request.source_contractor_id,
    destContractorId: request.destination_contractor_id,
    projectId: request.project_id,
    siteId: request.destination_site_id ?? request.site_id,
    requestedQuantity: Number(request.quantity),
    sentQuantity,
    costPerUnit: rate,
    vehicleNumber: payload.vehicle_number,
    driverName: payload.driver_name,
    driverPhone: payload.driver_phone,
    transportCost: payload.transport_cost,
    otherExpenses: payload.other_expenses,
    reference: payload.reference || request.request_number,
    remarks: payload.remarks,
    procurementRequestId: request.id,
  };
  const { __movementId } = await createDispatch(spec, userId);
  return toMovement(await movementModel.findById(__movementId));
}

/**
 * RECEIVE MATERIAL. Only now is the destination warehouse increased.
 *
 * The receiver must enter the vehicle number; it has to match the dispatch the
 * sender recorded (the shipment details are fetched by that number first, see
 * lookupByVehicle). Everything - the movement flip, the destination stock, the
 * ledger row and the procurement status - happens in ONE transaction behind a
 * row lock, and the flip itself only matches an in_transit row, so the same
 * shipment can never be received (or its stock added) twice.
 */
async function receiveMaterial(id, payload, hrScope, userId) {
  const enteredVehicle = String(payload.vehicle_number ?? '').trim().toUpperCase();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const locked = await movementModel.lockById(id, conn);
    if (!locked) throw ApiError.notFound('That material movement does not exist.');

    const row = await movementModel.findById(id);

    const cId = contractorId(hrScope);
    if (cId) {
      const isDest = Number(row.destination_contractor_id) === cId
        || Number(row.destination_warehouse_contractor_id) === cId
        || Number(row.procurement_dest_contractor_id) === cId;
      if (!isDest) {
        throw ApiError.forbidden('Only the receiving contractor can receive this shipment.');
      }
    }
    if (locked.status !== 'in_transit') {
      throw ApiError.badRequest(`This shipment is already ${String(locked.status).replace('_', ' ')} - it cannot be received again.`);
    }

    // Permission and state are checked first; only then is the vehicle number required.
    if (!normalizeVehicle(enteredVehicle)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        vehicle_number: 'Enter the vehicle number to fetch and verify the dispatch before receiving.',
      });
    }
    if (!row.vehicle_number) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        vehicle_number: 'No vehicle number was recorded on dispatch, so this shipment cannot be verified. Ask the sender to correct the dispatch.',
      });
    }
    if (!vehiclesMatch(enteredVehicle, row.vehicle_number)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        vehicle_number: 'Vehicle number does not match the dispatch.',
      });
    }

    const sent = Number(row.sent_quantity);
    const receivedQuantity = payload.received_quantity !== undefined && payload.received_quantity !== null
      ? Number(payload.received_quantity)
      : sent;
    if (!(receivedQuantity > 0)) throw ApiError.badRequest('Check the highlighted fields.', { received_quantity: 'Enter a quantity greater than zero.' });
    if (receivedQuantity > sent) {
      throw ApiError.badRequest('Check the highlighted fields.', { received_quantity: `Only ${sent} ${row.unit} was sent.` });
    }

    // Leg 2: receive into destination now (for materials), valued at the cost
    // the shipment was dispatched at.
    const isTool = row.item_type === 'tool' || (!row.material_id && row.tool_id);
    let receiveTx = null;
    if (!isTool && row.material_id) {
      const unitCost = Number(row.cost_per_unit || 0) || null;
      receiveTx = await warehouseService.receiveStock({
        material_id: row.material_id,
        warehouse_id: row.destination_warehouse_id,
        project_id: null,
        site_id: null,
        quantity: receivedQuantity,
        unit: row.unit,
        reference: row.reference || row.movement_number,
        transaction_date: payload.receiving_date || undefined,
        vehicle_number: row.vehicle_number,
        unit_cost: unitCost,
        total_cost: unitCost ? Number((unitCost * receivedQuantity).toFixed(2)) : null,
        procurement_request_id: row.procurement_request_id || null,
        notes: `Received against ${row.movement_number}; verified vehicle ${enteredVehicle}`,
      }, userId, { conn });
    }

    const flipped = await movementModel.markReceived(id, {
      receivedQuantity,
      receiveTransactionId: receiveTx ? receiveTx.id : null,
      receivedBy: userId ?? null,
      receivedVehicleNumber: enteredVehicle,
    }, conn);
    if (!flipped) throw ApiError.badRequest('This shipment has already been received.');

    // Close the request -> movement -> ledger loop in the same transaction.
    if (row.procurement_request_id) {
      await conn.query(
        `UPDATE procurement_requests
         SET warehouse_transaction_id = ?, fulfilled_at = NOW(), status = 'received',
             received_by = ?, received_vehicle_number = ?
         WHERE id = ?`,
        [receiveTx ? receiveTx.id : null, userId ?? null, enteredVehicle, row.procurement_request_id]
      );
    }

    // The shipment's transport / other charges become a project expense now, once.
    await transportExpenseService.bookForMovement(id, userId ?? null, conn);

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  return toMovement(await movementModel.findById(id));
}

/**
 * FETCH BY VEHICLE NUMBER. The receiver types the arriving vehicle number and
 * gets back the dispatch the sender already recorded - driver, material,
 * quantity, source, destination, project/site, dispatch date - to verify
 * before confirming. Scoped to what the caller is allowed to receive:
 *   contractor -> in-transit shipments addressed to THEIR warehouse only
 *   admin / warehouse / procurement -> all in-transit shipments, plus approved
 *                 vendor purchases into the central warehouse carrying that vehicle.
 */
async function lookupByVehicle(vehicleNumber, hrScope) {
  const normalized = normalizeVehicle(vehicleNumber);
  if (!normalized) {
    throw ApiError.badRequest('Check the highlighted fields.', { vehicle_number: 'Enter the vehicle number.' });
  }

  const cId = contractorId(hrScope);
  const movementRows = await movementModel.findAll(cId ? { incomingForContractorId: cId } : { status: 'in_transit' });
  const shipments = movementRows
    .filter((r) => r.status === 'in_transit' && vehiclesMatch(r.vehicle_number, vehicleNumber))
    .map((r) => {
      const m = toMovement(r);
      return {
        kind: 'movement',
        id: m.id,
        reference: m.movementNumber,
        requestNumber: m.procurement?.requestNumber || null,
        itemType: m.itemType,
        material: m.material?.name || null,
        quantity: m.sentQuantity,
        unit: m.unit,
        costPerUnit: m.costPerUnit,
        totalCost: m.totalMaterialCost,
        vehicleNumber: m.vehicleNumber,
        driverName: m.driverName,
        driverPhone: m.driverPhone,
        source: m.source?.contractorName || m.source?.warehouseName || null,
        destination: m.destination?.contractorName || m.destination?.warehouseName || null,
        project: m.project?.name || null,
        site: m.site?.name || null,
        task: m.task?.name || null,
        dispatchDate: m.sentAt,
        status: m.status,
      };
    });

  if (!cId) {
    const [pending] = await pool.query(
      `SELECT r.id, r.request_number, r.po_number, r.quantity, r.ordered_quantity, r.unit, r.purchase_rate, r.total_amount,
              r.vehicle_number, r.driver_name, r.driver_phone, r.order_date, r.purchase_date, r.created_at, r.status,
              r.supplier, v.name AS vendor_name, m.name AS material_name, dw.name AS destination_name
       FROM procurement_requests r
       LEFT JOIN vendors v ON v.id = r.vendor_id
       LEFT JOIN materials m ON m.id = r.material_id
       LEFT JOIN warehouses dw ON dw.id = r.destination_warehouse_id
       WHERE r.item_type = 'material'
         AND (r.procurement_kind = 'central_purchase'
              OR (r.source_type = 'supplier' AND r.vehicle_number IS NOT NULL AND r.vehicle_number <> ''))
         AND r.status IN ('approved', 'ordered', 'partially_received')
         AND r.warehouse_transaction_id IS NULL
         AND ${vehicleSql('r.vehicle_number')} = ?`,
      [normalized]
    );
    for (const r of pending) {
      const qty = Number(r.ordered_quantity || r.quantity);
      shipments.push({
        kind: 'vendor_purchase',
        id: r.id,
        reference: r.request_number,
        requestNumber: r.request_number,
        itemType: 'material',
        material: r.material_name,
        quantity: qty,
        unit: r.unit,
        costPerUnit: r.purchase_rate != null ? Number(r.purchase_rate) : null,
        totalCost: r.total_amount != null ? Number(r.total_amount) : null,
        vehicleNumber: r.vehicle_number,
        driverName: r.driver_name,
        driverPhone: r.driver_phone,
        source: r.vendor_name || r.supplier || 'Outside vendor',
        destination: r.destination_name || 'Central Warehouse',
        project: null,
        site: null,
        task: null,
        dispatchDate: r.order_date || r.purchase_date || r.created_at,
        status: r.status,
      });
    }
  }

  return { vehicleNumber: String(vehicleNumber).trim(), shipments };
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

module.exports = { listMovements, listIncoming, getById, getByRequest, sendMaterial, receiveMaterial, lookupByVehicle, dispatchForRequest, myWarehouseStock, toMovement };
