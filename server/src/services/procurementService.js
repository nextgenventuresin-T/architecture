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
const warehouseService = require('./warehouseService');
const materialMovementService = require('./materialMovementService');

// Where a request delivers to, and where it draws from.
const PROCUREMENT_KINDS = ['project_site', 'central_purchase', 'contractor_supply', 'internal_transfer'];
const SOURCE_TYPES = ['supplier', 'central_warehouse', 'contractor', 'site'];
const DESTINATION_TYPES = ['project_site', 'central_warehouse', 'contractor_warehouse'];
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
function capabilitiesFor(row, viewer) {
  const kind = row.procurement_kind || 'project_site';
  const isInternalTransfer = kind === 'internal_transfer';
  const isCentralSupply = kind === 'contractor_supply' && row.source_type === 'central_warehouse';
  const role = viewer?.role ?? null;
  const viewerContractorId = viewer?.contractorId != null ? Number(viewer.contractorId) : null;
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
      && (isDestinationContractor
          || [ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE].includes(role)),
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
    sourceType: row.source_type || null,
    destinationType: row.destination_type || null,
    source: buildEndpoint('source', row),
    destination: buildEndpoint('destination', row),
    project: row.project_id ? { id: row.project_id, name: row.project_name, code: row.project_code } : null,
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    task: row.task_id ? { id: row.task_id, name: row.task_name } : null,
    isExcess: Boolean(row.is_excess),
    excessQuantity: Number(row.excess_quantity || 0),
    excessReason: row.excess_reason || null,
    plannedQuantityAtRequest: row.planned_quantity_at_request != null ? Number(row.planned_quantity_at_request) : null,
    procuredQuantityAtRequest: row.procured_quantity_at_request != null ? Number(row.procured_quantity_at_request) : null,
    material: { id: row.material_id, name: row.material_name, unit: row.material_unit, category: row.material_category },
    vendorId: row.vendor_id || null,
    vendor: row.vendor_id ? {
      id: row.vendor_id,
      name: row.vendor_name,
      contactPerson: row.vendor_contact_person,
      phone: row.vendor_phone,
    } : null,
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
    unit: row.unit || row.material_unit,
    estimatedRate: Number(row.estimated_rate),
    estimatedTotal: Number(row.estimated_total),
    purchaseRate: row.purchase_rate === null || row.purchase_rate === undefined ? null : Number(row.purchase_rate),
    totalAmount: row.total_amount === null || row.total_amount === undefined ? null : Number(row.total_amount),
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
      };
    })(),
    purchaseOrder: row.po_number ? {
      poNumber: row.po_number,
      orderedQuantity,
      rate: Number(row.estimated_rate),
      totalAmount: orderedQuantity !== null ? orderedQuantity * Number(row.estimated_rate) : null,
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
  return { role: hrScope?.role ?? null, contractorId: hrScope?.contractorId ?? null };
}

