'use strict';

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/roles');
const { vehiclesMatch, normalizeVehicle } = require('../utils/vehicle');
const procurementModel = require('../models/procurementModel');
const procurementService = require('./procurementService');
const materialMovementService = require('./materialMovementService');
const pmScope = require('./pmScopeService');

/**
 * MULTI-ITEM PROCUREMENT (batches).
 *
 * A batch (PB-0001) is one request covering several materials / machines. Each item is
 * stored as an ordinary procurement request linked by batch_id, with its own quantity,
 * cost, source, vendor, destination and Project / Site / Task / Subtask. Every item then
 * goes through the SAME per-item code as a single request - approval, purchase order,
 * dispatch, vehicle-verified receiving and Finance - so a batch can never double-count a
 * cost or post stock twice. Batch actions simply run that per-item code over the items,
 * each in its own transaction, and report the outcome item by item.
 */

const MAX_ITEMS = 50;
/** Units of one machine on a single line (each becomes its own tracked request). */
const MAX_UNITS_PER_LINE = 50;
const ADMIN_ROLES = [ROLES.ADMIN, ROLES.PROCUREMENT];
const RECEIVE_ROLES = [ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE];
const isTool = (r) => r.itemType === 'tool';
/**
 * Transport quoted on an item, to book with its receipt - only while nothing has been
 * booked for it yet, so a quote can never be charged twice.
 */
const quoteOf = (r) => (Number(r.transportCost) > 0 && !(Number(r.transportPaid) > 0) ? Number(r.transportCost) : null);

/** Flows a batch may use, mapped to who may raise them. */
const FLOWS = {
  vendor_central: { label: 'Vendor → Central Warehouse', roles: ADMIN_ROLES },
  vendor_site: { label: 'Vendor → Site / Contractor', roles: ADMIN_ROLES },
  // Company stock sent to a project site: issued from Central on dispatch, received at the site.
  central_site: { label: 'Central Warehouse → Site', roles: ADMIN_ROLES },
  central_contractor: { label: 'Central Warehouse → Contractor', roles: [ROLES.CONTRACTOR, ROLES.PROJECT_MANAGER] },
  contractor_contractor: { label: 'Contractor → Contractor', roles: [ROLES.CONTRACTOR, ROLES.PROJECT_MANAGER] },
  supplier_contractor: { label: 'Outside supplier → Contractor', roles: [ROLES.CONTRACTOR, ROLES.PROJECT_MANAGER] },
};

/**
 * The procurement kind / source every item of a flow must have. Set server-side so an
 * item can never slip into a batch under a different flow than the batch declares.
 */
const FLOW_ITEM = {
  vendor_central: { procurement_kind: 'central_purchase', source_type: 'supplier' },
  vendor_site: { procurement_kind: 'project_site', source_type: 'supplier' },
  central_site: { procurement_kind: 'contractor_supply', source_type: 'central_warehouse' },
  central_contractor: { procurement_kind: 'contractor_supply', source_type: 'central_warehouse' },
  contractor_contractor: { procurement_kind: 'internal_transfer', source_type: 'contractor' },
  supplier_contractor: { procurement_kind: 'contractor_supply', source_type: 'supplier' },
};

/** Duplicate lines (same item, same task scope, same source) must be merged into one. */
function lineKey(item) {
  return [
    item.item_type === 'tool' ? `t${item.tool_id}` : `m${item.material_id}`,
    item.task_id || '-', item.subtask_id || '-', item.site_id || '-',
    item.procurement_kind, item.source_type || '-', item.source_contractor_id || '-', item.vendor_id || '-',
  ].join('|');
}

/** Field errors of item i, keyed `items.i.field` for the form. */
function itemErrors(index, error) {
  const out = {};
  if (error?.details && typeof error.details === 'object') {
    for (const [field, msg] of Object.entries(error.details)) out[`items.${index}.${field}`] = msg;
  }
  if (!Object.keys(out).length) out[`items.${index}`] = error?.message || 'This item could not be saved.';
  return out;
}

/**
 * Creates a multi-item request. Every item is validated first (nothing is saved if any
 * item is wrong); then all are created. If creating one fails part-way (e.g. lines that
 * only exceed the task plan together), the items already created are discarded - they
 * have no orders, stock or finance rows yet - so a batch is all-or-nothing.
 */
