'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/roles');
const { BILLS_DIR } = require('../middleware/upload');
const procurementModel = require('../models/procurementModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');
const materialModel = require('../models/materialModel');
const warehouseModel = require('../models/warehouseModel');
const notificationModel = require('../models/notificationModel');
const toolModel = require('../models/toolModel');
const taskModel = require('../models/taskModel');
const { resolveSubtask, subtaskIdFrom } = require('./subtaskLink');
const toolUnitService = require('./toolUnitService');
const pmScope = require('./pmScopeService');
const { normalizeVehicle, vehiclesMatch } = require('../utils/vehicle');
const warehouseService = require('./warehouseService');
const materialMovementService = require('./materialMovementService');
const { getActualMaterialRate } = require('../utils/materialPricing');
const areaService = require('./areaService');
const transportExpenseService = require('./transportExpenseService');
const { transportCategoryFor } = require('../config/costBuckets');

/**
 * How the goods physically arrive, derived from the flow (never stored):
 *   direct_site : an outside vendor delivers straight to the project site / its contractor
 *   warehouse   : bought into, or issued from, the central warehouse
 *   transfer    : moved between contractors / sites
 */
function deliveryModeFor(row) {
  const kind = row.procurement_kind || 'project_site';
  if (kind === 'internal_transfer') return 'transfer';
  if (kind === 'central_purchase' || row.source_type === 'central_warehouse') return 'warehouse';
  return 'direct_site';
}

/** Non-negative money amount from a payload field, or null when absent / blank. */
function moneyOrNull(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw ApiError.badRequest('Check the highlighted fields.', { [field]: 'Enter a valid amount (0 or more).' });
  }
  return Number(n.toFixed(2));
}

// Where a request delivers to, and where it draws from.
const PROCUREMENT_KINDS = ['project_site', 'central_purchase', 'contractor_supply', 'internal_transfer'];
const SOURCE_TYPES = ['supplier', 'central_warehouse', 'contractor', 'site'];
// 'site_store': a site run by its Project Manager (no contractor) keeps its own stock.
const DESTINATION_TYPES = ['project_site', 'central_warehouse', 'contractor_warehouse', 'site_store'];
// Source types that move material we already own — these must never create a
// Finance payment, only a stock movement.
const INTERNAL_SOURCES = new Set(['central_warehouse', 'contractor', 'site']);

/** Human-readable source/destination for one request row (used by toRequest). */
function buildEndpoint(side, row) {
  const type = row[`${side}_type`];
  const warehouseName = row[`${side}_warehouse_name`];
  const contractorName = row[`${side}_contractor_name`];
  const siteName = row[`${side}_site_name`];
  const contractorId = row[`${side}_contractor_id`];
  const warehouseId = row[`${side}_warehouse_id`];
  const siteId = row[`${side}_site_id`];

  if (!type) {
    // Fall back to project/site or supplier already on the row.
    if (side === 'source' && row.supplier) return { type: 'supplier', name: row.supplier };
    return null;
  }
  const nameByType = {
    supplier: row.supplier || 'Outside / Third-party',
    central_warehouse: 'Company Central Warehouse',
    contractor: contractorName ? `${contractorName} Contractor` : (warehouseName || 'Contractor'),
    contractor_warehouse: contractorName ? `${contractorName} Contractor` : (warehouseName || 'Contractor warehouse'),
    site: siteName || 'Site',
    project_site: row.project_name || 'Project / site',
    site_store: warehouseName || (siteName ? siteName + ' Site Store' : 'Site Store'),
  };
  return {
    type,
    name: nameByType[type] || type,
    contractorId: contractorId || null,
    warehouseId: warehouseId || null,
    siteId: siteId || null,
  };
}

const STATUSES = [
  'draft', 'requested', 'pending_approval', 'approved', 'source_confirmed', 'rejected',
  'ordered', 'partially_received', 'received', 'cancelled',
];

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

/**
 * Allowed next statuses for each current status. Anything not listed here is
 * rejected even if the value is otherwise a recognised status — a random but
 * valid-looking status can never be jumped to out of order.
 */
const TRANSITIONS = {
  draft: ['requested', 'cancelled'],
  requested: ['pending_approval', 'draft', 'cancelled'],
  pending_approval: ['approved', 'rejected'],
  // 'source_confirmed' is the supplying contractor's acceptance of an
  // internal transfer. It is reachable only through confirmSource(), never a
  // bare status PATCH — see CONFIRM_ONLY_STATUS below.
  approved: ['source_confirmed', 'ordered', 'cancelled'],
  source_confirmed: ['ordered', 'cancelled'],
  rejected: [],
  ordered: ['partially_received', 'received', 'cancelled'],
  partially_received: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

// Statuses reachable only through the dedicated receiving flow, never a bare
// status PATCH — they must carry a receiving_date and quantity with them.
const RECEIVING_ONLY_STATUSES = new Set(['partially_received', 'received']);
// Statuses reachable only through markOrdered(), which also stamps the PO fields.
const ORDER_ONLY_STATUS = 'ordered';
// Reachable only through confirmSource(), which checks that the caller IS the
// supplying contractor. A bare status PATCH can never set it.
const CONFIRM_ONLY_STATUS = 'source_confirmed';

function assertValidStatus(status) {
  if (!STATUSES.includes(status)) {
    throw ApiError.badRequest('Check the highlighted fields.', { status: 'Choose a valid status.' });
  }
}

/**
 * Per-request capability flags, recomputed server-side on every read for the
 * CURRENT viewer. The frontend uses them to show or hide the Confirm/Send
 * buttons; confirmSource() and dispatch() re-check the same rules regardless,
 * so hiding is only cosmetic.
 *
 *   internal_transfer : only the SOURCE contractor may confirm (approved) and
 *                       only the SOURCE contractor may send (source_confirmed).
 *   central -> contractor : unchanged — Admin/Procurement/Warehouse send.
 */
/**
 * The contractor an outside-vendor order is delivered straight to (vendor -> their
 * site / warehouse), or null. Central-warehouse purchases and stock movements
 * between our own locations are not vendor deliveries to a contractor.
 */
function vendorOrderReceiverId(row) {
  if (row.source_type !== 'supplier' || row.procurement_kind === 'central_purchase') return null;
  return Number(row.destination_contractor_id || row.contractor_id) || null;
}

/** The contractor a machine request is delivered to (whoever raised it - contractor or PM - it goes to the site's contractor). */
function toolReceiverId(row) {
  return Number(row.contractor_id || row.destination_contractor_id) || null;
}

/**
 * The PM-run site a request is delivered to: no contractor on the request (the site and
 * its project have none), so it lands in that site's Site Store and its PM receives it.
 */
function pmRunSiteOf(row) {
  if (row.contractor_id || row.destination_contractor_id) return null;
  return Number(row.destination_site_id || row.site_id) || null;
}

/** True when the viewer is a PM assigned to that site. */
function viewerPmHasSite(viewer, siteId) {
  return viewer?.role === ROLES.PROJECT_MANAGER && siteId != null && (viewer.pmSiteIds || []).includes(Number(siteId));
}

function capabilitiesFor(row, viewer) {
  const kind = row.procurement_kind || 'project_site';
  const pmSite = pmRunSiteOf(row);
  const pmReceives = viewerPmHasSite(viewer, pmSite);
  const isInternalTransfer = kind === 'internal_transfer';
  const isCentralSupply = kind === 'contractor_supply' && row.source_type === 'central_warehouse';
  const role = viewer?.role ?? null;
  const viewerContractorId = viewer?.contractorId != null ? Number(viewer.contractorId) : null;
  // Machines are tracked by serial number: Admin allocates / registers the unit and
  // dispatches it ('ordered'); the receiving contractor then verifies the vehicle and receives it.
  if (row.item_type === 'tool' || (!row.material_id && row.tool_id)) {
    const receiver = toolReceiverId(row);
    return {
      isInternalTransfer: kind === 'internal_transfer', isSourceContractor: false, canConfirmSource: false, canDispatch: false, canReceiveMovement: false,
      canReceiveOrder: false,
      canReceiveTool: row.status === 'ordered' && Boolean(receiver || pmSite) && (
        (receiver && role === ROLES.CONTRACTOR && viewerContractorId === receiver)
        || (!receiver && pmReceives)
        || [ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE].includes(role)),
    };
  }
  // A vendor order placed by Admin for delivery straight to a contractor: that
  // contractor receives it themselves, verifying the vehicle Admin recorded.
  const receiverId = vendorOrderReceiverId(row);
  const isVendorDelivery = row.source_type === 'supplier' && kind !== 'central_purchase';
  const canReceiveOrder = Boolean(
    ['ordered', 'partially_received'].includes(row.status)
    && ((receiverId && role === ROLES.CONTRACTOR && viewerContractorId === receiverId)
      || (isVendorDelivery && pmReceives))
  );
  const isSourceContractor = Boolean(
    isInternalTransfer
    && viewerContractorId !== null
    && row.source_contractor_id != null
    && Number(row.source_contractor_id) === viewerContractorId
  );

  const isDestinationContractor = Boolean(
    (isInternalTransfer || isCentralSupply)
    && viewerContractorId !== null
    && row.destination_contractor_id != null
    && Number(row.destination_contractor_id) === viewerContractorId
  );

  return {
    isInternalTransfer,
    isSourceContractor,
    canConfirmSource: isSourceContractor && row.status === 'approved',
    canDispatch: isInternalTransfer
      ? (isSourceContractor && row.status === 'source_confirmed')
      : (isCentralSupply && row.status === 'approved'
         && [ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE].includes(role)),
    // Receiving an in-transit shipment: the destination contractor, or
    // Admin/Procurement/Warehouse. Unchanged behaviour, just made explicit so
    // the source contractor is not offered a Receive button on their own send.
    canReceiveMovement: (isInternalTransfer || isCentralSupply)
      && row.status === 'ordered'
      && (isDestinationContractor || pmReceives
          || [ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE].includes(role)),
    canReceiveOrder,
  };
}

function toRequest(row, viewer) {
  if (!row) return null;
  const orderedQuantity = row.ordered_quantity === null || row.ordered_quantity === undefined
    ? null
    : Number(row.ordered_quantity);
  const receivedQuantity = Number(row.received_quantity || 0);

  return {
    id: row.id,
    requestNumber: row.request_number,
    kind: row.procurement_kind || 'project_site',
    deliveryMode: deliveryModeFor(row),
    area: row.area_id ? { id: row.area_id, name: row.area_name, type: row.area_type || null } : null,
    // Part of a multi-item request: every item is still an ordinary request.
    batch: row.batch_id ? { id: row.batch_id, number: row.batch_number || null } : null,
    transportCost: row.transport_cost != null ? Number(row.transport_cost) : null,
    transportPaid: Number(row.transport_paid || 0),
    transportCategory: transportCategoryFor(row.item_type === 'tool' || (!row.material_id && row.tool_id) ? 'tool' : 'material'),
    sourceType: row.source_type || null,
    destinationType: row.destination_type || null,
    source: buildEndpoint('source', row),
    destination: buildEndpoint('destination', row),
    project: row.project_id ? { id: row.project_id, name: row.project_name, code: row.project_code } : null,
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    task: row.task_id ? { id: row.task_id, name: row.task_name } : null,
    subtask: row.subtask_id ? { id: row.subtask_id, name: row.subtask_name } : null,
    isExcess: Boolean(row.is_excess),
    excessQuantity: Number(row.excess_quantity || 0),
    excessReason: row.excess_reason || null,
    plannedQuantityAtRequest: row.planned_quantity_at_request != null ? Number(row.planned_quantity_at_request) : null,
    procuredQuantityAtRequest: row.procured_quantity_at_request != null ? Number(row.procured_quantity_at_request) : null,
    itemType: row.item_type || (row.tool_id ? 'tool' : 'material'),
    material: row.material_id
      ? { id: row.material_id, name: row.material_name, unit: row.material_unit, category: row.material_category, defaultRate: Number(row.material_default_rate || 0) }
      : (row.tool_id
          ? { id: row.tool_id, name: row.tool_name, unit: row.unit || 'unit', category: row.tool_type || 'Tool/Machinery', defaultRate: 0 }
          : { id: null, name: '—', unit: 'unit', category: '—', defaultRate: 0 }),
    tool: row.tool_id ? { id: row.tool_id, name: row.tool_name, code: row.tool_code, type: row.tool_type } : null,
    toolProcurementType: row.tool_procurement_type || null,
    rentalCost: row.rental_cost != null ? Number(row.rental_cost) : null,
    usageChargeRate: row.usage_charge_rate != null ? Number(row.usage_charge_rate) : null,
    rentalDays: row.rental_days != null ? Number(row.rental_days) : null,
    rentalStartDate: row.rental_start_date || null,
    rentalEndDate: row.rental_end_date || null,
    vendorId: row.vendor_id || null,
    vendor: row.vendor_id ? {
      id: row.vendor_id,
      name: row.vendor_name,
      contactPerson: row.vendor_contact_person,
      phone: row.vendor_phone,
    } : null,
    toolUnit: row.tool_unit_id ? { id: row.tool_unit_id, serialNumber: row.tool_unit_serial } : null,
    usageChargeTotal: row.usage_charge_total != null ? Number(row.usage_charge_total) : null,
    usageChargeDays: row.usage_charge_days != null ? Number(row.usage_charge_days) : null,
    usageChargePolicy: row.usage_charge_policy || null,
    requesterRole: row.requester_role || null,
    responsibleContractor: row.contractor_id ? { id: row.contractor_id, name: row.responsible_contractor_name } : null,
    receivedVehicleNumber: row.received_vehicle_number || null,
    vehicleNumber: row.vehicle_number || null,
    driverName: row.driver_name || null,
    driverPhone: row.driver_phone || null,
    challanNumber: row.challan_number || null,
    challanDate: row.challan_date || null,
    invoiceNumber: row.invoice_number || null,
    invoiceDate: row.invoice_date || null,
    remarks: row.remarks || null,
    supplier: row.supplier,
    supplierContact: row.supplier_contact || null,
    quantity: Number(row.quantity),
    unit: row.unit || row.material_unit || 'unit',
    estimatedRate: Number(row.purchase_rate) > 0
      ? Number(row.purchase_rate)
      : (Number(row.estimated_rate) > 0
          ? Number(row.estimated_rate)
          : (Number(row.material_default_rate) || 0)),
    estimatedTotal: Number(row.total_amount) > 0
      ? Number(row.total_amount)
      : (Number(row.estimated_total) > 0
          ? Number(row.estimated_total)
          : (Number(row.purchase_rate || row.estimated_rate || row.material_default_rate || 0) * Number(row.quantity || 0))),
    purchaseRate: Number(row.purchase_rate) > 0
      ? Number(row.purchase_rate)
      : (Number(row.estimated_rate) > 0
          ? Number(row.estimated_rate)
          : (Number(row.material_default_rate) || null)),
    totalAmount: Number(row.total_amount) > 0
      ? Number(row.total_amount)
      : (Number(row.estimated_total) > 0
          ? Number(row.estimated_total)
          : (Number(row.purchase_rate || row.estimated_rate || row.material_default_rate || 0) * Number(row.quantity || 0))),
    purchaseDate: row.purchase_date || null,
    billReference: row.bill_reference || null,
    billFile: row.bill_file_path
      ? {
          name: row.bill_file_name,
          type: row.bill_file_type,
          size: row.bill_file_size != null ? Number(row.bill_file_size) : null,
          uploadedAt: row.bill_uploaded_at || null,
        }
      : null,
    requiredDate: row.required_date,
    priority: row.priority,
    reason: row.reason || null,
    requestedBy: row.requested_by ? { id: row.requested_by, name: row.requested_by_name } : null,
    notes: row.notes,
    status: row.status,
    warehouseTransactionId: row.warehouse_transaction_id || null,
    fulfilledAt: row.fulfilled_at || null,
    isInternalTransfer: ['internal_transfer'].includes(row.procurement_kind)
      || ['central_warehouse', 'contractor', 'site'].includes(row.source_type),
    // Viewer-specific action flags (see capabilitiesFor).
    ...(() => {
      const caps = capabilitiesFor(row, viewer);
      return {
        isSourceContractor: caps.isSourceContractor,
        canConfirmSource: caps.canConfirmSource,
        canDispatch: caps.canDispatch,
        canReceiveMovement: caps.canReceiveMovement,
        canReceiveOrder: caps.canReceiveOrder,
        canReceiveTool: Boolean(caps.canReceiveTool),
      };
    })(),
    purchaseOrder: row.po_number ? {
      poNumber: row.po_number,
      orderedQuantity,
      rate: Number(row.purchase_rate || row.estimated_rate || row.material_default_rate || 0),
      totalAmount: orderedQuantity !== null ? Number((orderedQuantity * Number(row.purchase_rate || row.estimated_rate || row.material_default_rate || 0)).toFixed(2)) : null,
      orderDate: row.order_date,
      expectedDeliveryDate: row.expected_delivery_date,
    } : null,
    receiving: {
      receivedQuantity,
      remainingQuantity: orderedQuantity !== null ? Math.max(orderedQuantity - receivedQuantity, 0) : null,
      receiptCount: Number(row.receipt_count || 0),
      lastReceived: row.last_received || null,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toReceipt(row) {
  if (!row) return null;
  return {
    id: row.id,
    procurementRequestId: row.procurement_request_id,
    receivedQuantity: Number(row.received_quantity),
    receivingDate: row.receiving_date,
    notes: row.notes,
    receivedBy: row.received_by,
    materialEntryId: row.material_entry_id,
    transportCost: Number(row.transport_cost || 0),
    transportExpenseId: row.transport_expense_id || null,
    createdAt: row.created_at,
  };
}

async function list(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));

  const { rows, total } = await procurementModel.findAll({ ...query, page, pageSize });

  return {
    requests: rows.map((row) => toRequest(row)),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

/** The minimal viewer identity the capability flags are computed against. */
function viewerFrom(hrScope) {
  return { role: hrScope?.role ?? null, contractorId: hrScope?.contractorId ?? null, pmSiteIds: hrScope?.pmSiteIds || [] };
}

function contractorScope(hrScope, userId) {
  if (hrScope?.role === ROLES.CONTRACTOR) return { contractorId: hrScope.contractorId, userId };
  // A Project Manager only ever sees/touches requests on their assigned
  // projects. Deny-by-default: an empty list matches nothing.
  if (hrScope?.role === ROLES.PROJECT_MANAGER) return { pmProjectIds: hrScope.pmProjectIds || [] };
  return {};
}

async function listScoped(query, hrScope, userId) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));
  const { rows, total } = await procurementModel.findAll({
    ...query,
    ...contractorScope(hrScope, userId),
    page,
    pageSize,
  });
  const viewer = viewerFrom(hrScope);
  return {
    requests: rows.map((row) => toRequest(row, viewer)),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id, hrScope, userId) {
  const row = await procurementModel.findById(id, contractorScope(hrScope, userId));
  if (!row) throw ApiError.notFound('That procurement request does not exist.');
  const req = toRequest(row, viewerFrom(hrScope));
  if (row.tool_id) {
    // Who holds each serial of this machine type, so Admin can approve, reject
    // or authorise a reassignment with the facts in front of them.
    const availability = await toolUnitService.availabilityForTool(row.tool_id);
    if (hrScope?.role === ROLES.CONTRACTOR) availability.holders = [];
    req.toolAvailability = availability;
    // The estimate Admin planned for this machine on the task, shown while procuring.
    if (row.task_id) {
      const plan = (await taskModel.findPlannedTools(row.task_id)).find((t) => Number(t.toolId) === Number(row.tool_id));
      if (plan) {
        if (hrScope?.role === ROLES.CONTRACTOR) delete plan.rentalType;
        req.taskToolPlan = plan;
      }
    }
  }
  if (row.source_warehouse_id && row.material_id) {
    const avail = await warehouseModel.totalForMaterial(row.source_warehouse_id, row.material_id);
    req.sourceAvailableStock = Number(avail || 0);
  }
  return req;
}

async function getDetail(id, hrScope, userId) {
  const request = await getById(id, hrScope, userId);
  const receipts = await procurementModel.findReceipts(id);
  const movement = await materialMovementService.getByRequest(id).catch(() => null);
  return { request, receipts: receipts.map(toReceipt), movement };
}

async function generateRequestNumber() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `PR-${String((await procurementModel.nextRequestNumber()) + attempt).padStart(4, '0')}`;
    if (!(await procurementModel.findByRequestNumber(candidate))) return candidate;
  }
  throw ApiError.badRequest('Could not generate a request number. Enter one manually.');
}