function contractorScope(hrScope, userId) {
  return hrScope?.role === ROLES.CONTRACTOR
    ? { contractorId: hrScope.contractorId, userId }
    : {};
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

/** Confirms project/site/material exist and belong together before any write. */
async function assertRelationships({ project_id, site_id, material_id }) {
  const project = await projectModel.findById(project_id);
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

  const material = await materialModel.findById(material_id);
  if (!material) {
    throw ApiError.badRequest('Check the highlighted fields.', { material_id: 'That material does not exist.' });
  }

  return { project, material };
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
async function resolveFlow(payload, hrScope) {
  const kind = PROCUREMENT_KINDS.includes(payload.procurement_kind) ? payload.procurement_kind : 'project_site';
  const isContractor = hrScope?.role === ROLES.CONTRACTOR;
  const ownContractorId = isContractor ? Number(hrScope.contractorId) : null;

  if (kind === 'project_site') {
    // Legacy behaviour, unchanged: a project is required.
    await assertContractorLocation(payload, hrScope);
    const { material } = await assertRelationships(payload);
    return {
      material,
      columns: {
        procurement_kind: 'project_site',
        destination_type: 'project_site',
        source_type: 'supplier',
        project_id: payload.project_id,
        site_id: payload.site_id ?? null,
        task_id: payload.task_id ? Number(payload.task_id) : null,
      },
    };
  }

  const material = await materialModel.findById(payload.material_id);
  if (!material) throw ApiError.badRequest('Check the highlighted fields.', { material_id: 'That material does not exist.' });

  if (kind === 'central_purchase') {
    // Outside supplier -> Central company warehouse. No project.
    if (isContractor) throw ApiError.forbidden('Only Admin/Procurement can purchase into the central warehouse.');
    return {
      material,
      columns: {
        procurement_kind: 'central_purchase',
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
    const destContractorId = isContractor ? ownContractorId : Number(payload.destination_contractor_id);
    if (!destContractorId) throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'Select the receiving contractor.' });
    const destWarehouseId = await getContractorWarehouseId(destContractorId);
    const columns = {
      procurement_kind: 'contractor_supply',
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
    return { material, columns };
  }

  if (kind === 'internal_transfer') {
    // Contractor/site -> Contractor/site. Both ends are internal (no finance).
    // When a CONTRACTOR raises this, they are the DESTINATION (the requester),
    // and they pick which contractor to pull material FROM (spec B).
    const sourceContractorId = isContractor
      ? (payload.source_contractor_id ? Number(payload.source_contractor_id) : null)
      : (payload.source_contractor_id ? Number(payload.source_contractor_id) : null);
    const destContractorId = isContractor
      ? ownContractorId
      : (payload.destination_contractor_id ? Number(payload.destination_contractor_id) : null);
    if (!sourceContractorId) throw ApiError.badRequest('Check the highlighted fields.', { source_contractor_id: 'Select the source contractor.' });
    if (!destContractorId) throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'Select the destination contractor.' });
    if (Number(sourceContractorId) === Number(destContractorId)) {
      throw ApiError.badRequest('Check the highlighted fields.', { destination_contractor_id: 'Choose a different contractor to transfer to.' });
    }
    return {
      material,
      columns: {
        procurement_kind: 'internal_transfer',
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

async function create(payload, userId, hrScope) {
  const { material, columns: flow } = await resolveFlow(payload, hrScope);

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

  // 1. Task Baseline Enforcement
  const isContractor = hrScope?.role === ROLES.CONTRACTOR;
  const isPM = hrScope?.role === 'project_manager';
  const taskId = payload.task_id ? Number(payload.task_id) : (flow.task_id ? Number(flow.task_id) : null);

  if ((isContractor || isPM) && payload.project_id && !taskId) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      task_id: 'Select an Admin-planned Task for this procurement.',
    });
  }

  let isExcess = false;
  let excessQuantity = 0;
  let plannedQtyAtReq = null;
  let procuredQtyAtReq = null;
  let task = null;

  if (taskId) {
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
      'SELECT * FROM task_materials WHERE task_id = ? AND material_id = ?',
      [taskId, Number(payload.material_id)]
    );

    const requestedQty = Number(payload.quantity);

    // Sum already procured quantity on this task for this material
    const [[procSum]] = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0) AS total_procured
       FROM procurement_requests
       WHERE task_id = ? AND material_id = ? AND status NOT IN ('rejected', 'cancelled')`,
      [taskId, Number(payload.material_id)]
    );
    procuredQtyAtReq = Number(procSum.total_procured || 0);

    if (tmRows.length > 0) {
      const tm = tmRows[0];
      const originalPlanned = Number(tm.quantity || 0);
      const approvedAdditional = Number(tm.approved_additional_quantity || 0);
      plannedQtyAtReq = Number((originalPlanned + approvedAdditional).toFixed(2));
      const remainingPlanned = Math.max(0, Number((plannedQtyAtReq - procuredQtyAtReq).toFixed(2)));

      if (requestedQty > remainingPlanned) {
        isExcess = true;
        excessQuantity = Number((requestedQty - remainingPlanned).toFixed(2));
      }
    } else {
      // Material not planned for this task
      isExcess = true;
      plannedQtyAtReq = 0;
      excessQuantity = requestedQty;
    }

    if (isExcess) {
      const reasonText = (payload.excess_reason || payload.reason || '').trim();
      if (!reasonText) {
        throw ApiError.badRequest('Check the highlighted fields.', {
          excess_reason: `Requested quantity exceeds the Admin-planned quantity by ${excessQuantity} ${material.unit}. Reason for excess procurement is mandatory.`,
        });
      }
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

  const purchaseRate = payload.purchase_rate ?? payload.estimated_rate ?? 0;

  const id = await procurementModel.create({
    request_number: requestNumber,
    material_id: payload.material_id,
    supplier: payload.supplier ?? null,
    supplier_contact: payload.supplier_contact ?? null,
    quantity: payload.quantity,
    unit: payload.unit?.trim() || material.unit,
    estimated_rate: payload.estimated_rate ?? purchaseRate ?? 0,
    required_date: payload.required_date ?? null,
    priority: PRIORITIES.includes(payload.priority) ? payload.priority : 'medium',
    requested_by: payload.requested_by ?? userId ?? null,
    notes: payload.notes ?? null,
    reason: payload.reason ?? null,
    status,
    task_id: taskId,
    is_excess: isExcess ? 1 : 0,
    excess_quantity: excessQuantity,
    excess_reason: isExcess ? (payload.excess_reason || payload.reason || null) : null,
    planned_quantity_at_request: plannedQtyAtReq,
    procured_quantity_at_request: procuredQtyAtReq,
    // financials only meaningful for external purchases, but harmless to store.
    purchase_rate: payload.purchase_rate ?? null,
    total_amount: payload.total_amount ?? null,
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
    ...flow,
  });

  if (isExcess) {
    const reasonText = (payload.excess_reason || payload.reason || '').trim();
    const taskName = task?.name || `Task #${taskId}`;
    const projName = task?.project_name || `Project #${task?.project_id || payload.project_id}`;
    const notifMsg = `Excess Material Procurement Approval Required: ${payload.quantity} ${material.unit} of ${material.name} for Task "${taskName}" on ${projName} exceeds planned baseline by ${excessQuantity} ${material.unit}. Reason: ${reasonText}`;

    await notificationModel.create({
      role: 'admin',
      title: 'Excess Material Procurement Approval Required',
      message: notifMsg,
      type: 'warning',
      category: 'approval',
      actionUrl: '/admin/approvals?module=procurement',
      metadata: {
        module: 'procurement',
        procurementRequestId: id,
        requestNumber,
        taskId,
        taskName,
        projectId: task?.project_id || payload.project_id,
        projectName: projName,
        siteId: task?.site_id || payload.site_id,
        siteName: task?.site_name || null,
        materialId: payload.material_id,
        materialName: material.name,
        plannedQuantity: plannedQtyAtReq,
        procuredQuantity: procuredQtyAtReq,
        requestedQuantity: Number(payload.quantity),
        excessQuantity,
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

  // Editing the request body (quantity, rate, supplier, ...) is only safe
  // while nothing downstream — an approval or a purchase order — depends on
  // the current values yet.
  if (!['draft', 'requested'].includes(request.status)) {
    throw ApiError.badRequest(`A request that is already ${request.status.replace('_', ' ')} can no longer be edited.`);
  }

  if (payload.project_id || payload.site_id !== undefined || payload.material_id) {
    await assertContractorLocation({
      project_id: payload.project_id ?? request.project_id,
      site_id: payload.site_id !== undefined ? payload.site_id : request.site_id,
    }, hrScope);
    await assertRelationships({
      project_id: payload.project_id ?? request.project_id,
      site_id: payload.site_id !== undefined ? payload.site_id : request.site_id,
      material_id: payload.material_id ?? request.material_id,
    });
  }

  if (payload.quantity !== undefined && Number(payload.quantity) <= 0) {
    throw ApiError.badRequest('Check the highlighted fields.', { quantity: 'Enter a quantity greater than zero.' });
  }

  await procurementModel.update(id, payload);
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

  await procurementModel.updateStatus(id, nextStatus);

  // If Admin approved an excess material procurement request, link additional approved quantity to task
  if (nextStatus === 'approved' && request.is_excess && request.task_id) {
    const excessQty = Number(request.excess_quantity || 0);
    if (excessQty > 0) {
      const [existingTm] = await pool.query(
        'SELECT * FROM task_materials WHERE task_id = ? AND material_id = ?',
        [request.task_id, request.material_id]
      );
      if (existingTm.length > 0) {
        const curPlanned = Number(existingTm[0].quantity || 0);
        const curApprovedAdd = Number(existingTm[0].approved_additional_quantity || 0);
        const newApprovedAdd = Number((curApprovedAdd + excessQty).toFixed(2));
        const costPerUnit = Number(existingTm[0].cost_per_unit || 0);
        const newTotalCost = Number(((curPlanned + newApprovedAdd) * costPerUnit).toFixed(2));
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
          `INSERT INTO task_materials (task_id, project_id, site_id, material_id, quantity, approved_additional_quantity, cost_per_unit, total_cost)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
          [request.task_id, request.project_id, request.site_id, request.material_id, excessQty, rate, excessQty * rate]
        );
      }

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

  const orderedQuantity = payload.ordered_quantity !== undefined ? Number(payload.ordered_quantity) : Number(request.quantity);
  if (orderedQuantity <= 0) {
    throw ApiError.badRequest('Check the highlighted fields.', { ordered_quantity: 'Enter a quantity greater than zero.' });
  }

  const poNumber = payload.po_number?.trim() || (await generatePoNumber());
  if (await procurementModel.findByPoNumber(poNumber)) {
    throw ApiError.badRequest('Check the highlighted fields.', { po_number: 'That PO number is already in use.' });
  }

  await procurementModel.markOrdered(id, {
    poNumber,
    orderedQuantity,
    orderDate: payload.order_date || new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: payload.expected_delivery_date ?? null,
  });

  return getById(id);
}

/**
 * Records a delivery against an ordered (or already partially received)
 * request. Also lands a row in `material_entries` — the same stock ledger
 * Interface 6 reads — so stock does not need a second calculation.
 */
async function receive(id, payload, userId) {
  const request = await procurementModel.findRawById(id);
  if (!request) throw ApiError.notFound('That procurement request does not exist.');

  if (!['ordered', 'partially_received'].includes(request.status)) {
    throw ApiError.badRequest(
      `Only an ordered request can receive stock (this one is ${request.status.replace('_', ' ')}).`
    );
  }

  const receivedQuantity = Number(payload.received_quantity);
  if (!(receivedQuantity > 0)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      received_quantity: 'Enter a quantity greater than zero.',
    });
  }

  const orderedQuantity = Number(request.ordered_quantity);
  const alreadyReceived = await procurementModel.totalReceived(id);
  const newTotal = alreadyReceived + receivedQuantity;

  if (newTotal > orderedQuantity) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      received_quantity: `Only ${(orderedQuantity - alreadyReceived).toFixed(2)} remains to be received.`,
    });
  }

  // Mirror the delivery into the Interface 6 stock ledger.
  const materialEntryId = await materialModel.createEntry({
    material_id: request.material_id,
    project_id: request.project_id,
    site_id: request.site_id,
    quantity: receivedQuantity,
    used_quantity: 0,
    rate: request.estimated_rate,
    supplier: request.supplier,
    received_date: payload.receiving_date,
    notes: `Procurement ${request.request_number}${request.po_number ? ` / ${request.po_number}` : ''}`,
  });

  const receiptId = await procurementModel.createReceipt({
    procurement_request_id: id,
    received_quantity: receivedQuantity,
    receiving_date: payload.receiving_date,
    notes: payload.notes ?? null,
    received_by: userId ?? null,
    material_entry_id: materialEntryId,
  });

  // If this procurement delivers into Central Warehouse or a Destination Warehouse, record transaction & update stock
  const targetWarehouseId = request.destination_warehouse_id || (request.procurement_kind === 'central_purchase' ? await getCentralWarehouseId() : null);
  if (targetWarehouseId) {
    try {
      const nextTxNum = await warehouseModel.nextTransactionNumber('receipt');
      const txNumber = `TX-REC-${String(nextTxNum).padStart(5, '0')}`;
      await warehouseModel.createTransaction({
        transaction_number: txNumber,
        transaction_type: 'receipt',
        material_id: request.material_id,
        warehouse_id: targetWarehouseId,
        project_id: request.project_id || null,
        site_id: request.site_id || null,
        quantity: receivedQuantity,
        unit: request.unit,
        reference: request.po_number || request.request_number,
        procurement_request_id: id,
        procurement_receipt_id: receiptId,
        transaction_date: payload.receiving_date,
        performed_by: userId || null,
        notes: payload.notes || `Received from vendor ${request.vendor_id ? `(ID ${request.vendor_id})` : (request.supplier || '')}`,
      });
      await warehouseModel.adjustStockSlot({
        warehouseId: targetWarehouseId,
        material_id: request.material_id,
        projectId: request.project_id || null,
        siteId: request.site_id || null,
        delta: receivedQuantity,
      });
    } catch (err) {
      console.error('Error recording warehouse receipt transaction:', err);
    }
  }

  const newStatus = newTotal >= orderedQuantity ? 'received' : 'partially_received';
  await procurementModel.updateStatus(id, newStatus);

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
  const [projects, suppliers, summary, scopes, materials] = await Promise.all([
    projectModel.findAll({ ...scope, page: 1, pageSize: 100 }),
    procurementModel.findSuppliers(scope),
    isContractor ? Promise.resolve(null) : procurementModel.findSummary(),
    warehouseModel.findScopes().catch(() => ({ central: [], contractors: [] })),
    materialModel.findAll({ page: 1, pageSize: 200 }).catch(() => ({ rows: [] })),
  ]);

  return {
    statuses: STATUSES,
    priorities: PRIORITIES,
    kinds: PROCUREMENT_KINDS,
    sourceTypes: SOURCE_TYPES,
    destinationTypes: DESTINATION_TYPES,
    projects: (projects.rows || []).map((p) => ({ id: p.id, code: p.code, name: p.name })),
    materials: (materials.rows || []).map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit, category: m.category })),
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
 * that represents the physical material moving, and links that movement back to
 * the request. This is the single traceable reference the requirements ask for:
 * there is no separate contractor "receive" step.
 *
 *   supplier   -> central/contractor : warehouse receipt   (stock increases)
 *   central    -> contractor         : warehouse transfer  (both sides update)
 *   contractor -> contractor         : warehouse transfer  (both sides update)
 *
 * Internal transfers (central/contractor/site sources) never create a Finance
 * payment — only a stock movement. External purchases keep their bill and
 * financial figures on the request for Finance to read.
 *
 * Stock integrity (never over-issue, never negative, both sides atomic) is
 * enforced by warehouseService inside a single DB transaction.
 */
async function fulfil(id, payload = {}, userId) {
  const request = await procurementModel.findRawById(id);
  if (!request) throw ApiError.notFound('That procurement request does not exist.');

  const kind = request.procurement_kind || 'project_site';

  // A contractor-to-contractor transfer must NEVER be fulfilled directly.
  // Fulfilment would move stock straight from the source warehouse to the
  // destination in one call, skipping the source contractor's confirmation,
  // the actual Send (which is what takes stock OUT of the source), the
  // vehicle-number verification, and the destination's Receive (which is what
  // puts stock IN). Checked FIRST, so it is refused for every role at every
  // status, with the real reason rather than a status message.
  if (kind === 'internal_transfer') {
    throw ApiError.badRequest(
      'A contractor-to-contractor transfer cannot be fulfilled directly. '
      + 'The supplying contractor must confirm and send it, and the receiving contractor must receive it.'
    );
  }

  if (request.warehouse_transaction_id) {
    throw ApiError.badRequest('This request has already been fulfilled into warehouse stock.');
  }
  if (!['approved', 'ordered', 'partially_received'].includes(request.status)) {
    throw ApiError.badRequest(`Only an approved request can be fulfilled (this one is ${request.status.replace('_', ' ')}).`);
  }

  if (kind === 'project_site') {
    throw ApiError.badRequest('Project/site requests are received through the receiving action, not fulfilment.');
  }

  const quantity = Number(request.quantity);
  const base = {
    material_id: request.material_id,
    quantity,
    unit: request.unit,
    reference: request.po_number || request.request_number,
    transaction_date: payload.transaction_date || new Date().toISOString().slice(0, 10),
    notes: request.reason || request.notes || null,
  };

  const isInternal = INTERNAL_SOURCES.has(request.source_type);
  let tx;

  if (request.source_type === 'supplier') {
    // Outside purchase -> receipt into the destination warehouse.
    tx = await warehouseService.receiveStock(
      { ...base, warehouse_id: request.destination_warehouse_id, site_id: request.destination_site_id ?? null },
      userId
    );
  } else {
    // Internal move -> transfer from source warehouse to destination warehouse.
    if (!request.source_warehouse_id) {
      throw ApiError.badRequest('This request has no source warehouse to move stock from.');
    }
    tx = await warehouseService.transferStock(
      {
        ...base,
        warehouse_id: request.source_warehouse_id,
        destination_warehouse_id: request.destination_warehouse_id,
        site_id: request.destination_site_id ?? null,
      },
      userId
    );
  }

  // Link the single movement and mark received. Financials are recorded ONLY
  // for external purchases; internal transfers deliberately carry none.
  await procurementModel.updateFulfilment(id, {
    warehouseTransactionId: tx.id,
    status: 'received',
    ...(isInternal
      ? {}
      : {
          billReference: payload.bill_reference ?? request.bill_reference ?? null,
          totalAmount: payload.total_amount ?? request.total_amount ?? null,
          purchaseRate: payload.purchase_rate ?? request.purchase_rate ?? null,
          purchaseDate: payload.purchase_date ?? request.purchase_date ?? null,
        }),
  });

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

  const movement = await materialMovementService.dispatchForRequest(request, payload, userId);
  await procurementModel.updateStatus(id, 'ordered'); // 'ordered' == dispatched / in transit
  const detail = await getDetail(id, hrScope, userId);
  return { ...detail, movement };
}

module.exports = {
  STATUSES, PRIORITIES, TRANSITIONS,
  PROCUREMENT_KINDS, SOURCE_TYPES, DESTINATION_TYPES,
  list, listScoped, getById, getDetail, create, update, updateStatus, confirmSource, placeOrder,
  receive, updateReceipt, getLookups, fulfil, dispatch, attachBill, getBillFile, toRequest, toReceipt,
};