async function createBatch(payload, userId, hrScope) {
  const flow = FLOWS[payload.flow] ? payload.flow : null;
  if (!flow) throw ApiError.badRequest('Choose what kind of multi-item request this is.', { flow: 'Choose a flow.' });
  if (!FLOWS[flow].roles.includes(hrScope?.role)) throw ApiError.forbidden('You cannot raise this kind of request.');

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw ApiError.badRequest('Add at least one item.', { items: 'Add at least one item.' });
  if (items.length > MAX_ITEMS) throw ApiError.badRequest(`A request can have at most ${MAX_ITEMS} items.`);

  const status = payload.status === 'draft' ? 'draft' : 'requested';
  const prepared = items.map((raw) => ({ ...raw, ...FLOW_ITEM[flow], status, request_number: undefined }));
  // Machines / tools: a line may ask for several UNITS. Each unit is still tracked on
  // its own (its own serial number, allocation and receipt), so a line of N units
  // becomes N one-unit requests in this batch.
  const unitsOf = prepared.map((item) => {
    const isTool = item.item_type === 'tool' || (!item.material_id && item.tool_id);
    if (!isTool) return 1;
    const n = Math.floor(Number(item.quantity));
    item.quantity = 1;
    return n;
  });

  const errors = {};
  unitsOf.forEach((n, i) => {
    if (!(n >= 1)) errors[`items.${i}.quantity`] = 'Enter the number of units (1 or more).';
    else if (n > MAX_UNITS_PER_LINE) errors[`items.${i}.quantity`] = `At most ${MAX_UNITS_PER_LINE} units on one line.`;
  });
  if (flow === 'central_site') {
    // Central Warehouse -> Site: each line names its project + site, and is delivered to
    // whoever holds stock for that site - its contractor, or (no contractor) its Site
    // Store. That receiver is resolved here, server-side, never taken from the request.
    for (let i = 0; i < prepared.length; i += 1) {
      const item = prepared[i];
      // A machine from the Central Warehouse is a company-owned machine: Admin allocates
      // one of its serial numbers to the site, which receives it (like any machine request).
      if (item.item_type === 'tool' || (!item.material_id && item.tool_id)) item.tool_procurement_type = 'purchased_owned';
      if (!item.project_id) { errors[`items.${i}.project_id`] = 'Select the project.'; continue; }
      if (!item.site_id) { errors[`items.${i}.site_id`] = 'Select the site this item goes to.'; continue; }
      const [[site]] = await pool.query('SELECT id, project_id FROM sites WHERE id = ? LIMIT 1', [Number(item.site_id)]);
      if (!site || Number(site.project_id) !== Number(item.project_id)) {
        errors[`items.${i}.site_id`] = 'That site does not belong to the selected project.';
        continue;
      }
      delete item.source_contractor_id;
      delete item.vendor_id;
      item.destination_contractor_id = await pmScope.responsibleContractorId(Number(item.project_id), Number(item.site_id)) || undefined;
      item.destination_site_id = Number(item.site_id);
    }
  }
  const seen = new Map();
  prepared.forEach((item, i) => {
    const key = lineKey(item);
    if (seen.has(key)) {
      errors[`items.${i}`] = `Same item, task and source as line ${seen.get(key) + 1} - combine them into one line.`;
    } else {
      seen.set(key, i);
    }
  });

  // Pass 1: validate every item exactly as a single request would be validated.
  for (let i = 0; i < prepared.length; i += 1) {
    if (errors[`items.${i}`]) continue;
    try {
      await procurementService.create({ ...prepared[i] }, userId, hrScope, { dryRun: true });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      Object.assign(errors, itemErrors(i, error));
    }
  }
  if (Object.keys(errors).length) {
    throw ApiError.badRequest('Some items need attention - check the highlighted lines.', errors);
  }

  // Pass 2: create them all under one batch number.
  const batch = await procurementModel.createBatch({
    flow, requestedBy: userId, requesterRole: hrScope?.role, notes: payload.notes,
  });
  const createdIds = [];
  for (let i = 0; i < prepared.length; i += 1) {
    try {
      for (let u = 0; u < unitsOf[i]; u += 1) {
        const request = await procurementService.create({ ...prepared[i] }, userId, hrScope, { batchId: batch.id });
        createdIds.push(Number(request.id));
      }
    } catch (error) {
      await procurementModel.discardBatch(batch.id, createdIds);
      if (!(error instanceof ApiError)) throw error;
      throw ApiError.badRequest(
        'Some items need attention - check the highlighted lines. Nothing was saved.',
        itemErrors(i, error)
      );
    }
  }
  return getBatch(batch.id, hrScope, userId);
}