async function generatePoNumber() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `PO-${String((await procurementModel.nextPoNumber()) + attempt).padStart(4, '0')}`;
    if (!(await procurementModel.findByPoNumber(candidate))) return candidate;
  }
  throw ApiError.badRequest('Could not generate a PO number. Enter one manually.');
}

/** Confirms project/site/material/tool exist and belong together before any write. */
async function assertRelationships(payload) {
  const { project_id, site_id, material_id, tool_id, item_type } = payload;
  let project = null;
  if (project_id) {
    project = await projectModel.findById(project_id);
    if (!project) {
      throw ApiError.badRequest('Check the highlighted fields.', { project_id: 'That project does not exist.' });
    }

    if (site_id) {
      const site = await siteModel.findById(site_id);
      if (!site) {
        throw ApiError.badRequest('Check the highlighted fields.', { site_id: 'That site does not exist.' });
      }
      if (Number(site.project_id) !== Number(project_id)) {
        throw ApiError.badRequest('Check the highlighted fields.', {
          site_id: 'That site does not belong to the selected project.',
        });
      }
    }
  }

  let material = null;
  let tool = null;
  const isTool = item_type === 'tool' || (!material_id && tool_id);
  if (isTool) {
    if (!tool_id) throw ApiError.badRequest('Check the highlighted fields.', { tool_id: 'Select a tool/machine.' });
    tool = await toolModel.findById(tool_id);
    if (!tool) throw ApiError.badRequest('Check the highlighted fields.', { tool_id: 'That tool/machine does not exist.' });
  } else {
    if (!material_id) throw ApiError.badRequest('Check the highlighted fields.', { material_id: 'Select a material.' });
    material = await materialModel.findById(material_id);
    if (!material) {
      throw ApiError.badRequest('Check the highlighted fields.', { material_id: 'That material does not exist.' });
    }
  }

  return { project, material, tool };
}

async function assertContractorLocation(payload, hrScope) {
  if (hrScope?.role !== ROLES.CONTRACTOR) return;
  const cId = Number(hrScope.contractorId);
  const project = await projectModel.findById(payload.project_id);
  if (!project) throw ApiError.notFound('That project does not exist.');

  const sites = await projectModel.findRelated(payload.project_id, 'sites');
  const isAssignedProject = Number(project.contractor_id) === cId || sites.some((s) => Number(s.contractor_id) === cId);
  if (!isAssignedProject) {
    throw ApiError.notFound('That project does not exist.');
  }

  if (payload.site_id) {
    const site = sites.find((s) => Number(s.id) === Number(payload.site_id));
    if (!site) throw ApiError.notFound('That site does not exist.');
    const isAssignedSite = Number(site.contractor_id) === cId || (!site.contractor_id && Number(project.contractor_id) === cId);
    if (!isAssignedSite) {
      throw ApiError.notFound('That site does not exist.');
    }
  }
}

/** Central company warehouse id (the primary active central warehouse or one holding sufficient stock). */
async function getCentralWarehouseId(materialId = null, requiredQty = 0) {
  const { central } = await warehouseModel.findScopes();
  if (!central.length) throw ApiError.badRequest('No central company warehouse is configured.');
  if (materialId) {
    for (const w of central) {
      const total = await warehouseModel.totalForMaterial(w.id, materialId);
      if (Number(total) >= Number(requiredQty || 0) && Number(total) > 0) {
        return w.id;
      }
    }
  }
  return central[0].id;
}

/** The warehouse row that belongs to a contractor, provisioning if needed. */
async function getContractorWarehouseId(contractorId) {
  await warehouseModel.ensureContractorWarehouses();
  const { contractors } = await warehouseModel.findScopes();
  const match = contractors.find((c) => Number(c.contractor_id) === Number(contractorId));
  if (!match) throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'That contractor has no warehouse.' });
  return match.id;
}

/**
 * Normalises the flow fields for a create, per procurement_kind. Returns the
 * exact columns to persist. Throws a field error when something required for
 * that kind is missing. Contractors are pinned to their own contractor id so a
 * request body can never claim to be another contractor.
 */
/**
 * Destination columns for a site run by its Project Manager (no contractor on the
 * site or its project): its Site Store. Null when the site has a contractor.
 */
async function pmSiteStoreDestination(payload) {
  if (!payload.site_id) return null;
  const holder = await pmScope.siteHolder(payload.project_id ? Number(payload.project_id) : null, Number(payload.site_id));
  if (!holder?.pmRun) return null;
  return {
    destination_type: 'site_store',
    destination_contractor_id: null,
    destination_warehouse_id: holder.warehouseId,
    destination_site_id: holder.siteId,
  };
}

async function resolveFlow(payload, hrScope) {
  const kind = PROCUREMENT_KINDS.includes(payload.procurement_kind) ? payload.procurement_kind : 'project_site';
  const isContractor = hrScope?.role === ROLES.CONTRACTOR;
  const ownContractorId = isContractor ? Number(hrScope.contractorId) : null;
  const isTool = payload.item_type === 'tool' || (!payload.material_id && payload.tool_id);

  if (kind === 'project_site') {
    // Legacy behaviour, unchanged: a project is required.
    await assertContractorLocation(payload, hrScope);
    const { material, tool } = await assertRelationships(payload);
    let destWarehouseId = null;
    if (payload.site_id) {
      const site = await siteModel.findById(payload.site_id).catch(() => null);
      if (site?.contractor_id) {
        destWarehouseId = await getContractorWarehouseId(site.contractor_id).catch(() => null);
      }
    }
    if (!destWarehouseId && payload.project_id) {
      const project = await projectModel.findById(payload.project_id).catch(() => null);
      if (project?.contractor_id) {
        destWarehouseId = await getContractorWarehouseId(project.contractor_id).catch(() => null);
      }
    }
    // No contractor: the site is run by its Project Manager, into its own Site Store.
    if (!destWarehouseId && payload.site_id) {
      destWarehouseId = (await warehouseModel.ensureSiteStore(Number(payload.site_id)))?.id || null;
    }
    if (!destWarehouseId) {
      destWarehouseId = await getCentralWarehouseId().catch(() => null);
    }

    return {
      material,
      tool,
      columns: {
        procurement_kind: 'project_site',
        item_type: isTool ? 'tool' : 'material',
        material_id: material?.id || null,
        tool_id: tool?.id || null,
        destination_type: 'project_site',
        destination_warehouse_id: destWarehouseId,
        source_type: 'supplier',
        project_id: payload.project_id,
        site_id: payload.site_id ?? null,
        task_id: payload.task_id ? Number(payload.task_id) : null,
      },
    };
  }

  let material = null;
  let tool = null;
  if (isTool) {
    if (!payload.tool_id) throw ApiError.badRequest('Check the highlighted fields.', { tool_id: 'Select a tool/machine.' });
    tool = await toolModel.findById(payload.tool_id);
    if (!tool) throw ApiError.badRequest('Check the highlighted fields.', { tool_id: 'That tool/machine does not exist.' });
  } else {
    if (!payload.material_id) throw ApiError.badRequest('Check the highlighted fields.', { material_id: 'Select a material.' });
    material = await materialModel.findById(payload.material_id);
    if (!material) throw ApiError.badRequest('Check the highlighted fields.', { material_id: 'That material does not exist.' });
  }

  if (kind === 'central_purchase') {
    // Outside supplier -> Central company warehouse. No project.
    if (isContractor) throw ApiError.forbidden('Only Admin/Procurement can purchase into the central warehouse.');
    return {
      material,
      tool,
      columns: {
        procurement_kind: 'central_purchase',
        item_type: isTool ? 'tool' : 'material',
        material_id: material?.id || null,
        tool_id: tool?.id || null,
        source_type: 'supplier',
        destination_type: 'central_warehouse',
        destination_warehouse_id: await getCentralWarehouseId(),
        project_id: null, site_id: null,
      },
    };
  }

  if (kind === 'contractor_supply') {
    // Material going INTO a contractor warehouse from a supplier or central.
    const sourceType = SOURCE_TYPES.includes(payload.source_type) ? payload.source_type : 'central_warehouse';
    if (!['supplier', 'central_warehouse'].includes(sourceType)) {
      throw ApiError.badRequest('Check the highlighted fields.', { source_type: 'A contractor supply must come from a supplier or the central warehouse.' });
    }
    // A Project Manager requests FOR the contractor responsible for the site.
    const pmDefault = pmScope.isPm(hrScope) && !payload.destination_contractor_id
      ? await pmScope.responsibleContractorId(Number(payload.project_id), payload.site_id ? Number(payload.site_id) : null)
      : null;
    const destContractorId = isContractor ? ownContractorId : Number(payload.destination_contractor_id || pmDefault);
    if (!destContractorId) {
      // A site with no contractor is run by its Project Manager: deliver to its Site Store.
      const store = await pmSiteStoreDestination(payload);
      if (!store) throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'Select the receiving contractor.' });
      const columns = {
        procurement_kind: 'contractor_supply',
        item_type: isTool ? 'tool' : 'material',
        material_id: material?.id || null,
        tool_id: tool?.id || null,
        source_type: sourceType,
        ...store,
        project_id: payload.project_id ?? null,
        site_id: payload.site_id ?? null,
        task_id: payload.task_id ? Number(payload.task_id) : null,
      };
      if (sourceType === 'central_warehouse') {
        columns.source_warehouse_id = payload.source_warehouse_id
          ? Number(payload.source_warehouse_id)
          : await getCentralWarehouseId(payload.material_id, payload.quantity);
      }
      return { material, tool, columns };
    }
    const destWarehouseId = await getContractorWarehouseId(destContractorId);
    const columns = {
      procurement_kind: 'contractor_supply',
      item_type: isTool ? 'tool' : 'material',
      material_id: material?.id || null,
      tool_id: tool?.id || null,
      source_type: sourceType,
      destination_type: 'contractor_warehouse',
      destination_contractor_id: destContractorId,
      destination_warehouse_id: destWarehouseId,
      destination_site_id: payload.destination_site_id ?? payload.site_id ?? null,
      project_id: payload.project_id ?? null,
      site_id: payload.site_id ?? null,
      task_id: payload.task_id ? Number(payload.task_id) : null,
    };
    if (sourceType === 'central_warehouse') {
      columns.source_warehouse_id = payload.source_warehouse_id
        ? Number(payload.source_warehouse_id)
        : await getCentralWarehouseId(payload.material_id, payload.quantity);
    }
    return { material, tool, columns };
  }

  if (kind === 'internal_transfer') {
    // Contractor/site -> Contractor/site. Both ends are internal (no finance).
    const sourceContractorId = isContractor
      ? (payload.source_contractor_id ? Number(payload.source_contractor_id) : null)
      : (payload.source_contractor_id ? Number(payload.source_contractor_id) : null);
    const pmDefault = pmScope.isPm(hrScope) && !payload.destination_contractor_id
      ? await pmScope.responsibleContractorId(Number(payload.project_id), payload.site_id ? Number(payload.site_id) : null)
      : null;
    const destContractorId = isContractor
      ? ownContractorId
      : (payload.destination_contractor_id ? Number(payload.destination_contractor_id) : pmDefault);
    if (!sourceContractorId) throw ApiError.badRequest('Check the highlighted fields.', { source_contractor_id: 'Select the source contractor.' });
    if (!destContractorId) {
      // Transfer from a contractor INTO a PM-run site's Site Store.
      const store = await pmSiteStoreDestination(payload);
      if (!store) throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'Select the destination contractor.' });
      return {
        material,
        tool,
        columns: {
          procurement_kind: 'internal_transfer',
          item_type: isTool ? 'tool' : 'material',
          material_id: material?.id || null,
          tool_id: tool?.id || null,
          source_type: 'contractor',
          source_contractor_id: sourceContractorId,
          source_warehouse_id: await getContractorWarehouseId(sourceContractorId),
          source_site_id: payload.source_site_id ?? null,
          ...store,
          project_id: payload.project_id ?? null,
          site_id: payload.site_id ?? null,
          task_id: payload.task_id ? Number(payload.task_id) : null,
        },
      };
    }
    if (Number(sourceContractorId) === Number(destContractorId)) {
      throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'Choose a different contractor to transfer to.' });
    }
    return {
      material,
      tool,
      columns: {
        procurement_kind: 'internal_transfer',
        item_type: isTool ? 'tool' : 'material',
        material_id: material?.id || null,
        tool_id: tool?.id || null,
        source_type: 'contractor',
        destination_type: 'contractor_warehouse',
        source_contractor_id: sourceContractorId,
        source_warehouse_id: await getContractorWarehouseId(sourceContractorId),
        source_site_id: payload.source_site_id ?? null,
        destination_contractor_id: destContractorId,
        destination_warehouse_id: await getContractorWarehouseId(destContractorId),
        destination_site_id: payload.destination_site_id ?? payload.site_id ?? null,
        project_id: payload.project_id ?? null,
        site_id: payload.site_id ?? null,
        task_id: payload.task_id ? Number(payload.task_id) : null,
      },
    };
  }

  throw ApiError.badRequest('Check the highlighted fields.', { procurement_kind: 'Choose a valid procurement type.' });
}