/** A batch with the items this viewer may see (role scoping is the same as the list). */
async function getBatch(id, hrScope, userId) {
  const batch = await procurementModel.findBatchById(Number(id));
  if (!batch) throw ApiError.notFound('That multi-item request does not exist.');
  const { requests } = await procurementService.listScoped({ batchId: batch.id, pageSize: MAX_ITEMS * MAX_UNITS_PER_LINE }, hrScope, userId);
  if (!requests.length) throw ApiError.notFound('That multi-item request does not exist.');
  const items = await Promise.all(requests.map(async (r) => {
    const detail = await procurementService.getDetail(r.id, hrScope, userId).catch(() => null);
    return { ...r, movement: detail?.movement || null };
  }));
  return {
    batch: {
      id: batch.id,
      number: batch.batch_number,
      flow: batch.flow,
      flowLabel: FLOWS[batch.flow]?.label || batch.flow,
      requestedBy: batch.requested_by ? { id: batch.requested_by, name: batch.requested_by_name } : null,
      requesterRole: batch.requester_role,
      notes: batch.notes,
      createdAt: batch.created_at,
    },
    items: items.sort((a, b) => a.id - b.id),
  };
}

/**
 * Runs one action over the batch's items. Each item goes through the normal per-item
 * service call (its own checks and transaction); items the action does not apply to are
 * skipped, and failures are reported per item instead of undoing the others.
 */