async function create(payload, userId, hrScope, options = {}) {
  // Project Managers raise requests only for projects/sites they are assigned
  // to, and only for delivery to a site - never vendor buying into the central
  // warehouse (Admin/Procurement).
  if (pmScope.isPm(hrScope)) {
    if (payload.procurement_kind === 'central_purchase') {
      throw ApiError.forbidden('Only Admin/Procurement can purchase into the central warehouse.');
    }
    if (!payload.project_id) {
      throw ApiError.badRequest('Check the highlighted fields.', { project_id: 'Select one of your assigned projects.' });
    }
    pmScope.assertPmAssigned(hrScope, payload.project_id, payload.site_id ?? null);
  }

  const { material, tool, columns: flow } = await resolveFlow(payload, hrScope);
  const areaId = flow.project_id
    ? await areaService.assertAreaFor(payload.area_id ?? payload.areaId, flow.project_id, flow.site_id ?? null)
    : null;
  const quotedTransport = moneyOrNull(payload.transport_cost, 'transport_cost');

  // A contractor may only procure for one of THEIR OWN assigned project/sites.
  if (hrScope?.role === ROLES.CONTRACTOR && flow.procurement_kind !== 'project_site') {
    if (!payload.project_id) {
      throw ApiError.badRequest('Check the highlighted fields.', { project_id: 'Select one of your assigned projects.' });
    }
    await assertContractorLocation({ project_id: payload.project_id, site_id: payload.site_id ?? null }, hrScope);
  }

  if (Number(payload.quantity) <= 0) {
    throw ApiError.badRequest('Check the highlighted fields.', { quantity: 'Enter a quantity greater than zero.' });
  }

  // Admin vendor procurement INTO the central warehouse records the vendor's
  // dispatch (vehicle + driver) up front - the warehouse verifies it on receipt.
  // A contractor / PM requesting material is NOT dispatching anything, so no
  // vehicle number is asked of them; it is captured later by whoever dispatches.
  if (flow.procurement_kind === 'central_purchase' && payload.status !== 'draft' && !normalizeVehicle(payload.vehicle_number)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      vehicle_number: 'Vehicle number is mandatory for vendor deliveries into the Central Warehouse.',
    });
  }

  // 1. Task Baseline Enforcement
  const isContractor = hrScope?.role === ROLES.CONTRACTOR;
  const isPM = hrScope?.role === 'project_manager';
  const taskId = payload.task_id ? Number(payload.task_id) : (flow.task_id ? Number(flow.task_id) : null);

  if ((isContractor || isPM) && payload.project_id && !taskId) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      task_id: 'Select an Admin-planned Task for this procurement.',
    });
  }

  // Optional subtask under the main task; when absent the request is booked on the
  // main task's own (direct) plan, which for a task without subtasks is the whole plan.
  const subtask = await resolveSubtask(taskId, subtaskIdFrom(payload));
  const planScope = subtask ? subtask.id : null;
  const scopeSql = planScope ? ' AND subtask_id = ?' : ' AND subtask_id IS NULL';
  const scopeParams = planScope ? [planScope] : [];

  let isExcess = false;
  let isUnplanned = false;
  let excessQuantity = 0;
  let plannedQtyAtReq = null;
  let procuredQtyAtReq = null;
  let task = null;

  const isTool = flow.item_type === 'tool';
  const unitToUse = payload.unit?.trim() || material?.unit || 'unit';

  if (taskId && !isTool && payload.material_id) {
    const [taskRows] = await pool.query(
      `SELECT t.*, p.name AS project_name, s.name AS site_name
       FROM project_tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN sites s ON s.id = t.site_id
       WHERE t.id = ? LIMIT 1`,
      [taskId]
    );
    if (!taskRows.length) {
      throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'Selected task does not exist.' });
    }
    task = taskRows[0];
    if (payload.project_id && Number(task.project_id) !== Number(payload.project_id)) {
      throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'Selected task does not belong to this project.' });
    }
    if (payload.site_id && task.site_id && Number(task.site_id) !== Number(payload.site_id)) {
      throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'Selected task does not belong to this site.' });
    }

    // Check task_materials for planned quantity
    const [tmRows] = await pool.query(
      `SELECT * FROM task_materials WHERE task_id = ? AND material_id = ?${scopeSql}`,
      [taskId, Number(payload.material_id), ...scopeParams]
    );

    const requestedQty = Number(payload.quantity);

    // Sum already procured quantity on this task for this material
    const [[procSum]] = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0) AS total_procured
       FROM procurement_requests
       WHERE task_id = ? AND material_id = ? AND status NOT IN ('rejected', 'cancelled')${scopeSql}`,
      [taskId, Number(payload.material_id), ...scopeParams]
    );
    procuredQtyAtReq = Number(procSum.total_procured || 0);

    if (tmRows.length > 0) {
      // A material can appear on more than one plan row of the same scope.
      const originalPlanned = tmRows.reduce((s, r) => s + Number(r.quantity || 0), 0);
      const approvedAdditional = tmRows.reduce((s, r) => s + Number(r.approved_additional_quantity || 0), 0);
      plannedQtyAtReq = Number((originalPlanned + approvedAdditional).toFixed(2));
      const remainingPlanned = Math.max(0, Number((plannedQtyAtReq - procuredQtyAtReq).toFixed(2)));

      if (requestedQty > remainingPlanned) {
        isExcess = true;
        excessQuantity = Number((requestedQty - remainingPlanned).toFixed(2));
      }
    } else {
      // Material not planned for this task: Admin must authorise it before it can be procured.
      isExcess = true;
      isUnplanned = true;
      plannedQtyAtReq = 0;
      excessQuantity = requestedQty;
    }

    if (isExcess) {
      const reasonText = (payload.excess_reason || payload.reason || '').trim();
      if (!reasonText) {
        throw ApiError.badRequest('Check the highlighted fields.', {
          excess_reason: isUnplanned
            ? `${material?.name || 'This material'} is not planned for ${subtask ? `subtask "${subtask.name}"` : 'this task'}. Give a reason - Admin must authorise it before it can be procured.`
            : `Requested quantity exceeds the Admin-planned quantity by ${excessQuantity} ${unitToUse}. Reason for excess procurement is mandatory.`,
        });
      }
    }
  }

  // Contractors / PMs may only request a machine that Admin planned for the task.
  // How it is obtained (owned / purchased / rented) and every rate is Admin's call,
  // so any requester-supplied mode or cost is ignored.
  if ((isContractor || isPM) && isTool && taskId && tool) {
    const planned = (await taskModel.findPlannedTools(taskId, undefined, planScope)).find((t) => Number(t.toolId) === Number(tool.id));
    if (!planned) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        tool_id: subtask
          ? `This machine is not planned for subtask "${subtask.name}". Ask Admin to add it to the subtask budget first.`
          : 'This machine is not planned for the selected task. Ask Admin to add it to the task budget first.',
      });
    }
    if (Number(payload.quantity) > planned.remainingQuantity) {
      const reasonText = (payload.excess_reason || payload.reason || '').trim();
      if (!reasonText) {
        throw ApiError.badRequest('Check the highlighted fields.', {
          excess_reason: `All ${planned.plannedQuantity} planned ${tool.name} for this task are already requested. A reason is mandatory for an extra machine.`,
        });
      }
      isExcess = true;
      plannedQtyAtReq = planned.plannedQuantity;
      procuredQtyAtReq = planned.alreadyRequested;
      excessQuantity = Number(payload.quantity);
    }
    for (const k of ['tool_procurement_type', 'toolProcurementType', 'rental_cost', 'rentalCost', 'usage_charge_rate', 'usageChargeRate',
      'usage_charge_total', 'usage_charge_days', 'usage_charge_policy', 'purchase_rate', 'estimated_rate', 'total_amount', 'tool_unit_id']) {
      delete payload[k];
    }
    // How long the machine is needed: from a date, for N days (the last day follows).
    const days = Math.floor(Number(payload.rental_days ?? payload.rentalDays ?? planned.plannedDays ?? 0));
    const from = payload.rental_start_date || payload.rentalStartDate || null;
    if (!(days >= 1)) {
      throw ApiError.badRequest('Check the highlighted fields.', { rental_days: 'Enter for how many days the machine is needed.' });
    }
    if (!from) {
      throw ApiError.badRequest('Check the highlighted fields.', { rental_start_date: 'Enter from which date the machine is needed.' });
    }
    const until = new Date(from);
    until.setDate(until.getDate() + days - 1);
    payload.rental_days = days;
    payload.rental_start_date = from;
    payload.rental_end_date = until.toISOString().slice(0, 10);
    // Longer than the task plan: Admin approves the extra days.
    if (planned.plannedDays > 0 && days > planned.plannedDays) {
      const reasonText = (payload.excess_reason || payload.reason || '').trim();
      if (!reasonText) {
        throw ApiError.badRequest('Check the highlighted fields.', {
          excess_reason: `${tool.name} was planned for ${planned.plannedDays} day(s) but is requested for ${days}. A reason is mandatory - Admin approves the extra days.`,
        });
      }
      isExcess = true;
      plannedQtyAtReq = plannedQtyAtReq ?? planned.plannedQuantity;
      procuredQtyAtReq = procuredQtyAtReq ?? planned.alreadyRequested;
    }
  }

  let status = payload.status && STATUSES.includes(payload.status) ? payload.status : 'draft';
  if (isExcess) {
    status = 'pending_approval';
  } else if (status !== 'draft' && status !== 'requested') {
    throw ApiError.badRequest('Check the highlighted fields.', {
      status: 'A new request can only start as Draft or Requested.',
    });
  }

  const requestNumber = payload.request_number?.trim() || (await generateRequestNumber());
  if (await procurementModel.findByRequestNumber(requestNumber)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      request_number: 'That request number is already in use.',
    });
  }

  const fallbackRate = Number(material?.default_rate || material?.purchase_rate || 0);
  let effectivePurchaseRate = payload.purchase_rate != null && Number(payload.purchase_rate) > 0
    ? Number(payload.purchase_rate)
    : (payload.estimated_rate != null && Number(payload.estimated_rate) > 0
        ? Number(payload.estimated_rate)
        : (fallbackRate > 0 ? fallbackRate : null));

  let toolProcurementType = payload.tool_procurement_type || payload.toolProcurementType || null;
  let rentalCost = payload.rental_cost != null ? Number(payload.rental_cost) : (payload.rentalCost != null ? Number(payload.rentalCost) : null);
  let usageChargeRate = payload.usage_charge_rate != null ? Number(payload.usage_charge_rate) : (payload.usageChargeRate != null ? Number(payload.usageChargeRate) : null);
  let usageChargeTotal = payload.usage_charge_total != null && payload.usage_charge_total !== '' ? Number(payload.usage_charge_total) : null;
  let usageChargeDays = payload.usage_charge_days != null && payload.usage_charge_days !== '' ? Number(payload.usage_charge_days) : null;
  let usageChargePolicy = payload.usage_charge_policy || null;
  let rentalDays = payload.rental_days != null ? Number(payload.rental_days) : (payload.rentalDays != null ? Number(payload.rentalDays) : null);
  let rentalStartDate = payload.rental_start_date || payload.rentalStartDate || null;
  let rentalEndDate = payload.rental_end_date || payload.rentalEndDate || null;
  let requestedUnitId = null;
  let unavailableNotice = null;

  if (isTool && tool) {
    // Every physical machine is tracked by its own serial number, so a machine
    // request is for exactly one unit; raise one request per machine.
    if (Number(payload.quantity) !== 1) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        quantity: 'Each physical machine is tracked by its own serial number - raise one request per machine (quantity 1).',
      });
    }
    // The requester's source choice still applies, mapped onto how a machine is
    // actually obtained: Central Warehouse / Another Contractor = a machine the
    // company already owns (allocation or reassignment); Outside Supplier = a
    // rented or newly purchased machine.
    const fromSupplier = flow.source_type === 'supplier' && flow.procurement_kind !== 'project_site';
    toolProcurementType = toolProcurementType || (fromSupplier ? 'to_be_purchased' : 'purchased_owned');
    if (!fromSupplier && flow.procurement_kind !== 'project_site' && toolProcurementType !== 'purchased_owned') {
      throw ApiError.badRequest('Check the highlighted fields.', {
        tool_procurement_type: 'A machine taken from the Central Warehouse or another contractor is an owned machine allocation.',
      });
    }
    if (!['purchased_owned', 'to_be_purchased', 'rented'].includes(toolProcurementType)) {
      throw ApiError.badRequest('Check the highlighted fields.', { tool_procurement_type: 'Choose Purchased/Owned, To Be Purchased or Rented.' });
    }

    if (payload.tool_unit_id) {
      const unitRow = await toolUnitService.loadUnitRow(Number(payload.tool_unit_id));
      if (!unitRow || Number(unitRow.tool_id) !== Number(tool.id)) {
        throw ApiError.badRequest('Check the highlighted fields.', { tool_unit_id: 'That serial number does not belong to the selected machine type.' });
      }
      requestedUnitId = unitRow.id;
    }

    if (toolProcurementType === 'purchased_owned') {
      // Allocating a machine the company already owns is NOT a purchase: no
      // purchase rate / total is recorded and nothing reaches vendor payables.
      effectivePurchaseRate = null;
      const availability = await toolUnitService.availabilityForTool(tool.id);
      if (availability.available === 0 && status !== 'draft') {
        // Never auto-approve an unavailable machine: route to Admin with the
        // current holders of each serial.
        status = 'pending_approval';
        unavailableNotice = availability;
      }
    } else if (toolProcurementType === 'rented') {
      // rental_cost is the actual rate per day; the total follows from the period.
      effectivePurchaseRate = rentalCost > 0 ? rentalCost : null;
    } else if (toolProcurementType === 'to_be_purchased') {
      const est = Number(payload.estimated_rate || payload.purchase_rate || 0);
      effectivePurchaseRate = est > 0 ? est : null;
    }
  }

  if (!isTool && (!effectivePurchaseRate || effectivePurchaseRate <= 0) && payload.material_id) {
    const actualRate = await getActualMaterialRate(payload.material_id);
    if (actualRate > 0) effectivePurchaseRate = actualRate;
    else if (material?.default_rate && Number(material.default_rate) > 0) {
      effectivePurchaseRate = Number(material.default_rate);
    }
  }

  let effectiveTotalAmount = payload.total_amount != null && Number(payload.total_amount) > 0
    ? Number(payload.total_amount)
    : null;

  if (isTool) {
    if (toolProcurementType === 'purchased_owned') {
      effectiveTotalAmount = null;
    } else if (toolProcurementType === 'rented') {
      const days = rentalDays || (rentalStartDate && rentalEndDate
        ? Math.max(1, Math.round((Date.parse(rentalEndDate) - Date.parse(rentalStartDate)) / 86400000) + 1)
        : null);
      rentalDays = days;
      effectiveTotalAmount = effectivePurchaseRate && days ? Number((effectivePurchaseRate * days).toFixed(2)) : null;
    } else if (!effectiveTotalAmount && effectivePurchaseRate != null) {
      effectiveTotalAmount = Number(effectivePurchaseRate.toFixed(2));
    }
  } else if (!effectiveTotalAmount && effectivePurchaseRate != null && payload.quantity) {
    effectiveTotalAmount = Number((effectivePurchaseRate * Number(payload.quantity)).toFixed(2));
  }

  // Who the request is for: the contractor responsible for the site. Stored so
  // every request maps to Requester + Project + Site + Task + Contractor.
  let responsibleContractorId = null;
  if (hrScope?.role === ROLES.CONTRACTOR) responsibleContractorId = Number(hrScope.contractorId);
  else if (flow.destination_contractor_id) responsibleContractorId = Number(flow.destination_contractor_id);
  else if (payload.project_id) responsibleContractorId = await pmScope.responsibleContractorId(Number(payload.project_id), payload.site_id ? Number(payload.site_id) : null);

  if (pmScope.isPm(hrScope) && flow.destination_contractor_id) {
    const owner = await pmScope.responsibleContractorId(Number(payload.project_id), payload.site_id ? Number(payload.site_id) : null);
    if (owner && Number(flow.destination_contractor_id) !== Number(owner)) {
      throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'Choose the contractor responsible for this site.' });
    }
  }

  // A multi-item batch first validates every item this way, then creates them all.
  if (options.dryRun) return { dryRun: true };

  const id = await procurementModel.create({
    request_number: requestNumber,
    batch_id: options.batchId || null,
    material_id: flow.material_id ?? (payload.material_id ? Number(payload.material_id) : null),
    tool_id: flow.tool_id ?? (payload.tool_id ? Number(payload.tool_id) : null),
    item_type: flow.item_type || (isTool ? 'tool' : 'material'),
    supplier: payload.supplier ?? null,
    supplier_contact: payload.supplier_contact ?? null,
    quantity: payload.quantity,
    unit: unitToUse,
    estimated_rate: effectivePurchaseRate ?? 0,
    required_date: payload.required_date ?? null,
    priority: PRIORITIES.includes(payload.priority) ? payload.priority : 'medium',
    requested_by: payload.requested_by ?? userId ?? null,
    notes: payload.notes ?? null,
    reason: payload.reason ?? null,
    status,
    task_id: taskId,
    subtask_id: subtask ? subtask.id : null,
    is_excess: isExcess ? 1 : 0,
    excess_quantity: excessQuantity,
    excess_reason: isExcess ? (payload.excess_reason || payload.reason || null) : null,
    planned_quantity_at_request: plannedQtyAtReq,
    procured_quantity_at_request: procuredQtyAtReq,
    purchase_rate: effectivePurchaseRate ?? null,
    total_amount: effectiveTotalAmount,
    tool_procurement_type: toolProcurementType,
    rental_cost: rentalCost,
    usage_charge_rate: usageChargeRate,
    rental_days: rentalDays,
    rental_start_date: rentalStartDate,
    rental_end_date: rentalEndDate,
    purchase_date: payload.purchase_date ?? null,
    bill_reference: payload.bill_reference ?? null,
    vendor_id: payload.vendor_id ? Number(payload.vendor_id) : null,
    vehicle_number: payload.vehicle_number ? String(payload.vehicle_number).trim() : null,
    driver_name: payload.driver_name ? String(payload.driver_name).trim() : null,
    driver_phone: payload.driver_phone ? String(payload.driver_phone).trim() : null,
    challan_number: payload.challan_number ? String(payload.challan_number).trim() : null,
    challan_date: payload.challan_date || null,
    invoice_number: payload.invoice_number ? String(payload.invoice_number).trim() : null,
    invoice_date: payload.invoice_date || null,
    remarks: payload.remarks ? String(payload.remarks).trim() : null,
    tool_unit_id: requestedUnitId,
    usage_charge_total: usageChargeTotal,
    usage_charge_days: usageChargeDays,
    usage_charge_policy: usageChargePolicy,
    requester_role: hrScope?.role || null,
    contractor_id: responsibleContractorId,
    area_id: areaId,
    transport_cost: quotedTransport,
    ...flow,
  });

  if (unavailableNotice) {
    await toolUnitService.notifyUnavailable({
      tool,
      request: { id, requestNumber },
      availability: unavailableNotice,
      requesterName: null,
    });
  }

  if (isExcess) {
    const reasonText = (payload.excess_reason || payload.reason || '').trim();
    const taskName = `${task?.name || `Task #${taskId}`}${subtask ? ` › ${subtask.name}` : ''}`;
    const projName = task?.project_name || `Project #${task?.project_id || payload.project_id}`;
    const itemUnit = material?.unit || 'unit';
    const itemName = material?.name || tool?.name || 'Item';
    const notifTitle = isUnplanned
      ? 'Unplanned Material Procurement Needs Authorisation'
      : isTool ? 'Machine Request Needs Approval' : 'Excess Material Procurement Approval Required';
    const neededFor = isTool && payload.rental_days
      ? ` needed for ${payload.rental_days} day(s) from ${payload.rental_start_date}`
      : '';
    const notifMsg = isUnplanned
      ? `${notifTitle}: ${payload.quantity} ${itemUnit} of ${itemName} is NOT in the plan for Task "${taskName}" on ${projName}. It cannot be procured until you approve it. Reason: ${reasonText}`
      : isTool
        ? `${notifTitle}: ${itemName}${neededFor} for Task "${taskName}" on ${projName} is beyond the task plan. Reason: ${reasonText}`
        : `${notifTitle}: ${payload.quantity} ${itemUnit} of ${itemName} for Task "${taskName}" on ${projName} exceeds planned baseline by ${excessQuantity} ${itemUnit}. Reason: ${reasonText}`;

    await notificationModel.create({
      role: 'admin',
      title: notifTitle,
      message: notifMsg,
      type: 'warning',
      category: 'approval',
      actionUrl: '/admin/approvals?module=procurement',
      metadata: {
        module: 'procurement',
        procurementRequestId: id,
        requestNumber,
        taskId,
        subtaskId: subtask ? subtask.id : null,
        taskName,
        projectId: task?.project_id || payload.project_id,
        projectName: projName,
        siteId: task?.site_id || payload.site_id,
        siteName: task?.site_name || null,
        materialId: payload.material_id,
        materialName: material?.name || tool?.name || null,
        neededDays: isTool ? (payload.rental_days || null) : null,
        plannedQuantity: plannedQtyAtReq,
        procuredQuantity: procuredQtyAtReq,
        requestedQuantity: Number(payload.quantity),
        excessQuantity,
        unplanned: isUnplanned,
        reason: reasonText,
        requestedBy: userId,
        requestDate: new Date().toISOString().slice(0, 10),
      },
    }).catch((e) => console.error('Failed to dispatch excess notification:', e));
  }

  return getById(id, hrScope, userId);
}

async function update(id, payload, hrScope, userId) {
  const request = await procurementModel.findRawById(id, contractorScope(hrScope, userId));
  if (!request) throw ApiError.notFound('That procurement request does not exist.');
  if (pmScope.isPm(hrScope)) {
    if (Number(request.requested_by) !== Number(userId)) {
      throw ApiError.forbidden('A Project Manager can only edit requests they raised themselves.');
    }
    pmScope.assertPmAssigned(hrScope, payload.project_id ?? request.project_id, payload.site_id !== undefined ? payload.site_id : request.site_id);
  }

  // Editing the request body (quantity, rate, supplier, ...) is only safe
  // while nothing downstream — an approval or a purchase order — depends on
  // the current values yet.
  if (!['draft', 'requested'].includes(request.status)) {
    throw ApiError.badRequest(`A request that is already ${request.status.replace('_', ' ')} can no longer be edited.`);
  }

  if (payload.project_id || payload.site_id !== undefined || payload.material_id || payload.tool_id) {
    await assertContractorLocation({
      project_id: payload.project_id ?? request.project_id,
      site_id: payload.site_id !== undefined ? payload.site_id : request.site_id,
    }, hrScope);
    await assertRelationships({
      project_id: payload.project_id ?? request.project_id,
      site_id: payload.site_id !== undefined ? payload.site_id : request.site_id,
      material_id: payload.material_id ?? request.material_id,
      tool_id: payload.tool_id ?? request.tool_id,
      item_type: payload.item_type ?? request.item_type,
    });
  }

  if (payload.quantity !== undefined && Number(payload.quantity) <= 0) {
    throw ApiError.badRequest('Check the highlighted fields.', { quantity: 'Enter a quantity greater than zero.' });
  }

  // A Draft/Requested request was within the task plan when raised (anything beyond it
  // went straight to Admin as Pending Approval). Editing must not move it outside the
  // plan behind Admin's back: unplanned or extra material needs its own request.
  const role = hrScope?.role;
  const isMaterialRequest = (payload.item_type ?? request.item_type) !== 'tool' && (payload.material_id ?? request.material_id);
  if ((role === ROLES.CONTRACTOR || role === 'project_manager') && isMaterialRequest) {
    const taskId = Number(payload.task_id ?? request.task_id) || null;
    const subtaskId = payload.subtask_id !== undefined || payload.subtaskId !== undefined
      ? (Number(subtaskIdFrom(payload)) || null)
      : (request.subtask_id || null);
    const materialId = Number(payload.material_id ?? request.material_id);
    const qty = Number(payload.quantity ?? request.quantity);
    const changed = Number(materialId) !== Number(request.material_id) || qty !== Number(request.quantity)
      || taskId !== (Number(request.task_id) || null) || subtaskId !== (request.subtask_id || null);
    if (taskId && changed) {
      const scopeSql = subtaskId ? ' AND subtask_id = ?' : ' AND subtask_id IS NULL';
      const scopeParams = subtaskId ? [subtaskId] : [];
      const [[plan]] = await pool.query(
        `SELECT COUNT(*) AS plan_lines, COALESCE(SUM(quantity + COALESCE(approved_additional_quantity, 0)), 0) AS planned
         FROM task_materials WHERE task_id = ? AND material_id = ?${scopeSql}`,
        [taskId, materialId, ...scopeParams]
      );
      const [[proc]] = await pool.query(
        `SELECT COALESCE(SUM(quantity), 0) AS procured FROM procurement_requests
         WHERE task_id = ? AND material_id = ? AND id <> ? AND status NOT IN ('rejected', 'cancelled')${scopeSql}`,
        [taskId, materialId, id, ...scopeParams]
      );
      if (!Number(plan.plan_lines)) {
        throw ApiError.badRequest('Check the highlighted fields.', {
          material_id: 'That material is not planned for this task. Raise a new request with a reason - Admin must authorise unplanned material before it can be procured.',
        });
      }
      const remaining = Math.max(0, Number((Number(plan.planned) - Number(proc.procured)).toFixed(2)));
      if (qty > remaining + 1e-9) {
        throw ApiError.badRequest('Check the highlighted fields.', {
          quantity: `Only ${remaining} is still within the plan. For more, raise a new request with a reason for Admin approval.`,
        });
      }
    }
  }

  const updatePayload = { ...payload };
  if (payload.area_id !== undefined || payload.areaId !== undefined) {
    const projectId = payload.project_id ?? request.project_id;
    updatePayload.area_id = projectId
      ? await areaService.assertAreaFor(payload.area_id ?? payload.areaId, projectId, payload.site_id !== undefined ? payload.site_id : request.site_id)
      : null;
  }
  if (payload.transport_cost !== undefined) updatePayload.transport_cost = moneyOrNull(payload.transport_cost, 'transport_cost');
  if (updatePayload.total_amount === undefined || updatePayload.total_amount === null) {
    const finalQty = updatePayload.quantity !== undefined ? Number(updatePayload.quantity) : Number(request.quantity);
    const finalRate = updatePayload.purchase_rate !== undefined
      ? (updatePayload.purchase_rate !== null ? Number(updatePayload.purchase_rate) : null)
      : (request.purchase_rate !== null ? Number(request.purchase_rate) : null);
    if (finalRate !== null && finalQty > 0) {
      updatePayload.total_amount = Number((finalQty * finalRate).toFixed(2));
    }
  }

  await procurementModel.update(id, updatePayload);
  return getById(id, hrScope, userId);
}

/**
 * Plain status transitions (Draft -> Requested -> Pending Approval ->
 * Approved -> Rejected, plus Cancelled). "Ordered" and the receiving
 * statuses go through their own dedicated flows below because they carry
 * extra fields a bare status flip can't supply.
 */