async function runBatchAction(id, action, payload, user, hrScope) {
  const role = hrScope?.role || user?.role;
  const { items } = await getBatch(id, hrScope, user.id);
  const results = [];
  const run = async (item, fn) => {
    try {
      await fn();
      results.push({ id: item.id, requestNumber: item.requestNumber, ok: true });
    } catch (error) {
      // Field errors carry the real reason (e.g. "Only 0 available at the source").
      const detail = error.details && typeof error.details === 'object' ? Object.values(error.details)[0] : null;
      results.push({ id: item.id, requestNumber: item.requestNumber, ok: false, message: detail || error.message || 'Failed.' });
    }
  };

  switch (action) {
    case 'submit': {
      for (const item of items.filter((r) => r.status === 'requested')) {
        await run(item, () => procurementService.updateStatus(item.id, 'pending_approval', role, hrScope, user.id));
      }
      break;
    }
    case 'approve':
    case 'reject': {
      if (role !== ROLES.ADMIN) throw ApiError.forbidden('Only Admin can approve or reject.');
      const next = action === 'approve' ? 'approved' : 'rejected';
      for (const item of items.filter((r) => r.status === 'pending_approval')) {
        await run(item, () => procurementService.updateStatus(item.id, next, role, hrScope, user.id));
      }
      break;
    }
    case 'confirm': {
      for (const item of items.filter((r) => r.canConfirmSource)) {
        await run(item, () => procurementService.confirmSource(item.id, hrScope, user.id));
      }
      break;
    }
    case 'order': {
      // Admin places the vendor orders: one PO per item, sharing the vendor's vehicle and driver.
      if (!ADMIN_ROLES.includes(role)) throw ApiError.forbidden('Only Admin / Procurement can place orders.');
      // Vendor -> Central Warehouse purchases are received with "Receive" (fulfil) instead.
      const orderable = items.filter((r) => r.status === 'approved' && !isTool(r) && r.sourceType === 'supplier'
        && r.kind !== 'central_purchase');
      for (const item of orderable) {
        await run(item, () => procurementService.placeOrder(item.id, {
          order_date: payload.order_date,
          expected_delivery_date: payload.expected_delivery_date || null,
          vehicle_number: payload.vehicle_number,
          driver_name: payload.driver_name,
          driver_phone: payload.driver_phone,
          challan_number: payload.challan_number,
        }));
      }
      break;
    }
    case 'vendor_confirm': {
      // The vendor confirmed: one Bilty / AWB number (plus optional vehicle, driver,
      // challan) recorded on every vendor item still waiting for it, so the receiver
      // can receive with that number.
      if (!ADMIN_ROLES.includes(role)) throw ApiError.forbidden('Only Admin / Procurement can record the vendor dispatch.');
      if (!normalizeVehicle(payload.bilty_number)) {
        throw ApiError.badRequest('Check the highlighted fields.', { bilty_number: 'Enter the Bilty / AWB number.' });
      }
      for (const item of items.filter((r) => r.canRecordVendorDispatch)) {
        await run(item, () => procurementService.recordVendorDispatch(item.id, {
          bilty_number: payload.bilty_number,
          vehicle_number: payload.vehicle_number,
          driver_name: payload.driver_name,
          driver_phone: payload.driver_phone,
          challan_number: payload.challan_number,
          expected_delivery_date: payload.expected_delivery_date || undefined,
        }, user.id));
      }
      if (!results.length) throw ApiError.badRequest('No vendor item in this request is waiting for a dispatch to be recorded.');
      break;
    }
    case 'dispatch': {
      // Send material: Central -> contractor (Admin side) or the source contractor's
      // transfers - whatever this viewer may send. One vehicle carries them all.
      if (!normalizeVehicle(payload.vehicle_number)) {
        throw ApiError.badRequest('Check the highlighted fields.', { vehicle_number: 'Vehicle number is mandatory on dispatch - the receiver verifies it.' });
      }
      // Freight for the whole vehicle is carried by the first item actually sent, so it
      // is booked exactly once (on receipt), never once per item. With no amount given,
      // it is the total of the transport quoted on the items being sent.
      const sending = items.filter((r) => r.canDispatch);
      const quotedTotal = sending.reduce((s, r) => s + Number(r.transportCost || 0), 0);
      let freight = Number(payload.transport_cost) > 0
        ? Number(payload.transport_cost)
        : (quotedTotal > 0 ? Number(quotedTotal.toFixed(2)) : null);
      for (const item of sending) {
        await run(item, () => procurementService.dispatch(item.id, {
          vehicle_number: payload.vehicle_number,
          driver_name: payload.driver_name,
          driver_phone: payload.driver_phone,
          transport_cost: freight,
          remarks: payload.remarks,
        }, hrScope, user.id));
        if (results[results.length - 1]?.ok) freight = null;
      }
      break;
    }
    case 'receive': {
      // Everything that arrived under this number and that this viewer may receive:
      // vendor deliveries by their Bilty / AWB number, stock moves by vehicle number.
      const vehicle = String(payload.bilty_number || payload.vehicle_number || '').trim();
      if (!normalizeVehicle(vehicle)) {
        throw ApiError.badRequest('Check the highlighted fields.', { vehicle_number: 'Enter the Bilty / AWB or vehicle number.' });
      }
      // A vendor item is matched on what it is verified by (Bilty / AWB, or vehicle for older ones).
      const vendorMatch = (item) => (item.verifyBy === 'bilty' ? vehiclesMatch(vehicle, item.biltyNumber) : vehiclesMatch(vehicle, item.vehicleNumber));
      const vendorProof = (item) => (item.verifyBy === 'bilty' ? { bilty_number: vehicle } : { vehicle_number: vehicle });
      const receivingDate = payload.receiving_date || new Date().toISOString().slice(0, 10);
      for (const item of items) {
        const mv = item.movement;
        if (item.kind === 'central_purchase') {
          // Vendor -> Central Warehouse: verified against the vehicle recorded on the purchase.
          if (item.status === 'approved' && !item.warehouseTransactionId && RECEIVE_ROLES.includes(role)
            && vendorMatch(item)) {
            await run(item, () => procurementService.fulfil(item.id, {
              ...vendorProof(item), receiving_date: receivingDate, transport_cost: quoteOf(item),
            }, user.id));
          }
          continue;
        }
        if (mv && mv.status === 'in_transit' && vehiclesMatch(vehicle, mv.vehicleNumber)
          && (item.canReceiveMovement || RECEIVE_ROLES.includes(role))) {
          await run(item, () => materialMovementService.receiveMaterial(mv.id, { vehicle_number: vehicle, receiving_date: receivingDate }, hrScope, user.id));
        } else if (isTool(item) && item.status === 'ordered' && item.canReceiveTool && vehiclesMatch(vehicle, item.vehicleNumber)) {
          await run(item, () => procurementService.toolReceive(item.id, { vehicle_number: vehicle, receiving_date: receivingDate }, user.id, hrScope));
        } else if (!isTool(item) && !mv && ['ordered', 'partially_received'].includes(item.status)
          && (item.canReceiveOrder || RECEIVE_ROLES.includes(role))
          && !item.awaitingVendorDispatch && vendorMatch(item)) {
          const remaining = item.receiving?.remainingQuantity;
          if (!(Number(remaining) > 0)) continue;
          await run(item, () => procurementService.receive(item.id, {
            received_quantity: Number(remaining), receiving_date: receivingDate, ...vendorProof(item),
            transport_cost: quoteOf(item),
          }, user.id, hrScope, { useQuotedTransport: true }));
        }
      }
      if (!results.length) {
        throw ApiError.badRequest('Nothing in this request is waiting on that number for you to receive.', { vehicle_number: 'No item matches this Bilty / AWB or vehicle number.' });
      }
      break;
    }
    default:
      throw ApiError.badRequest('Unknown action.');
  }

  return { results, ...(await getBatch(id, hrScope, user.id)) };
}

module.exports = { FLOWS, createBatch, getBatch, runBatchAction };