async function updateStatus(id, nextStatus, role, hrScope, userId) {
  assertValidStatus(nextStatus);
  const request = await procurementModel.findRawById(id, contractorScope(hrScope, userId));
  if (!request) throw ApiError.notFound('That procurement request does not exist.');
  if (pmScope.isPm(hrScope) && Number(request.requested_by) !== Number(userId)) {
    throw ApiError.forbidden('A Project Manager can only progress requests they raised themselves.');
  }

  if (nextStatus === ORDER_ONLY_STATUS || RECEIVING_ONLY_STATUSES.has(nextStatus)) {
    throw ApiError.badRequest(
      nextStatus === ORDER_ONLY_STATUS
        ? 'Use the "place order" action to move a request to Ordered.'
        : 'Received quantities are recorded through the receiving action, not a status update.'
    );
  }

  // Confirming a transfer is the supplying contractor's decision, and is only
  // ever taken through the dedicated confirm action, which verifies WHO is
  // confirming. A bare status PATCH carries no such proof.
  if (nextStatus === CONFIRM_ONLY_STATUS) {
    throw ApiError.badRequest('Use the "confirm request" action to confirm a transfer.');
  }

  const allowed = TRANSITIONS[request.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw ApiError.badRequest(
      `A request that is ${request.status.replace('_', ' ')} cannot move to ${nextStatus.replace('_', ' ')}.`
    );
  }

  // Approve/reject is a decision, not routine progress — reserved for Admin,
  // the same authority approvalService already requires for its decisions.
  if (['approved', 'rejected'].includes(nextStatus) && role && role !== 'admin') {
    throw ApiError.forbidden('Only Admin can approve or reject a procurement request.');
  }

  // A dispatched machine is already allocated to the contractor: it must be received
  // (and later returned), never cancelled while in transit.
  if (nextStatus === 'cancelled' && request.status === 'ordered' && (request.item_type === 'tool' || (!request.material_id && request.tool_id))) {
    throw ApiError.badRequest('This machine is already dispatched. Receive it, then return it from Machines & Tools if it is not needed.');
  }

  await procurementModel.updateStatus(id, nextStatus);

  // If Admin approved an excess material procurement request, link additional approved quantity to task
  if (nextStatus === 'approved' && request.is_excess && request.task_id) {
    const excessQty = Number(request.excess_quantity || 0);
    if (excessQty > 0) {
      const reqScopeSql = request.subtask_id ? ' AND subtask_id = ?' : ' AND subtask_id IS NULL';
      const reqScopeParams = request.subtask_id ? [request.subtask_id] : [];
      const [existingTm] = await pool.query(
        `SELECT * FROM task_materials WHERE task_id = ? AND material_id = ?${reqScopeSql} ORDER BY id LIMIT 1`,
        [request.task_id, request.material_id, ...reqScopeParams]
      );
      if (existingTm.length > 0) {
        const curPlanned = Number(existingTm[0].quantity || 0);
        const curApprovedAdd = Number(existingTm[0].approved_additional_quantity || 0);
        const newApprovedAdd = Number((curApprovedAdd + excessQty).toFixed(2));
        const costPerUnit = Number(existingTm[0].cost_per_unit || 0);
        const newTotalCost = Number(((curPlanned + newApprovedAdd) * costPerUnit + Number(existingTm[0].transport_cost || 0)).toFixed(2));
        await pool.query(
          `UPDATE task_materials
           SET approved_additional_quantity = ?,
               total_cost = ?
           WHERE id = ?`,
          [newApprovedAdd, newTotalCost, existingTm[0].id]
        );
      } else {
        const rate = Number(request.estimated_rate || request.purchase_rate || 0);
        await pool.query(
          `INSERT INTO task_materials (task_id, subtask_id, project_id, site_id, material_id, quantity, approved_additional_quantity, cost_per_unit, total_cost)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [request.task_id, request.subtask_id || null, request.project_id, request.site_id, request.material_id, excessQty, rate, excessQty * rate]
        );
      }
      // The subtask's own material budget follows its plan rows.
      if (request.subtask_id) await taskModel.recalcSubtaskBudget(pool, request.subtask_id);

      // Recalculate task material_budget and total_budget
      const [[matSum]] = await pool.query(
        'SELECT COALESCE(SUM(total_cost), 0) AS total_mat FROM task_materials WHERE task_id = ?',
        [request.task_id]
      );
      const newMatBudget = Number(matSum.total_mat || 0);
      await pool.query(
        `UPDATE project_tasks
         SET material_budget = ?,
             total_budget = ? + tool_budget + labour_budget + misc_budget
         WHERE id = ?`,
        [newMatBudget, newMatBudget, request.task_id]
      );

      // Recalculate project estimated_budget
      if (request.project_id) {
        const [[taskSum]] = await pool.query(
          'SELECT COALESCE(SUM(total_budget), 0) AS total_sum FROM project_tasks WHERE project_id = ?',
          [request.project_id]
        );
        if (Number(taskSum.total_sum) > 0) {
          await pool.query('UPDATE projects SET estimated_budget = ? WHERE id = ?', [
            Number(taskSum.total_sum),
            request.project_id,
          ]);
        }
      }
    }
  }

  // Tell the contractor / PM who raised it, so the procurement can flow on (or stop).
  if (['approved', 'rejected'].includes(nextStatus) && request.requested_by && Number(request.requested_by) !== Number(userId)) {
    const requesterRole = request.requester_role;
    const base = requesterRole === ROLES.CONTRACTOR ? '/contractor/procurement'
      : requesterRole === ROLES.PROJECT_MANAGER ? '/pm/procurement'
      : '/admin/procurement';
    const [[item]] = await pool.query(
      `SELECT COALESCE(m.name, t.name, 'Item') AS name FROM procurement_requests pr
       LEFT JOIN materials m ON m.id = pr.material_id LEFT JOIN tools t ON t.id = pr.tool_id WHERE pr.id = ?`,
      [id]
    );
    const unplanned = Boolean(request.is_excess) && Number(request.planned_quantity_at_request || 0) === 0;
    const what = `${request.request_number}: ${request.quantity} ${request.unit || ''} ${item?.name || ''}`.replace(/\s+/g, ' ').trim();
    await notificationModel.create({
      userId: request.requested_by,
      title: nextStatus === 'approved'
        ? (unplanned ? 'Unplanned material authorised' : 'Procurement request approved')
        : (unplanned ? 'Unplanned material not authorised' : 'Procurement request rejected'),
      message: nextStatus === 'approved'
        ? `${what} was approved by Admin. Procurement can now proceed.`
        : `${what} was rejected by Admin and will not be procured.`,
      type: nextStatus === 'approved' ? 'success' : 'warning',
      category: 'approval',
      actionUrl: `${base}/${id}`,
      metadata: { module: 'procurement', procurementRequestId: id, status: nextStatus, unplanned },
    }).catch((e) => console.error('Failed to notify requester:', e));
  }

  return getById(id, hrScope, userId);
}

/**
 * APPROVED -> SOURCE_CONFIRMED. The supplying (source) contractor accepts an
 * approved internal transfer, agreeing to send the material.
 *
 * This step is a decision only:
 *   - it moves NO stock (nothing is issued, nothing is received),
 *   - it creates NO Finance entry (internal transfers never carry one),
 *   - it does NOT mark the material as sent (no material movement is created).
 * The physical move still happens in dispatch() (source stock out) and
 * materialMovementService.receiveMaterial() (destination stock in).
 */
async function confirmSource(id, hrScope, userId) {
  const request = await procurementModel.findRawById(id, contractorScope(hrScope, userId));
  if (!request) throw ApiError.notFound('That procurement request does not exist.');

  if (request.procurement_kind !== 'internal_transfer') {
    throw ApiError.badRequest('Only a contractor-to-contractor transfer needs source confirmation.');
  }
  if (request.item_type === 'tool' || (!request.material_id && request.tool_id)) {
    throw ApiError.badRequest('A machine reassignment is authorised by Admin, not confirmed by the holding contractor.');
  }
  if (request.status !== 'approved') {
    throw ApiError.badRequest(
      `Only an approved request can be confirmed (this one is ${request.status.replace('_', ' ')}).`
    );
  }
  // Only the SOURCE contractor — the one being asked to give up the material.
  if (hrScope?.role !== ROLES.CONTRACTOR
      || hrScope.contractorId == null
      || request.source_contractor_id == null
      || Number(hrScope.contractorId) !== Number(request.source_contractor_id)) {
    throw ApiError.forbidden('Only the supplying contractor can confirm this request.');
  }

  await procurementModel.updateStatus(id, 'source_confirmed');
  return getById(id, hrScope, userId);
}

/** Approved -> Ordered, stamping the purchase-order fields in one step. */
async function placeOrder(id, payload) {
  const request = await procurementModel.findRawById(id);
  if (!request) throw ApiError.notFound('That procurement request does not exist.');

  if (request.status !== 'approved') {
    throw ApiError.badRequest(`Only an approved request can be ordered (this one is ${request.status.replace('_', ' ')}).`);
  }
  if (request.item_type === 'tool' || (!request.material_id && request.tool_id)) {
    throw ApiError.badRequest('Machine requests are completed by registering/allocating a serial-numbered unit, not by placing an order.');
  }

  const orderedQuantity = payload.ordered_quantity !== undefined ? Number(payload.ordered_quantity) : Number(request.quantity);
  if (orderedQuantity <= 0) {
    throw ApiError.badRequest('Check the highlighted fields.', { ordered_quantity: 'Enter a quantity greater than zero.' });
  }

  const poNumber = payload.po_number?.trim() || (await generatePoNumber());
  if (await procurementModel.findByPoNumber(poNumber)) {
    throw ApiError.badRequest('Check the highlighted fields.', { po_number: 'That PO number is already in use.' });
  }

  // Vendor delivering straight to a contractor: Admin records the vendor's dispatch
  // (vehicle + driver) so the contractor can verify it on arrival.
  const receiverId = vendorOrderReceiverId(request);
  const pmSite = !receiverId && request.source_type === 'supplier' && request.procurement_kind !== 'central_purchase'
    ? pmRunSiteOf(request) : null;
  const vehicle = String(payload.vehicle_number ?? '').trim();
  if ((receiverId || pmSite) && !normalizeVehicle(vehicle)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      vehicle_number: 'Enter the vendor\'s vehicle number - the contractor verifies it when the material arrives.',
    });
  }

  await procurementModel.markOrdered(id, {
    poNumber,
    orderedQuantity,
    orderDate: payload.order_date || new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: payload.expected_delivery_date ?? null,
  });

  const dispatch = {
    vehicle_number: vehicle || null,
    driver_name: String(payload.driver_name ?? '').trim() || null,
    driver_phone: String(payload.driver_phone ?? '').trim() || null,
    challan_number: String(payload.challan_number ?? '').trim() || null,
  };
  if (Object.values(dispatch).some(Boolean)) {
    await pool.query(
      `UPDATE procurement_requests SET vehicle_number = COALESCE(?, vehicle_number), driver_name = COALESCE(?, driver_name),
         driver_phone = COALESCE(?, driver_phone), challan_number = COALESCE(?, challan_number) WHERE id = ?`,
      [dispatch.vehicle_number, dispatch.driver_name, dispatch.driver_phone, dispatch.challan_number, id]
    );
  }

  if (receiverId) {
    const [[c]] = await pool.query('SELECT user_id FROM contractors WHERE id = ? LIMIT 1', [receiverId]);
    if (c?.user_id) {
      const [[item]] = await pool.query('SELECT name FROM materials WHERE id = ? LIMIT 1', [request.material_id]);
      const driver = [dispatch.driver_name, dispatch.driver_phone].filter(Boolean).join(', ');
      await notificationModel.create({
        userId: c.user_id,
        title: 'Material ordered for delivery to you',
        message: `${poNumber}: ${orderedQuantity} ${request.unit || ''} ${item?.name || ''} from ${request.supplier || 'the vendor'}. `
          + `Vehicle ${dispatch.vehicle_number}${driver ? `, driver ${driver}` : ''}`
          + `${payload.expected_delivery_date ? `, expected ${payload.expected_delivery_date}` : ''}. Verify the vehicle and receive it when it arrives.`,
        type: 'material',
        category: 'material',
        actionUrl: `/contractor/procurement/${id}`,
        metadata: { module: 'procurement', procurementRequestId: id, poNumber, ...dispatch },
      }).catch((e) => console.error('Failed to notify receiving contractor:', e));
    }
  }
  if (pmSite) {
    const [[item]] = await pool.query('SELECT name FROM materials WHERE id = ? LIMIT 1', [request.material_id]);
    const driver = [dispatch.driver_name, dispatch.driver_phone].filter(Boolean).join(', ');
    await notifyProjectManagers(request.project_id, {
      title: 'Material ordered for your site',
      message: `${poNumber}: ${orderedQuantity} ${request.unit || ''} ${item?.name || ''} from ${request.supplier || 'the vendor'}. `
        + `Vehicle ${dispatch.vehicle_number}${driver ? `, driver ${driver}` : ''}. Verify the vehicle and receive it into the Site Store.`,
      actionUrl: `/pm/procurement/${id}`,
      metadata: { module: 'procurement', procurementRequestId: id, poNumber, ...dispatch },
    });
  }

  return getById(id);
}

/**
 * Records a delivery against an ordered (or already partially received)
 * request. Receipt, warehouse stock, ledger row and request status are written
 * in ONE transaction behind a row lock on the request, so a delivery can never
 * be half-posted and a second click / second user can never add the stock twice.
 *
 * Also lands a row in `material_entries` - the same stock ledger Interface 6
 * reads - once the transaction has committed.
 */
async function receive(id, payload, userId, hrScope, options = {}) {
  const peek = await procurementModel.findRawById(id);
  if (!peek) throw ApiError.notFound('That procurement request does not exist.');
  // A multi-item receive books the transport QUOTED on the request (never a value the
  // receiver types), so a contractor / PM receiving it still cannot set freight.
  const quoted = options.useQuotedTransport ? (Number(peek.transport_cost) > 0 ? Number(peek.transport_cost) : null) : null;

  // A contractor receives only a vendor order Admin placed for delivery to THEM.
  // Freight on that order is Admin's to book, so a contractor never enters it.
  if (hrScope?.role === ROLES.CONTRACTOR) {
    const receiverId = vendorOrderReceiverId(peek);
    if (!receiverId || receiverId !== Number(hrScope.contractorId)) {
      throw ApiError.forbidden('You can only receive a vendor order delivered to you.');
    }
    payload = { ...payload, transport_cost: quoted };
  }
  // A Project Manager receives a vendor order delivered to the Site Store of a site they run.
  if (hrScope?.role === ROLES.PROJECT_MANAGER) {
    if (!pmScope.pmHasSite(hrScope, pmRunSiteOf(peek)) || peek.source_type !== 'supplier') {
      throw ApiError.forbidden('You can only receive a vendor order delivered to a site you manage.');
    }
    payload = { ...payload, transport_cost: quoted };
  }

  const receivedQuantity = Number(payload.received_quantity);
  if (!(receivedQuantity > 0)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      received_quantity: 'Enter a quantity greater than zero.',
    });
  }
  // Freight paid for THIS delivery; booked once as a transport expense on the receipt.
  const deliveryTransport = moneyOrNull(payload.transport_cost, 'transport_cost') || 0;

  let receiptId = null;
  let request = null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[locked]] = await conn.query('SELECT * FROM procurement_requests WHERE id = ? FOR UPDATE', [id]);
    request = locked;

    if (!['ordered', 'partially_received'].includes(request.status)) {
      throw ApiError.badRequest(
        `Only an ordered request can receive stock (this one is ${request.status.replace('_', ' ')}).`
      );
    }
    const isTool = request.item_type === 'tool' || (!request.material_id && request.tool_id);
    if (isTool) {
      throw ApiError.badRequest('Machines are tracked by serial number. Register and allocate the unit from the request instead of receiving it into stock.');
    }
    // Partial deliveries each post their own ledger row (one receipt, one posting, UNIQUE
    // procurement_receipt_id); the row lock and the remaining-quantity check below are what
    // stop stock being added twice, so an earlier delivery must not block the next one.

    const orderedQuantity = Number(request.ordered_quantity);
    const [[sum]] = await conn.query(
      'SELECT COALESCE(SUM(received_quantity), 0) AS total FROM procurement_receipts WHERE procurement_request_id = ?',
      [id]
    );
    const alreadyReceived = Number(sum.total);
    const newTotal = alreadyReceived + receivedQuantity;
    if (newTotal > orderedQuantity) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        received_quantity: `Only ${(orderedQuantity - alreadyReceived).toFixed(2)} remains to be received.`,
      });
    }

    // Vehicle verification: a central-warehouse delivery must carry the vehicle
    // number recorded on dispatch, and a recorded number must match.
    const isCentral = request.procurement_kind === 'central_purchase' ||
      request.source_type === 'central_warehouse' ||
      request.destination_type === 'central_warehouse';
    const enteredVehicle = String(payload.vehicle_number ?? '').trim();
    if (isCentral || normalizeVehicle(request.vehicle_number)) {
      if (!normalizeVehicle(enteredVehicle)) {
        throw ApiError.badRequest('Check the highlighted fields.', {
          vehicle_number: 'Enter the arriving vehicle number to verify the dispatch.',
        });
      }
      if (normalizeVehicle(request.vehicle_number) && !vehiclesMatch(enteredVehicle, request.vehicle_number)) {
        throw ApiError.badRequest('Check the highlighted fields.', {
          vehicle_number: 'Vehicle number does not match the dispatch.',
        });
      }
    }
    const vehicleForRecord = enteredVehicle || request.vehicle_number || null;

    // Where the stock lands.
    let targetWarehouseId = request.destination_warehouse_id
      || (request.procurement_kind === 'central_purchase' ? await getCentralWarehouseId() : null);
    if (!targetWarehouseId && request.project_id) {
      if (request.site_id) {
        const site = await siteModel.findById(request.site_id).catch(() => null);
        if (site?.contractor_id) targetWarehouseId = await getContractorWarehouseId(site.contractor_id).catch(() => null);
      }
      if (!targetWarehouseId) {
        const project = await projectModel.findById(request.project_id).catch(() => null);
        if (project?.contractor_id) targetWarehouseId = await getContractorWarehouseId(project.contractor_id).catch(() => null);
      }
      if (!targetWarehouseId) targetWarehouseId = await getCentralWarehouseId().catch(() => null);
    }

    const receivingDate = payload.receiving_date || new Date().toISOString().slice(0, 10);
    const [rc] = await conn.query(
      `INSERT INTO procurement_receipts (procurement_request_id, received_quantity, receiving_date, notes, received_by, transport_cost)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, receivedQuantity, receivingDate, payload.notes ?? null, userId ?? null, deliveryTransport]
    );
    receiptId = rc.insertId;
    if (deliveryTransport > 0) await transportExpenseService.bookForReceipt(receiptId, userId, conn);

    if (targetWarehouseId && request.material_id) {
      const rate = Number(request.purchase_rate || request.estimated_rate || 0) || null;
      const tx = await warehouseService.receiveStock({
        material_id: request.material_id,
        warehouse_id: targetWarehouseId,
        project_id: request.project_id || null,
        site_id: request.site_id || null,
        quantity: receivedQuantity,
        unit: request.unit,
        reference: request.po_number || request.request_number,
        transaction_date: receivingDate,
        vehicle_number: vehicleForRecord,
        notes: payload.notes || `Received from vendor ${request.vendor_id ? `(ID ${request.vendor_id})` : (request.supplier || '')}`,
        unit_cost: rate,
        total_cost: rate ? Number((rate * receivedQuantity).toFixed(2)) : null,
        procurement_request_id: id,
      }, userId, { conn });
      // Link the ledger row to this receipt (UNIQUE: one receipt, one posting).
      await conn.query('UPDATE warehouse_transactions SET procurement_receipt_id = ? WHERE id = ?', [receiptId, tx.id]);
      if (!request.warehouse_transaction_id) {
        await conn.query('UPDATE procurement_requests SET warehouse_transaction_id = ? WHERE id = ?', [tx.id, id]);
      }
    }

    const newStatus = newTotal >= orderedQuantity ? 'received' : 'partially_received';
    await conn.query(
      `UPDATE procurement_requests SET status = ?, received_by = ?, received_vehicle_number = COALESCE(?, received_vehicle_number),
         fulfilled_at = CASE WHEN ? = 'received' THEN NOW() ELSE fulfilled_at END WHERE id = ?`,
      [newStatus, userId ?? null, vehicleForRecord, newStatus, id]
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  // Interface 6 ledger (best effort - never undoes a committed stock posting).
  const isMaterialForProject = request.material_id && request.project_id && !(request.item_type === 'tool');
  if (isMaterialForProject) {
    try {
      const materialEntryId = await materialModel.createEntry({
        material_id: request.material_id,
        project_id: request.project_id,
        site_id: request.site_id,
        quantity: receivedQuantity,
        used_quantity: 0,
        rate: request.estimated_rate,
        supplier: request.supplier,
        received_date: payload.receiving_date || new Date().toISOString().slice(0, 10),
        notes: `Procurement ${request.request_number}${request.po_number ? ` / ${request.po_number}` : ''}`,
      });
      await pool.query('UPDATE procurement_receipts SET material_entry_id = ? WHERE id = ?', [materialEntryId, receiptId]);
    } catch (entryError) {
      console.error('Could not mirror receipt into material_entries:', entryError.message);
    }
  }

  return getDetail(id);
}

/**
 * Corrects a previously logged receipt (e.g. a data-entry mistake), keeping
 * the request's received/remaining total and status in sync afterwards.
 */
async function updateReceipt(id, receiptId, payload) {
  const request = await procurementModel.findRawById(id);
  if (!request) throw ApiError.notFound('That procurement request does not exist.');

  const receipt = await procurementModel.findReceiptById(receiptId);
  if (!receipt || Number(receipt.procurement_request_id) !== Number(id)) {
    throw ApiError.notFound('That receiving record does not exist.');
  }

  // A receipt that has already been posted to warehouse stock cannot have its
  // quantity rewritten here - that would change the receipt but not the stock.
  const posted = await warehouseModel.findTransactionByReceipt(receiptId);
  if (posted && payload.received_quantity !== undefined && Number(payload.received_quantity) !== Number(receipt.received_quantity)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      received_quantity: `This receipt is already in warehouse stock (${posted.transaction_number}). Correct the stock with a stock adjustment instead.`,
    });
  }

  const orderedQuantity = Number(request.ordered_quantity);
  const newReceivedQuantity = payload.received_quantity !== undefined
    ? Number(payload.received_quantity)
    : Number(receipt.received_quantity);

  if (!(newReceivedQuantity > 0)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      received_quantity: 'Enter a quantity greater than zero.',
    });
  }

  const otherReceived = await procurementModel.totalReceived(id, receiptId);
  if (otherReceived + newReceivedQuantity > orderedQuantity) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      received_quantity: `Only ${(orderedQuantity - otherReceived).toFixed(2)} can be assigned to this receipt.`,
    });
  }

  await procurementModel.updateReceipt(receiptId, payload);

  const newTotal = otherReceived + newReceivedQuantity;
  const newStatus = newTotal >= orderedQuantity ? 'received' : 'partially_received';
  await procurementModel.updateStatus(id, newStatus);

  return getDetail(id);
}

async function getLookups(hrScope, userId) {
  const scope = contractorScope(hrScope, userId);
  const isContractor = hrScope?.role === ROLES.CONTRACTOR;
  const [projects, suppliers, summary, scopes, materials, tools] = await Promise.all([
    projectModel.findAll({ ...scope, page: 1, pageSize: 100 }),
    procurementModel.findSuppliers(scope),
    isContractor ? Promise.resolve(null) : procurementModel.findSummary(),
    warehouseModel.findScopes().catch(() => ({ central: [], contractors: [] })),
    materialModel.findAll({ page: 1, pageSize: 200 }).catch(() => ({ rows: [] })),
    toolModel.findAll({ status: 'active', page: 1, pageSize: 200 }).catch(() => ({ rows: [] })),
  ]);

  return {
    statuses: STATUSES,
    priorities: PRIORITIES,
    kinds: PROCUREMENT_KINDS,
    sourceTypes: SOURCE_TYPES,
    destinationTypes: DESTINATION_TYPES,
    projects: (projects.rows || [])
      .filter((p) => !pmScope.isPm(hrScope) || (hrScope.pmProjectIds || []).includes(Number(p.id)))
      .map((p) => ({ id: p.id, code: p.code, name: p.name })),
    materials: (materials.rows || []).map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit, category: m.category })),
    tools: (tools.rows || []).map((t) => ({ id: t.id, code: t.code, name: t.name, type: t.type })),
    contractors: (scopes.contractors || [])
      // "Another Contractor" — company-linked contractors only, and
      // never the requester themselves.
      .filter((c) => !isContractor || Number(c.contractor_id) !== Number(hrScope.contractorId))
      .map((c) => ({
        id: c.contractor_id, name: c.contractor_name, warehouseId: c.id,
      })),
    centralWarehouseId: scopes.central?.[0]?.id ?? null,
    suppliers,
    summary: summary && {
      total: Number(summary.total || 0),
      draft: Number(summary.draft || 0),
      requested: Number(summary.requested || 0),
      pendingApproval: Number(summary.pending_approval || 0),
      approved: Number(summary.approved || 0),
      rejected: Number(summary.rejected || 0),
      ordered: Number(summary.ordered || 0),
      partiallyReceived: Number(summary.partially_received || 0),
      received: Number(summary.received || 0),
      cancelled: Number(summary.cancelled || 0),
      estimatedValue: Number(summary.estimated_value || 0),
    },
  };
}

/**
 * Fulfils an approved request by performing the ONE warehouse-ledger movement
 * that represents the physical material arriving, and links it back.
 *
 *   supplier -> central warehouse (Admin vendor purchase) : verified receipt
 *   supplier -> contractor warehouse                      : receipt
 *
 * Vendor deliveries into the CENTRAL warehouse are VERIFIED: the receiving
 * person enters the vehicle number, it must match the dispatch recorded on the
 * request (driver, material, quantity, vendor, destination are shown to them
 * via GET /material-movements/lookup first), and only then is stock added.
 *
 * The receipt row, the warehouse ledger row, the stock increase and the request
 * status all commit together behind a row lock; a second attempt - double click,
 * second user, retry - finds the request already received and is refused, so
 * stock can never be added twice.
 *
 * Central -> contractor and contractor -> contractor moves are NOT fulfilled
 * here: they are dispatched by the sender and received (vehicle-verified) by the
 * receiving contractor, see materialMovementService.
 */
async function fulfil(id, payload = {}, userId) {
  const peek = await procurementModel.findRawById(id);
  if (!peek) throw ApiError.notFound('That procurement request does not exist.');

  const kind = peek.procurement_kind || 'project_site';

  // A contractor-to-contractor transfer must NEVER be fulfilled directly: that
  // would skip the source contractor's confirmation, the actual Send, the
  // vehicle verification and the destination's Receive.
  if (kind === 'internal_transfer') {
    throw ApiError.badRequest(
      'A contractor-to-contractor transfer cannot be fulfilled directly. '
      + 'The supplying contractor must confirm and send it, and the receiving contractor must receive it.'
    );
  }
  if (kind === 'project_site') {
    throw ApiError.badRequest('Project/site requests are received through the receiving action, not fulfilment.');
  }
  if (kind === 'contractor_supply' && peek.source_type === 'central_warehouse') {
    throw ApiError.badRequest(
      'Central warehouse supply to a contractor is sent by Admin ("Send material") and received by the contractor, who verifies the vehicle number.'
    );
  }
  const isTool = peek.item_type === 'tool' || (!peek.material_id && peek.tool_id);
  if (isTool) {
    throw ApiError.badRequest('Machines are tracked by serial number. Use "Register / allocate machine" on this request.');
  }

  // --- vehicle verification (server-side: the UI check is only a convenience)
  const recordedVehicle = peek.vehicle_number;
  const enteredVehicle = String(payload.vehicle_number ?? '').trim();
  const mustVerify = kind === 'central_purchase' || normalizeVehicle(recordedVehicle);
  if (mustVerify) {
    if (!normalizeVehicle(recordedVehicle)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        vehicle_number: 'No vehicle number was recorded for this vendor delivery, so it cannot be verified. Revert it to draft and add the dispatch vehicle first.',
      });
    }
    if (!normalizeVehicle(enteredVehicle)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        vehicle_number: 'Enter the arriving vehicle number to fetch and verify the dispatch.',
      });
    }
    if (!vehiclesMatch(enteredVehicle, recordedVehicle)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        vehicle_number: 'Vehicle number does not match the recorded dispatch.',
      });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[request]] = await conn.query('SELECT * FROM procurement_requests WHERE id = ? FOR UPDATE', [id]);

    if (request.warehouse_transaction_id || request.status === 'received') {
      throw ApiError.badRequest('This request has already been received into warehouse stock - it cannot be received twice.');
    }
    if (!['approved', 'ordered', 'partially_received'].includes(request.status)) {
      throw ApiError.badRequest(`Only an approved request can be fulfilled (this one is ${request.status.replace('_', ' ')}).`);
    }
    const [[prior]] = await conn.query(
      'SELECT COUNT(*) AS n FROM procurement_receipts WHERE procurement_request_id = ?',
      [id]
    );
    if (Number(prior.n) > 0) {
      throw ApiError.badRequest('Part of this delivery was already received through the receiving log. Complete it there.');
    }

    const quantity = Number(request.ordered_quantity || request.quantity);

    // --- actual cost: per unit and total are required and retained.
    let purchaseRate = payload.purchase_rate != null && Number(payload.purchase_rate) > 0
      ? Number(payload.purchase_rate)
      : Number(request.purchase_rate || 0);
    if (!(purchaseRate > 0) && request.source_type !== 'supplier') {
      purchaseRate = Number(request.estimated_rate || 0);
    }
    if (request.source_type === 'supplier' && !(purchaseRate > 0)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        purchase_rate: 'Enter the actual cost per unit of this vendor purchase before receiving it into stock.',
      });
    }
    let totalAmount = null;
    if (payload.total_amount != null && Number(payload.total_amount) > 0) totalAmount = Number(payload.total_amount);
    else if (payload.purchase_rate != null && Number(payload.purchase_rate) > 0 && purchaseRate > 0) totalAmount = Number((purchaseRate * quantity).toFixed(2));
    else if (request.total_amount != null && Number(request.total_amount) > 0) totalAmount = Number(request.total_amount);
    else if (purchaseRate > 0) totalAmount = Number((purchaseRate * quantity).toFixed(2));
    // What the stock cost per unit, including any agreed total - used for valuation.
    const stockUnitCost = totalAmount && quantity ? Number((totalAmount / quantity).toFixed(4)) : (purchaseRate || null);

    const receivingDate = payload.receiving_date || payload.transaction_date || new Date().toISOString().slice(0, 10);
    const deliveryTransport = moneyOrNull(payload.transport_cost, 'transport_cost') || 0;
    const destWarehouseId = request.destination_warehouse_id
      || (kind === 'central_purchase' ? await getCentralWarehouseId() : null);
    if (!destWarehouseId) {
      throw ApiError.badRequest('This request has no destination warehouse to receive stock into.');
    }

    const [rc] = await conn.query(
      `INSERT INTO procurement_receipts (procurement_request_id, received_quantity, receiving_date, notes, received_by, transport_cost)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, quantity, receivingDate, payload.notes ?? null, userId ?? null, deliveryTransport]
    );
    // Freight on a central-warehouse restock has no project to charge and stays on the receipt;
    // a delivery for a project is booked once as a transport expense.
    if (deliveryTransport > 0) await transportExpenseService.bookForReceipt(rc.insertId, userId, conn);

    const vehicleForRecord = enteredVehicle || recordedVehicle || null;
    const tx = await warehouseService.receiveStock({
      material_id: request.material_id,
      warehouse_id: destWarehouseId,
      site_id: request.destination_site_id ?? null,
      project_id: request.project_id ?? null,
      quantity,
      unit: request.unit,
      reference: request.po_number || request.request_number,
      transaction_date: receivingDate,
      vehicle_number: vehicleForRecord,
      notes: [
        vehicleForRecord ? `Vehicle: ${vehicleForRecord}` : '',
        request.driver_name ? `Driver: ${request.driver_name}` : '',
        request.reason || request.notes || '',
      ].filter(Boolean).join(' | ') || null,
      unit_cost: stockUnitCost,
      total_cost: totalAmount,
      procurement_request_id: id,
    }, userId, { conn });

    // One receipt, one ledger posting (UNIQUE procurement_receipt_id).
    await conn.query('UPDATE warehouse_transactions SET procurement_receipt_id = ? WHERE id = ?', [rc.insertId, tx.id]);

    await conn.query(
      `UPDATE procurement_requests
       SET warehouse_transaction_id = ?, fulfilled_at = NOW(), status = 'received',
           purchase_rate = ?, total_amount = ?, bill_reference = COALESCE(?, bill_reference),
           purchase_date = COALESCE(?, purchase_date, CURDATE()),
           amount_due = GREATEST(COALESCE(?, 0) - COALESCE(amount_paid, 0), 0),
           received_by = ?, received_vehicle_number = ?
       WHERE id = ?`,
      [
        tx.id, purchaseRate > 0 ? purchaseRate : null, totalAmount, payload.bill_reference ?? null,
        payload.purchase_date ?? null, totalAmount, userId ?? null, vehicleForRecord, id,
      ]
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  return getDetail(id);
}

/**
 * Admin/Procurement completes an APPROVED machine request, by procurement type:
 *
 *   purchased_owned : allocate a chosen existing serial (no purchase, no vendor
 *                     payable). If that serial is with another contractor, the
 *                     request must carry reassign=true and the current holder is
 *                     closed out on `return_date` in the same transaction.
 *   to_be_purchased : register the newly bought machine as a company asset (vendor,
 *                     purchase date, ACTUAL cost, unique serial) and allocate it.
 *   rented          : register the rented unit (vendor, actual daily rate, period)
 *                     and allocate it; rental cost is allocated by actual usage.
 */
async function toolFulfil(id, payload = {}, actor) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[request]] = await conn.query('SELECT * FROM procurement_requests WHERE id = ? FOR UPDATE', [id]);
    if (!request) throw ApiError.notFound('That procurement request does not exist.');
    const isTool = request.item_type === 'tool' || (!request.material_id && request.tool_id);
    if (!isTool) throw ApiError.badRequest('This is not a machine/tool request.');
    if (request.status === 'received' || request.tool_unit_id && request.status === 'received') {
      throw ApiError.badRequest('This machine request is already complete.');
    }
    if (request.status !== 'approved') {
      throw ApiError.badRequest(`A machine request must be approved before it can be completed (this one is ${request.status.replace('_', ' ')}).`);
    }

    const type = request.tool_procurement_type || 'purchased_owned';
    const startDate = payload.start_date || new Date().toISOString().slice(0, 10);
    const chargePolicy = payload.charge_policy
      || request.usage_charge_policy
      || (request.usage_charge_total ? 'fixed_total' : (request.usage_charge_rate ? 'per_day_rate' : 'none'));
    const context = {
      contractorId: payload.contractor_id ? Number(payload.contractor_id) : (request.contractor_id || request.destination_contractor_id || null),
      projectId: request.project_id || null,
      siteId: request.site_id || null,
      taskId: request.task_id || null,
      subtaskId: request.subtask_id || null,
      startDate,
      expectedReturnDate: payload.expected_return_date || request.rental_end_date || null,
      chargePolicy,
      chargeRate: payload.usage_charge_rate ?? request.usage_charge_rate,
      chargeTotal: payload.usage_charge_total ?? request.usage_charge_total,
      chargeDays: payload.usage_charge_days ?? request.usage_charge_days,
      unusedPolicy: payload.unused_policy,
      requestedBy: request.requested_by,
      procurementRequestId: id,
    };

    let unitId;
    let paymentFields = null;

    if (type === 'purchased_owned') {
      unitId = Number(payload.unit_id || request.tool_unit_id);
      if (!unitId) {
        throw ApiError.badRequest('Check the highlighted fields.', { unit_id: 'Select the serial number to allocate.' });
      }
      const unitRow = await toolUnitService.loadUnitRow(unitId, conn);
      if (!unitRow || Number(unitRow.tool_id) !== Number(request.tool_id)) {
        throw ApiError.badRequest('Check the highlighted fields.', { unit_id: 'That serial number does not belong to the requested machine type.' });
      }
      if (unitRow.availability_status === 'allocated') {
        if (!payload.reassign) {
          throw ApiError.badRequest(`Serial ${unitRow.serial_number} is currently with ${unitRow.contractor_name || 'another holder'}. Authorise a reassignment (and give the date they finish) to move it.`);
        }
        await toolUnitService.transferUnit(unitId, {
          contractor_id: context.contractorId, project_id: context.projectId, site_id: context.siteId, task_id: context.taskId,
          subtask_id: context.subtaskId,
          return_date: payload.return_date, start_date: payload.start_date, expected_return_date: context.expectedReturnDate,
          charge_policy: chargePolicy, usage_charge_rate: context.chargeRate, usage_charge_total: context.chargeTotal,
          usage_charge_days: context.chargeDays, unused_policy: context.unusedPolicy,
          requested_by: request.requested_by, procurement_request_id: id, notes: `Authorised for ${request.request_number}`,
        }, actor, conn);
      } else {
        await toolUnitService.allocateInTx(conn, { ...context, unitId, toolId: request.tool_id }, actor);
      }
    } else if (type === 'to_be_purchased') {
      const cost = Number(payload.purchase_cost || 0);
      const vendorId = Number(payload.vendor_id || request.vendor_id || 0) || null;
      if (!(cost > 0)) throw ApiError.badRequest('Check the highlighted fields.', { purchase_cost: 'Enter the actual purchase cost of the machine.' });
      if (!vendorId) throw ApiError.badRequest('Check the highlighted fields.', { vendor_id: 'Select the vendor the machine was bought from.' });
      unitId = await toolUnitService.registerUnit({
        tool_id: request.tool_id, serial_number: payload.serial_number, ownership_type: 'owned',
        purchase_date: payload.purchase_date || new Date().toISOString().slice(0, 10), expiry_date: payload.expiry_date,
        purchase_cost: cost, vendor_id: vendorId, health: payload.health || 'excellent', procurement_request_id: id,
      }, actor, conn);
      paymentFields = { vendorId, rate: cost, total: cost, purchaseDate: payload.purchase_date || null };
      if (payload.allocate !== false && (context.projectId || context.contractorId)) {
        await toolUnitService.allocateInTx(conn, { ...context, unitId, toolId: request.tool_id }, actor);
      }
    } else if (type === 'rented') {
      const vendorId = Number(payload.vendor_id || request.vendor_id || 0) || null;
      const rate = Number(payload.rate_per_day || request.rental_cost || 0);
      const out = await toolUnitService.registerRentalInTx(conn, {
        toolId: request.tool_id, serialNumber: payload.serial_number, vendorId, ratePerDay: rate,
        rentalStartDate: payload.rental_start_date || startDate, expectedReturnDate: payload.expected_return_date || request.rental_end_date,
        health: payload.health, projectId: context.projectId, siteId: context.siteId, taskId: context.taskId,
        subtaskId: context.subtaskId,
        procurementRequestId: id,
      }, actor);
      unitId = out.unitId;
      paymentFields = { vendorId, rate, total: out.plannedCost, days: out.plannedDays, purchaseDate: payload.rental_start_date || startDate };
      if (payload.allocate !== false && (context.projectId || context.contractorId)) {
        await toolUnitService.allocateInTx(conn, {
          ...context, unitId, toolId: request.tool_id, startDate: payload.rental_start_date || startDate,
        }, actor);
      }
    } else {
      throw ApiError.badRequest('Unknown machine procurement type.');
    }

    // Freight to bring the machine to site, booked once under Machines.
    const machineTransport = moneyOrNull(payload.transport_cost, 'transport_cost') || 0;
    if (machineTransport > 0) {
      await transportExpenseService.bookForToolDelivery(id, machineTransport, actor?.id || null, conn);
    }

    // Going to a contractor: the machine is DISPATCHED ('ordered') with its vehicle and
    // driver, and the contractor receives it - exactly like material. Only then can it
    // be used on the task. With no receiving contractor it is complete straight away.
    const receiverId = Number(context.contractorId) || null;
    // No contractor: a PM-run site - its Project Manager receives the machine.
    const pmSite = receiverId ? null : pmRunSiteOf(request);
    const vehicle = String(payload.vehicle_number ?? '').trim();
    if ((receiverId || pmSite) && !normalizeVehicle(vehicle)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        vehicle_number: 'Enter the vehicle bringing the machine - the contractor verifies it when it arrives.',
      });
    }
    const dispatch = (receiverId || pmSite) ? {
      vehicle_number: vehicle,
      driver_name: String(payload.driver_name ?? '').trim() || null,
      driver_phone: String(payload.driver_phone ?? '').trim() || null,
      challan_number: String(payload.challan_number ?? '').trim() || null,
    } : null;

    const sets = dispatch
      ? ["status = 'ordered'", 'tool_unit_id = ?', 'vehicle_number = ?', 'driver_name = ?', 'driver_phone = ?', 'challan_number = ?',
        'contractor_id = COALESCE(contractor_id, ?)']
      : ["status = 'received'", 'tool_unit_id = ?', 'fulfilled_at = NOW()', 'received_by = ?'];
    const params = dispatch
      ? [unitId, dispatch.vehicle_number, dispatch.driver_name, dispatch.driver_phone, dispatch.challan_number, receiverId]
      : [unitId, actor?.id || null];
    if (paymentFields) {
      sets.push('vendor_id = ?', 'purchase_rate = ?', 'total_amount = ?', 'amount_due = GREATEST(? - COALESCE(amount_paid, 0), 0)');
      params.push(paymentFields.vendorId, paymentFields.rate, paymentFields.total, paymentFields.total);
      if (paymentFields.purchaseDate) { sets.push('purchase_date = ?'); params.push(paymentFields.purchaseDate); }
      if (paymentFields.days) { sets.push('rental_days = ?'); params.push(paymentFields.days); }
    }
    if (machineTransport > 0) { sets.push('transport_cost = ?'); params.push(machineTransport); }
    params.push(id);
    await conn.query(`UPDATE procurement_requests SET ${sets.join(', ')} WHERE id = ?`, params);

    await conn.commit();

    if (dispatch && receiverId) await notifyMachineDispatch(id, receiverId, dispatch);
    if (dispatch && pmSite) {
      const driver = [dispatch.driver_name, dispatch.driver_phone].filter(Boolean).join(', ');
      await notifyProjectManagers(request.project_id, {
        title: 'Machine dispatched to your site',
        message: `${request.request_number}: machine on its way. Vehicle ${dispatch.vehicle_number}${driver ? `, driver ${driver}` : ''}. Verify the vehicle and receive it.`,
        actionUrl: `/pm/procurement/${id}`,
        metadata: { module: 'procurement', procurementRequestId: id, ...dispatch },
      });
    }
  } catch (error) {
    await conn.rollback();
    if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
      if (/uq_tool_alloc_one_active/.test(error.message)) {
        throw ApiError.badRequest('That machine is already allocated. Return or reassign it first.');
      }
    }
    throw error;
  } finally {
    conn.release();
  }
  return getDetail(id);
}

/** Notifies the Project Manager(s) of a project - used for a PM-run site's deliveries. */
async function notifyProjectManagers(projectId, { title, message, actionUrl, metadata }) {
  const userIds = await pmScope.projectManagerUserIds(projectId);
  for (const userId of userIds) {
    await notificationModel.create({ userId, title, message, type: 'material', category: 'material', actionUrl, metadata })
      .catch((e) => console.error('Failed to notify project manager:', e));
  }
}

/** Tells the receiving contractor a machine is on its way, with the vehicle and driver. */
async function notifyMachineDispatch(id, contractorId, dispatch) {
  const [[c]] = await pool.query('SELECT user_id FROM contractors WHERE id = ? LIMIT 1', [contractorId]);
  if (!c?.user_id) return;
  const [[r]] = await pool.query(
    `SELECT pr.request_number, t.name AS tool_name, u.serial_number FROM procurement_requests pr
     LEFT JOIN tools t ON t.id = pr.tool_id LEFT JOIN tool_units u ON u.id = pr.tool_unit_id WHERE pr.id = ?`,
    [id]
  );
  const driver = [dispatch.driver_name, dispatch.driver_phone].filter(Boolean).join(', ');
  await notificationModel.create({
    userId: c.user_id,
    title: 'Machine dispatched to you',
    message: `${r?.request_number}: ${r?.tool_name || 'Machine'}${r?.serial_number ? ` (serial ${r.serial_number})` : ''} is on its way. `
      + `Vehicle ${dispatch.vehicle_number}${driver ? `, driver ${driver}` : ''}. Verify the vehicle and receive it when it arrives.`,
    type: 'material',
    category: 'material',
    actionUrl: `/contractor/procurement/${id}`,
    metadata: { module: 'procurement', procurementRequestId: id, ...dispatch },
  }).catch((e) => console.error('Failed to notify machine dispatch:', e));
}

/**
 * The receiving contractor (or Admin/Procurement/Warehouse) receives a DISPATCHED
 * machine: the arriving vehicle must match the dispatch. The allocation is charged
 * from the day it is received, and only now can the machine be used on the task.
 */
async function toolReceive(id, payload, userId, hrScope) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[request]] = await conn.query('SELECT * FROM procurement_requests WHERE id = ? FOR UPDATE', [id]);
    if (!request) throw ApiError.notFound('That procurement request does not exist.');
    if (!(request.item_type === 'tool' || (!request.material_id && request.tool_id))) {
      throw ApiError.badRequest('This is not a machine/tool request.');
    }
    if (request.status !== 'ordered') {
      throw ApiError.badRequest(`Only a dispatched machine can be received (this one is ${request.status.replace('_', ' ')}).`);
    }
    if (hrScope?.role === ROLES.CONTRACTOR && toolReceiverId(request) !== Number(hrScope.contractorId)) {
      throw ApiError.forbidden('You can only receive a machine dispatched to you.');
    }
    if (hrScope?.role === ROLES.PROJECT_MANAGER && (toolReceiverId(request) || !pmScope.pmHasSite(hrScope, pmRunSiteOf(request)))) {
      throw ApiError.forbidden('You can only receive a machine dispatched to a site you manage.');
    }
    const entered = String(payload.vehicle_number ?? '').trim();
    if (!normalizeVehicle(entered)) {
      throw ApiError.badRequest('Check the highlighted fields.', { vehicle_number: 'Enter the arriving vehicle number to verify the dispatch.' });
    }
    if (normalizeVehicle(request.vehicle_number) && !vehiclesMatch(entered, request.vehicle_number)) {
      throw ApiError.badRequest('Check the highlighted fields.', { vehicle_number: 'Vehicle number does not match the dispatch.' });
    }
    const receivingDate = payload.receiving_date || new Date().toISOString().slice(0, 10);

    await conn.query(
      `UPDATE procurement_requests SET status = 'received', received_by = ?, received_vehicle_number = ?, fulfilled_at = NOW(),
         notes = CASE WHEN ? IS NULL THEN notes ELSE CONCAT_WS(' | ', notes, ?) END WHERE id = ?`,
      [userId ?? null, entered, payload.notes || null, payload.notes || null, id]
    );
    // Charge the machine from the day it actually reached the contractor.
    await conn.query(
      "UPDATE tool_allocations SET start_date = ? WHERE procurement_request_id = ? AND status = 'active' AND start_date < ?",
      [receivingDate, id, receivingDate]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  return getDetail(id);
}

/**
 * Links a REAL uploaded bill/invoice file to a request. Access is scoped: a
 * contractor can only attach to their own request (findRawById with the
 * contractor scope returns nothing otherwise). The previous file, if any, is
 * removed from disk so bills don't accumulate.
 */
async function attachBill(id, file, hrScope, userId) {
  if (!file) throw ApiError.badRequest('No bill file was uploaded.');
  const request = await procurementModel.findRawById(id, contractorScope(hrScope, userId));
  if (!request) {
    // Clean up the just-saved orphan before failing.
    fs.promises.unlink(file.path).catch(() => {});
    throw ApiError.notFound('That procurement request does not exist.');
  }
  if (request.bill_file_path) {
    fs.promises.unlink(path.join(BILLS_DIR, path.basename(request.bill_file_path))).catch(() => {});
  }
  await procurementModel.updateBillFile(id, {
    path: file.filename,
    name: file.originalname,
    type: file.mimetype,
    size: file.size,
    uploadedBy: userId ?? null,
  });
  return getDetail(id, hrScope, userId);
}

/**
 * Resolves the stored bill for download. Contractors are scoped to their own
 * requests; Admin/Finance/Procurement/Warehouse reach it through the router's
 * permission gate. Returns the absolute path + metadata for streaming.
 */
async function getBillFile(id, hrScope, userId) {
  const request = await procurementModel.findRawById(id, contractorScope(hrScope, userId));
  if (!request) throw ApiError.notFound('That procurement request does not exist.');
  if (!request.bill_file_path) throw ApiError.notFound('No bill has been attached to this request.');
  return {
    absolutePath: path.join(BILLS_DIR, path.basename(request.bill_file_path)),
    fileName: request.bill_file_name || request.bill_file_path,
    mimeType: request.bill_file_type || 'application/octet-stream',
  };
}

/**
 * SEND MATERIAL. Creates the linked material movement (source stock issued
 * now, IN_TRANSIT), and moves the request to 'ordered' (dispatched / in
 * transit). The destination only gains stock when the movement is received,
 * which then completes the request.
 *
 * Applies to the two-phase transfer kinds, with different gates:
 *   - contractor_supply from the central warehouse (Central -> Contractor):
 *     status 'approved', sent by Admin/Procurement/Warehouse. Unchanged.
 *   - internal_transfer (Contractor -> Contractor): status 'source_confirmed',
 *     sent only by the source contractor.
 * Supplier purchases and central purchases are completed by receiving the goods
 * (fulfil), not by dispatch.
 */
async function dispatch(id, payload, hrScope, userId) {
  const request = await procurementModel.findRawById(id, contractorScope(hrScope, userId));
  if (!request) throw ApiError.notFound('That procurement request does not exist.');

  if (request.item_type === 'tool' || (!request.material_id && request.tool_id)) {
    throw ApiError.badRequest('Machines are allocated by serial number ("Allocate machine"), not dispatched like stock.');
  }
  const kind = request.procurement_kind;
  const isInternalTransfer = kind === 'internal_transfer';
  const isCentralSupply = kind === 'contractor_supply' && request.source_type === 'central_warehouse';
  if (!isInternalTransfer && !isCentralSupply) {
    throw ApiError.badRequest('This request type is completed by receiving the purchase, not by dispatch.');
  }

  if (isInternalTransfer) {
    // Contractor -> Contractor. The material belongs to the SOURCE contractor,
    // so nobody else may send it: not Admin, not Procurement, not Warehouse,
    // and not the destination contractor who raised the request.
    if (hrScope?.role !== ROLES.CONTRACTOR
        || hrScope.contractorId == null
        || request.source_contractor_id == null
        || Number(hrScope.contractorId) !== Number(request.source_contractor_id)) {
      throw ApiError.forbidden('Only the supplying contractor can send material for this request.');
    }
    // ...and only once they have confirmed the request themselves.
    if (request.status !== 'source_confirmed') {
      throw ApiError.badRequest(
        request.status === 'approved'
          ? 'Confirm this request before sending the material.'
          : `Only a confirmed request can be sent (this one is ${request.status.replace('_', ' ')}).`
      );
    }
  } else {
    // Central Warehouse -> Contractor. Unchanged: Admin/Procurement/Warehouse
    // send company stock from an approved request; a contractor never can.
    if (hrScope?.role === ROLES.CONTRACTOR) {
      throw ApiError.forbidden('Only Admin, Procurement or Warehouse can send material from the central warehouse.');
    }
    if (request.status !== 'approved') {
      throw ApiError.badRequest(`Only an approved request can be dispatched (this one is ${request.status.replace('_', ' ')}).`);
    }
  }

  if (!request.source_warehouse_id || !request.destination_warehouse_id) {
    throw ApiError.badRequest('This request is missing its source or destination warehouse.');
  }

  // dispatchForRequest locks the request, issues the stock, records the movement
  // and flips the request to 'ordered' (dispatched / in transit) in ONE transaction.
  const movement = await materialMovementService.dispatchForRequest(request, payload, userId);
  const detail = await getDetail(id, hrScope, userId);
  return { ...detail, movement };
}

module.exports = {
  STATUSES, PRIORITIES, TRANSITIONS,
  PROCUREMENT_KINDS, SOURCE_TYPES, DESTINATION_TYPES,
  list, listScoped, getById, getDetail, create, update, updateStatus, confirmSource, placeOrder,
  receive, updateReceipt, getLookups, fulfil, toolFulfil, toolReceive, dispatch, attachBill, getBillFile, toRequest, toReceipt,
};
