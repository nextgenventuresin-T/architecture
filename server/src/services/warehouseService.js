'use strict';

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const warehouseModel = require('../models/warehouseModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');
const materialModel = require('../models/materialModel');
const procurementModel = require('../models/procurementModel');

const STATUSES = ['active', 'inactive'];
const TRANSACTION_TYPES = ['receipt', 'issue', 'transfer', 'adjustment'];
const ADJUSTMENT_TYPES = ['increase', 'decrease'];
const STOCK_STATUSES = ['in_stock', 'low', 'out'];

/** Transaction number prefix per movement type. */
const TX_PREFIX = {
  receipt: 'RCP',
  issue: 'ISS',
  transfer: 'TRF',
  adjustment: 'ADJ',
};

const today = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ shaping

function toWarehouse(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    location: row.location,
    description: row.description,
    status: row.status,
    type: row.type || 'central',
    contractor: row.contractor_id ? { id: row.contractor_id, name: row.contractor_name } : null,
    materialCount: Number(row.material_count || 0),
    totalQuantity: Number(row.total_quantity || 0),
    lowCount: Number(row.low_count || 0),
    outCount: Number(row.out_count || 0),
    // Rolls the warehouse's own low/out counts into one word for the list badge.
    stockStatus: Number(row.out_count || 0) > 0
      ? 'out'
      : Number(row.low_count || 0) > 0
        ? 'low'
        : 'in_stock',
    lastUpdated: row.last_updated || row.updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStock(row) {
  if (!row) return null;
  return {
    id: row.id,
    warehouse: { id: row.warehouse_id, code: row.warehouse_code, name: row.warehouse_name, location: row.warehouse_location },
    material: {
      id: row.material_id,
      code: row.material_code,
      name: row.material_name,
      category: row.material_category,
      unit: row.material_unit,
    },
    project: row.project_id ? { id: row.project_id, name: row.project_name, code: row.project_code } : null,
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    quantity: Number(row.quantity || 0),
    unit: row.material_unit,
    minStock: Number(row.min_stock || 0),
    stockStatus: row.stock_status,
    lastUpdated: row.updated_at,
  };
}

function toTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    transactionNumber: row.transaction_number,
    type: row.transaction_type,
    material: {
      id: row.material_id,
      code: row.material_code,
      name: row.material_name,
      category: row.material_category,
      unit: row.material_unit,
    },
    warehouse: { id: row.warehouse_id, code: row.warehouse_code, name: row.warehouse_name },
    destinationWarehouse: row.destination_warehouse_id
      ? { id: row.destination_warehouse_id, code: row.destination_code, name: row.destination_name }
      : null,
    project: row.project_id ? { id: row.project_id, name: row.project_name, code: row.project_code } : null,
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    quantity: Number(row.quantity || 0),
    unit: row.unit || row.material_unit,
    adjustmentType: row.adjustment_type,
    reason: row.reason,
    reference: row.reference,
    procurement: row.procurement_request_id
      ? {
          requestId: row.procurement_request_id,
          requestNumber: row.request_number,
          poNumber: row.po_number,
          receiptId: row.procurement_receipt_id,
        }
      : null,
    date: row.transaction_date,
    performedBy: row.performed_by ? { id: row.performed_by, name: row.performed_by_name } : null,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

// ------------------------------------------------------------- warehouse CRUD

async function list(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));

  const { rows, total } = await warehouseModel.findAll({ ...query, page, pageSize });

  return {
    warehouses: rows.map(toWarehouse),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id) {
  const row = await warehouseModel.findById(id);
  if (!row) throw ApiError.notFound('That warehouse does not exist.');
  return toWarehouse(row);
}

async function generateCode() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `WH-${String((await warehouseModel.nextCodeNumber()) + attempt).padStart(3, '0')}`;
    if (!(await warehouseModel.findByCode(candidate))) return candidate;
  }
  throw ApiError.badRequest('Could not generate a warehouse code. Enter one manually.');
}

async function create(payload) {
  const code = payload.code?.trim() || (await generateCode());

  if (await warehouseModel.findByCode(code)) {
    throw ApiError.badRequest('Check the highlighted fields.', { code: 'That warehouse code is already in use.' });
  }

  const id = await warehouseModel.create({
    code,
    name: payload.name.trim(),
    location: payload.location.trim(),
    description: payload.description?.trim() || null,
    status: STATUSES.includes(payload.status) ? payload.status : 'active',
  });

  return getById(id);
}

async function update(id, payload) {
  const existing = await warehouseModel.findRawById(id);
  if (!existing) throw ApiError.notFound('That warehouse does not exist.');

  if (payload.code !== undefined) {
    const code = payload.code.trim();
    if (await warehouseModel.findByCode(code, id)) {
      throw ApiError.badRequest('Check the highlighted fields.', { code: 'That warehouse code is already in use.' });
    }
  }

  if (payload.status !== undefined && !STATUSES.includes(payload.status)) {
    throw ApiError.badRequest('Check the highlighted fields.', { status: 'Choose a valid status.' });
  }

  await warehouseModel.update(id, {
    ...(payload.code !== undefined && { code: payload.code.trim() }),
    ...(payload.name !== undefined && { name: payload.name.trim() }),
    ...(payload.location !== undefined && { location: payload.location.trim() }),
    ...(payload.description !== undefined && { description: payload.description?.trim() || null }),
    ...(payload.status !== undefined && { status: payload.status }),
  });

  return getById(id);
}

/** Warehouse detail: information, current stock, alerts and recent movements. */
async function getDetail(id, query = {}) {
  const warehouse = await getById(id);

  const [stock, lowStock, outOfStock, recent] = await Promise.all([
    warehouseModel.findStock({
      ...query,
      warehouseId: id,
      page: 1,
      pageSize: 200,
      hideEmpty: query.stockStatus === 'out' ? false : true,
    }),
    warehouseModel.findAlerts(id, 'low'),
    warehouseModel.findAlerts(id, 'out'),
    warehouseModel.findRecentTransactions(id, 10),
  ]);

  return {
    warehouse,
    stock: stock.rows.map(toStock),
    lowStock: lowStock.map(toStock),
    outOfStock: outOfStock.map(toStock),
    recentTransactions: recent.map(toTransaction),
  };
}

// ------------------------------------------------------------------- stock

async function listStock(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

  const { rows, total } = await warehouseModel.findStock({
    ...query,
    page,
    pageSize,
    // "out" is the one filter that deliberately wants zero-quantity rows.
    hideEmpty: query.stockStatus !== 'out' && query.stockStatus !== 'all',
  });

  return {
    stock: rows.map(toStock),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function listProjectSiteStock(query, hrScope) {
  const contractorId = hrScope?.role === 'contractor' ? hrScope.contractorId : query.contractorId;
  const rows = await warehouseModel.findProjectSiteStock({ ...query, contractorId });

  // Group flat rows into Project -> Site -> Material for the screen.
  const projects = new Map();
  for (const row of rows) {
    if (!projects.has(row.project_id)) {
      projects.set(row.project_id, {
        id: row.project_id,
        code: row.project_code,
        name: row.project_name,
        totalQuantity: 0,
        sites: new Map(),
      });
    }
    const project = projects.get(row.project_id);
    const siteKey = row.site_id ?? 'unassigned';

    if (!project.sites.has(siteKey)) {
      project.sites.set(siteKey, {
        id: row.site_id,
        name: row.site_name || 'Not assigned to a site',
        materials: [],
      });
    }

    const quantity = Number(row.quantity || 0);
    project.totalQuantity += quantity;
    project.sites.get(siteKey).materials.push({
      id: row.material_id,
      code: row.material_code,
      name: row.material_name,
      category: row.material_category,
      unit: row.material_unit,
      quantity,
      warehouseCount: Number(row.warehouse_count || 0),
    });
  }

  return {
    projects: [...projects.values()].map((project) => ({
      ...project,
      sites: [...project.sites.values()],
    })),
  };
}

async function listTransactions(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 15));

  const { rows, total } = await warehouseModel.findTransactions({ ...query, page, pageSize });

  return {
    transactions: rows.map(toTransaction),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getSummary() {
  const { warehouses, stock, alerts, movements } = await warehouseModel.findSummary();

  return {
    totalWarehouses: Number(warehouses.total || 0),
    activeWarehouses: Number(warehouses.active || 0),
    inactiveWarehouses: Number(warehouses.inactive || 0),
    materialsInStock: Number(stock.materials_in_stock || 0),
    totalStockQuantity: Number(stock.total_quantity || 0),
    stockValue: Number(stock.stock_value || 0),
    lowStockItems: Number(alerts.low_stock || 0),
    outOfStockItems: Number(alerts.out_of_stock || 0),
    recentReceipts: Number(movements.receipts || 0),
    recentIssues: Number(movements.issues || 0),
    recentTransfers: Number(movements.transfers || 0),
    recentAdjustments: Number(movements.adjustments || 0),
  };
}

// -------------------------------------------------------------- validation

/** Confirms a warehouse exists and is usable for a movement. */
async function assertWarehouse(id, field) {
  const warehouse = await warehouseModel.findRawById(id);
  if (!warehouse) {
    throw ApiError.badRequest('Check the highlighted fields.', { [field]: 'That warehouse does not exist.' });
  }
  if (warehouse.status !== 'active') {
    throw ApiError.badRequest('Check the highlighted fields.', {
      [field]: 'That warehouse is inactive. Reactivate it before moving stock.',
    });
  }
  return warehouse;
}

/** Confirms material/project/site exist and that the site belongs to the project. */
async function assertMovementRelationships({ material_id, project_id, site_id }) {
  const material = await materialModel.findById(material_id);
  if (!material) {
    throw ApiError.badRequest('Check the highlighted fields.', { material_id: 'That material does not exist.' });
  }

  if (project_id) {
    const project = await projectModel.findById(project_id);
    if (!project) {
      throw ApiError.badRequest('Check the highlighted fields.', { project_id: 'That project does not exist.' });
    }
  }

  if (site_id) {
    const site = await siteModel.findById(site_id);
    if (!site) {
      throw ApiError.badRequest('Check the highlighted fields.', { site_id: 'That site does not exist.' });
    }
    if (project_id && Number(site.project_id) !== Number(project_id)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        site_id: 'That site does not belong to the selected project.',
      });
    }
  }

  return material;
}

function assertPositiveQuantity(quantity) {
  const value = Number(quantity);
  if (!(value > 0)) {
    throw ApiError.badRequest('Check the highlighted fields.', { quantity: 'Enter a quantity greater than zero.' });
  }
  return value;
}

async function generateTransactionNumber(type, conn) {
  const prefix = TX_PREFIX[type];
  return `${prefix}-${String(await warehouseModel.nextTransactionNumber(prefix, conn)).padStart(4, '0')}`;
}

// -------------------------------------------------------- stock movements

/**
 * Runs `work` inside a database transaction, rolling back on any failure so a
 * half-applied movement can never be left behind.
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * Receiving. Increases stock in one warehouse.
 *
 * When `procurement_receipt_id` is supplied the movement is linked to the
 * Interface 7 receipt. That column is UNIQUE, so a second attempt to pull the
 * same receipt in is rejected — the guard below turns the constraint into a
 * readable message rather than a raw duplicate-key error.
 *
 * Deliberately does NOT write to `material_entries`: Interface 7 already does
 * that for procurement deliveries, and Interface 6 derives its stock by
 * summing that table. Writing there too would double-count. See the header of
 * schema_warehouse.sql for the full reasoning.
 */
async function receiveStock(payload, userId) {
  const material = await assertMovementRelationships(payload);
  const quantity = assertPositiveQuantity(payload.quantity);
  await assertWarehouse(payload.warehouse_id, 'warehouse_id');

  let procurementRequestId = payload.procurement_request_id ?? null;

  if (payload.procurement_receipt_id) {
    const receipt = await procurementModel.findReceiptById(payload.procurement_receipt_id);
    if (!receipt) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        procurement_receipt_id: 'That procurement receipt does not exist.',
      });
    }
    const alreadyPosted = await warehouseModel.findTransactionByReceipt(payload.procurement_receipt_id);
    if (alreadyPosted) {
      throw ApiError.badRequest(
        `That procurement receipt was already received into stock as ${alreadyPosted.transaction_number}.`,
        { procurement_receipt_id: 'This delivery is already in warehouse stock.' }
      );
    }
    procurementRequestId = receipt.procurement_request_id;
  }

  return withTransaction(async (conn) => {
    await warehouseModel.lockWarehouse(payload.warehouse_id, conn);

    await warehouseModel.adjustStockSlot(
      {
        warehouseId: payload.warehouse_id,
        materialId: payload.material_id,
        projectId: payload.project_id ?? null,
        siteId: payload.site_id ?? null,
        delta: quantity,
      },
      conn
    );

    const id = await warehouseModel.createTransaction(
      {
        transaction_number: await generateTransactionNumber('receipt', conn),
        transaction_type: 'receipt',
        material_id: payload.material_id,
        warehouse_id: payload.warehouse_id,
        destination_warehouse_id: null,
        project_id: payload.project_id ?? null,
        site_id: payload.site_id ?? null,
        quantity,
        unit: payload.unit?.trim() || material.unit,
        adjustment_type: null,
        reason: null,
        reference: payload.reference?.trim() || null,
        procurement_receipt_id: payload.procurement_receipt_id ?? null,
        procurement_request_id: procurementRequestId,
        transaction_date: payload.transaction_date || today(),
        performed_by: payload.received_by ?? userId ?? null,
        notes: payload.notes ?? null,
      },
      conn
    );

    return id;
  }).then((id) => warehouseModel.findTransactionById(id)).then(toTransaction);
}

/**
 * Issuing material to a project/site. Decreases stock.
 *
 * The available check runs INSIDE the transaction, after the warehouse row is
 * locked. Checking before the lock would let two concurrent issues both see
 * enough stock and drive the balance negative.
 */
async function issueStock(payload, userId) {
  const material = await assertMovementRelationships(payload);
  const quantity = assertPositiveQuantity(payload.quantity);
  await assertWarehouse(payload.warehouse_id, 'warehouse_id');

  return withTransaction(async (conn) => {
    await warehouseModel.lockWarehouse(payload.warehouse_id, conn);

    let slot = await warehouseModel.findStockSlot(
      {
        warehouseId: payload.warehouse_id,
        materialId: payload.material_id,
        projectId: payload.project_id ?? null,
        siteId: payload.site_id ?? null,
      },
      conn
    );

    let drawSlot = {
      projectId: payload.project_id ?? null,
      siteId: payload.site_id ?? null,
    };

    if ((!slot || Number(slot.quantity) < quantity) && (payload.project_id || payload.site_id)) {
      const unslotted = await warehouseModel.findStockSlot(
        {
          warehouseId: payload.warehouse_id,
          materialId: payload.material_id,
          projectId: null,
          siteId: null,
        },
        conn
      );
      if (unslotted && Number(unslotted.quantity) >= quantity) {
        slot = unslotted;
        drawSlot = { projectId: null, siteId: null };
      } else {
        const [anySlots] = await conn.query(
          `SELECT id, project_id, site_id, quantity
           FROM warehouse_stock
           WHERE warehouse_id = ? AND material_id = ? AND quantity >= ?
           ORDER BY quantity DESC LIMIT 1`,
          [payload.warehouse_id, payload.material_id, quantity]
        );
        if (anySlots && anySlots.length > 0) {
          slot = anySlots[0];
          drawSlot = { projectId: anySlots[0].project_id, siteId: anySlots[0].site_id };
        }
      }
    }

    const available = Number(slot?.quantity || 0);

    if (quantity > available) {
      // Total across every slot, so the message can explain why stock that is
      // visible in the warehouse still cannot be issued from this one.
      const warehouseTotal = await warehouseModel.totalForMaterial(payload.warehouse_id, payload.material_id, conn);
      const detail = available === 0 && warehouseTotal > 0
        ? `No ${material.name} is held against this project/site combination in ${warehouse.name} (${warehouse.code}). ${warehouseTotal} ${material.unit} is held elsewhere in this warehouse.`
        : `Only ${available} ${material.unit} available in ${warehouse.name} (${warehouse.code}).`;

      throw ApiError.badRequest('Check the highlighted fields.', { quantity: detail });
    }

    await warehouseModel.adjustStockSlot(
      {
        warehouseId: payload.warehouse_id,
        materialId: payload.material_id,
        projectId: drawSlot.projectId,
        siteId: drawSlot.siteId,
        delta: -quantity,
      },
      conn
    );

    return warehouseModel.createTransaction(
      {
        transaction_number: await generateTransactionNumber('issue', conn),
        transaction_type: 'issue',
        material_id: payload.material_id,
        warehouse_id: payload.warehouse_id,
        destination_warehouse_id: null,
        project_id: payload.project_id ?? null,
        site_id: payload.site_id ?? null,
        quantity,
        unit: payload.unit?.trim() || material.unit,
        adjustment_type: null,
        reason: null,
        reference: payload.reference?.trim() || null,
        procurement_receipt_id: null,
        procurement_request_id: null,
        transaction_date: payload.transaction_date || today(),
        performed_by: payload.issued_by ?? userId ?? null,
        notes: payload.notes ?? null,
      },
      conn
    );
  }).then((id) => warehouseModel.findTransactionById(id)).then(toTransaction);
}

/**
 * Warehouse-to-warehouse transfer. Both balance updates and the ledger row
 * share one transaction, so the source can never be debited without the
 * destination being credited.
 */
async function transferStock(payload, userId) {
  const material = await assertMovementRelationships(payload);
  const quantity = assertPositiveQuantity(payload.quantity);

  if (Number(payload.warehouse_id) === Number(payload.destination_warehouse_id)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      destination_warehouse_id: 'Choose a different warehouse to transfer into.',
    });
  }

  await assertWarehouse(payload.warehouse_id, 'warehouse_id');
  await assertWarehouse(payload.destination_warehouse_id, 'destination_warehouse_id');

  return withTransaction(async (conn) => {
    // Lock both warehouses in a consistent (ascending id) order. Locking in
    // the order the user happened to pick would let two opposite transfers
    // deadlock against each other.
    const [first, second] = [Number(payload.warehouse_id), Number(payload.destination_warehouse_id)].sort((a, b) => a - b);
    await warehouseModel.lockWarehouse(first, conn);
    await warehouseModel.lockWarehouse(second, conn);

    const slot = await warehouseModel.findStockSlot(
      {
        warehouseId: payload.warehouse_id,
        materialId: payload.material_id,
        projectId: payload.project_id ?? null,
        siteId: payload.site_id ?? null,
      },
      conn
    );

    const available = Number(slot?.quantity || 0);
    if (quantity > available) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        quantity: `Only ${available} ${material.unit} available in ${sourceWarehouse.name} (${sourceWarehouse.code}).`,
      });
    }

    await warehouseModel.adjustStockSlot(
      {
        warehouseId: payload.warehouse_id,
        materialId: payload.material_id,
        projectId: payload.project_id ?? null,
        siteId: payload.site_id ?? null,
        delta: -quantity,
      },
      conn
    );

    await warehouseModel.adjustStockSlot(
      {
        warehouseId: payload.destination_warehouse_id,
        materialId: payload.material_id,
        projectId: payload.project_id ?? null,
        siteId: payload.site_id ?? null,
        delta: quantity,
      },
      conn
    );

    return warehouseModel.createTransaction(
      {
        transaction_number: await generateTransactionNumber('transfer', conn),
        transaction_type: 'transfer',
        material_id: payload.material_id,
        warehouse_id: payload.warehouse_id,
        destination_warehouse_id: payload.destination_warehouse_id,
        project_id: payload.project_id ?? null,
        site_id: payload.site_id ?? null,
        quantity,
        unit: payload.unit?.trim() || material.unit,
        adjustment_type: null,
        reason: null,
        reference: payload.reference?.trim() || null,
        procurement_receipt_id: null,
        procurement_request_id: null,
        transaction_date: payload.transaction_date || today(),
        performed_by: payload.performed_by ?? userId ?? null,
        notes: payload.notes ?? null,
      },
      conn
    );
  }).then((id) => warehouseModel.findTransactionById(id)).then(toTransaction);
}

/**
 * Controlled correction (damage, recount, wastage). Always leaves an audit
 * row behind — an adjustment that changed stock without a ledger entry would
 * defeat the point of the ledger.
 */
async function adjustStock(payload, userId) {
  const material = await assertMovementRelationships(payload);
  const quantity = assertPositiveQuantity(payload.quantity);
  await assertWarehouse(payload.warehouse_id, 'warehouse_id');

  if (!ADJUSTMENT_TYPES.includes(payload.adjustment_type)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      adjustment_type: 'Choose whether this increases or decreases stock.',
    });
  }

  if (!payload.reason?.trim()) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      reason: 'Give a reason for this adjustment.',
    });
  }

  const isDecrease = payload.adjustment_type === 'decrease';

  return withTransaction(async (conn) => {
    await warehouseModel.lockWarehouse(payload.warehouse_id, conn);

    const slot = await warehouseModel.findStockSlot(
      {
        warehouseId: payload.warehouse_id,
        materialId: payload.material_id,
        projectId: payload.project_id ?? null,
        siteId: payload.site_id ?? null,
      },
      conn
    );

    const available = Number(slot?.quantity || 0);

    // A decrease may not push a balance below zero — negative physical stock
    // is not a state a warehouse can actually be in.
    if (isDecrease && quantity > available) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        quantity: `Only ${available} ${material.unit} available to decrease.`,
      });
    }

    await warehouseModel.adjustStockSlot(
      {
        warehouseId: payload.warehouse_id,
        materialId: payload.material_id,
        projectId: payload.project_id ?? null,
        siteId: payload.site_id ?? null,
        delta: isDecrease ? -quantity : quantity,
      },
      conn
    );

    return warehouseModel.createTransaction(
      {
        transaction_number: await generateTransactionNumber('adjustment', conn),
        transaction_type: 'adjustment',
        material_id: payload.material_id,
        warehouse_id: payload.warehouse_id,
        destination_warehouse_id: null,
        project_id: payload.project_id ?? null,
        site_id: payload.site_id ?? null,
        quantity,
        unit: payload.unit?.trim() || material.unit,
        adjustment_type: payload.adjustment_type,
        reason: payload.reason.trim(),
        reference: payload.reference?.trim() || null,
        procurement_receipt_id: null,
        procurement_request_id: null,
        transaction_date: payload.transaction_date || today(),
        performed_by: payload.performed_by ?? userId ?? null,
        notes: payload.notes ?? null,
      },
      conn
    );
  }).then((id) => warehouseModel.findTransactionById(id)).then(toTransaction);
}

// ------------------------------------------------------------------ lookups

/**
 * Everything the warehouse forms and filters need in one call: warehouses,
 * materials, projects, locations and the summary strip.
 *
 * `pendingReceipts` lists Interface 7 deliveries that have NOT yet been pulled
 * into warehouse stock, so the receiving form can offer them without the admin
 * having to cross-reference procurement by hand.
 */
async function getLookups() {
  const [warehouses, materials, projects, locations, summary, pendingReceipts, [stockBalances]] = await Promise.all([
    warehouseModel.findAll({ page: 1, pageSize: 100 }),
    materialModel.findAll({ page: 1, pageSize: 200 }),
    projectModel.findAll({ page: 1, pageSize: 100 }),
    warehouseModel.findLocations(),
    getSummary(),
    findPendingProcurementReceipts(),
    pool.query(`
      SELECT ws.warehouse_id, ws.material_id, ws.project_id, ws.site_id,
             ws.quantity, w.name as warehouse_name, w.code as warehouse_code,
             w.type as warehouse_type, w.contractor_id
      FROM warehouse_stock ws
      JOIN warehouses w ON w.id = ws.warehouse_id
    `),
  ]);

  return {
    warehouses: (warehouses.rows || []).map((w) => ({
      id: w.id, code: w.code, name: w.name, location: w.location, status: w.status, type: w.type, contractor_id: w.contractor_id,
    })),
    materials: (materials.rows || []).map((m) => ({
      id: m.id, code: m.code, name: m.name, category: m.category, unit: m.unit, minStock: Number(m.min_stock || 0),
    })),
    projects: (projects.rows || []).map((p) => ({ id: p.id, code: p.code, name: p.name })),
    locations,
    statuses: STATUSES,
    transactionTypes: TRANSACTION_TYPES,
    adjustmentTypes: ADJUSTMENT_TYPES,
    stockStatuses: STOCK_STATUSES,
    pendingReceipts,
    summary,
    stockBalances: (stockBalances || []).map((s) => ({
      warehouseId: s.warehouse_id,
      materialId: s.material_id,
      projectId: s.project_id,
      siteId: s.site_id,
      quantity: Number(s.quantity || 0),
      contractorId: s.contractor_id,
      warehouseType: s.warehouse_type,
    })),
  };
}

/**
 * Interface 7 receipts with no matching warehouse transaction yet. The LEFT
 * JOIN ... IS NULL is what keeps this list honest as receipts get posted.
 */
async function findPendingProcurementReceipts() {
  const [rows] = await pool.query(
    `SELECT pr.id AS receipt_id, pr.received_quantity, pr.receiving_date,
            r.id AS request_id, r.request_number, r.po_number, r.supplier,
            r.material_id, r.project_id, r.site_id, r.unit,
            m.name AS material_name, m.unit AS material_unit,
            p.name AS project_name, s.name AS site_name
     FROM procurement_receipts pr
     JOIN procurement_requests r ON r.id = pr.procurement_request_id
     JOIN materials m ON m.id = r.material_id
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN sites    s ON s.id = r.site_id
     LEFT JOIN warehouse_transactions wt ON wt.procurement_receipt_id = pr.id
     WHERE wt.id IS NULL
     ORDER BY pr.receiving_date DESC, pr.id DESC
     LIMIT 50`
  );

  return rows.map((row) => ({
    receiptId: row.receipt_id,
    requestId: row.request_id,
    requestNumber: row.request_number,
    poNumber: row.po_number,
    supplier: row.supplier,
    material: { id: row.material_id, name: row.material_name, unit: row.material_unit },
    project: row.project_id ? { id: row.project_id, name: row.project_name } : null,
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    quantity: Number(row.received_quantity || 0),
    unit: row.unit || row.material_unit,
    receivingDate: row.receiving_date,
  }));
}

module.exports = {
  STATUSES, TRANSACTION_TYPES, ADJUSTMENT_TYPES, STOCK_STATUSES,
  list, getById, getDetail, create, update,
  listStock, listProjectSiteStock, listTransactions, getSummary,
  receiveStock, issueStock, transferStock, adjustStock,
  getLookups, findPendingProcurementReceipts,
  toWarehouse, toStock, toTransaction,
  getScopes, getCentralOverview, listContractorTransactions,
  getWarehouseUsageOverview,
};

// ---------------------------------------------------- warehouse ownership views

/**
 * Options for the top-of-page warehouse switcher:
 *   - Central Company Warehouse (one entry, may span >1 central warehouse id)
 *   - Total Contractor Warehouses (aggregate view across every contractor)
 *   - each individual contractor's warehouse, pulled live from the database
 * Contractor warehouses are provisioned on demand so a newly-added contractor
 * appears here without any change to the Contractor module.
 */
async function getScopes() {
  await warehouseModel.ensureCentralWarehouse();
  await warehouseModel.ensureContractorWarehouses();
  const { central, contractors } = await warehouseModel.findScopes();

  return {
    central: {
      // The switcher shows one "Central Company Warehouse" entry regardless of
      // how many central warehouse rows exist; ids lists them all so the view
      // can aggregate correctly.
      label: 'Central Company Warehouse',
      warehouseIds: central.map((w) => w.id),
      primaryId: central[0]?.id ?? null,
      warehouses: central.map((w) => ({ id: w.id, code: w.code, name: w.name, location: w.location })),
    },
    contractors: contractors.map((w) => ({
      warehouseId: w.id,
      code: w.code,
      name: w.name,
      location: w.location,
      contractor: { id: w.contractor_id, name: w.contractor_name },
    })),
  };
}

/** Resolve the set of central warehouse ids (used by the central overview). */
async function resolveCentralIds(explicitId) {
  if (explicitId) return [Number(explicitId)];
  await warehouseModel.ensureCentralWarehouse();
  const { central } = await warehouseModel.findScopes();
  return central.map((w) => w.id);
}

/**
 * Central Company Warehouse overview: one row per material with current stock,
 * total purchased/received, low-stock status and last movement. No project or
 * site dimension — the central warehouse is the company's own store.
 */
async function getCentralOverview(query = {}) {
  const warehouseIds = await resolveCentralIds(query.warehouseId);
  const rows = await warehouseModel.findCentralOverview(warehouseIds);

  let items = rows.map((row) => ({
    material: {
      id: row.material_id,
      code: row.material_code,
      name: row.material_name,
      category: row.material_category,
      unit: row.material_unit,
    },
    currentStock: Number(row.current_stock || 0),
    purchasedReceived: Number(row.purchased_received || 0),
    minStock: Number(row.min_stock || 0),
    stockStatus: row.stock_status,
    lastMovement: row.last_movement || null,
  }));

  // Optional client-side-ish filters kept server-side so paging/search agree.
  if (query.search) {
    const needle = String(query.search).toLowerCase();
    items = items.filter(
      (i) => i.material.name.toLowerCase().includes(needle) || (i.material.code || '').toLowerCase().includes(needle)
    );
  }
  if (query.stockStatus && query.stockStatus !== 'all') {
    items = items.filter((i) => i.stockStatus === query.stockStatus);
  }

  return {
    warehouseIds,
    items,
    totals: {
      materials: items.length,
      currentStock: items.reduce((sum, i) => sum + i.currentStock, 0),
      purchasedReceived: items.reduce((sum, i) => sum + i.purchasedReceived, 0),
      low: items.filter((i) => i.stockStatus === 'low').length,
      out: items.filter((i) => i.stockStatus === 'out').length,
    },
  };
}

/**
 * "Total Contractor Warehouses" / individual-contractor movement view. Every
 * row carries a source and a destination so the history reads honestly, plus a
 * human movement label ("Central Company Warehouse → Twinkle Contractor").
 */
async function listContractorTransactions(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));

  const { rows, total } = await warehouseModel.findContractorTransactions({ ...query, page, pageSize });

  const endpointLabel = (type, contractorName, name) => {
    if (type === 'contractor') return contractorName ? `${contractorName} Contractor` : name;
    if (type === 'central') return 'Central Company Warehouse';
    return name || '—';
  };

  const transactions = rows.map((row) => {
    const base = toTransaction(row);
    const source = {
      warehouseId: row.warehouse_id,
      name: endpointLabel(row.source_type, row.source_contractor_name, row.warehouse_name),
      type: row.source_type,
      contractor: row.source_contractor_id
        ? { id: row.source_contractor_id, name: row.source_contractor_name }
        : null,
      location: row.source_location,
    };
    const destination = row.destination_warehouse_id
      ? {
          warehouseId: row.destination_warehouse_id,
          name: endpointLabel(row.destination_type, row.destination_contractor_name, row.destination_name),
          type: row.destination_type,
          contractor: row.destination_contractor_id
            ? { id: row.destination_contractor_id, name: row.destination_contractor_name }
            : null,
          location: row.destination_location,
        }
      : null;

    return {
      ...base,
      source,
      destination,
      movementLabel: destination ? `${source.name} → ${destination.name}` : source.name,
    };
  });

  return {
    transactions,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

/**
 * Warehouse Usage Overview:
 * Provides two switchable views for a warehouse (especially contractor warehouse):
 * 1. Current Stock (Material, Total Received, Total Used, Current Available Balance)
 * 2. Material Used (Material, Quantity Used, Date, Project, Site, Phase, Contractor)
 * With site-wise filtering!
 */
async function getWarehouseUsageOverview(warehouseId, query = {}, hrScope) {
  const wId = Number(warehouseId);
  const warehouse = await getById(wId);

  // 1. Material Used (issue transactions from this warehouse)
  const usedWhere = ['wt.warehouse_id = ?', "wt.transaction_type = 'issue'"];
  const usedParams = [wId];

  if (query.projectId && query.projectId !== 'all') {
    usedWhere.push('wt.project_id = ?');
    usedParams.push(Number(query.projectId));
  }
  if (query.siteId && query.siteId !== 'all') {
    if (String(query.siteId).startsWith('p-')) {
      usedWhere.push('wt.project_id = ?');
      usedParams.push(Number(String(query.siteId).replace('p-', '')));
    } else {
      usedWhere.push('wt.site_id = ?');
      usedParams.push(Number(query.siteId));
    }
  }
  if (query.materialId && query.materialId !== 'all') {
    usedWhere.push('wt.material_id = ?');
    usedParams.push(Number(query.materialId));
  }
  if (query.dateFrom) {
    usedWhere.push('wt.transaction_date >= ?');
    usedParams.push(query.dateFrom);
  }
  if (query.dateTo) {
    usedWhere.push('wt.transaction_date <= ?');
    usedParams.push(query.dateTo);
  }

  const [usedRows] = await pool.query(
    `SELECT wt.id, wt.transaction_number, wt.material_id, wt.quantity AS quantity_used, wt.unit,
            wt.transaction_date, wt.reference, wt.notes,
            m.name AS material_name, m.code AS material_code, m.category AS material_category, m.default_rate,
            p.id AS project_id, p.name AS project_name, p.code AS project_code,
            s.id AS site_id, s.name AS site_name,
            c.id AS contractor_id, c.name AS contractor_name,
            dwu.phase_number, dwu.phase_title, dwu.subcategory
     FROM warehouse_transactions wt
     JOIN materials m ON m.id = wt.material_id
     LEFT JOIN projects p ON p.id = wt.project_id
     LEFT JOIN sites s ON s.id = wt.site_id
     LEFT JOIN daily_work_updates dwu ON (dwu.warehouse_transaction_id = wt.id OR (dwu.work_date = wt.transaction_date AND dwu.material_id = wt.material_id AND dwu.project_id = wt.project_id))
     LEFT JOIN contractors c ON c.id = dwu.contractor_id
     WHERE ${usedWhere.join(' AND ')}
     ORDER BY wt.transaction_date DESC, wt.id DESC`,
    usedParams
  );

  // 2. Receipts into this warehouse
  const [recRows] = await pool.query(
    `SELECT wt.material_id, SUM(wt.quantity) AS total_received
     FROM warehouse_transactions wt
     WHERE (wt.destination_warehouse_id = ? OR (wt.warehouse_id = ? AND wt.transaction_type IN ('receive', 'adjust') AND wt.quantity > 0))
     GROUP BY wt.material_id`,
    [wId, wId]
  );
  const recMap = new Map();
  recRows.forEach((r) => recMap.set(Number(r.material_id), Number(r.total_received || 0)));

  // 3. Current Live Stock
  const [stockRows] = await pool.query(
    `SELECT ws.material_id, SUM(ws.quantity) AS current_balance,
            m.name AS material_name, m.code AS material_code, m.category, m.unit, m.default_rate
     FROM warehouse_stock ws
     JOIN materials m ON m.id = ws.material_id
     WHERE ws.warehouse_id = ?
     GROUP BY ws.material_id, m.name, m.code, m.category, m.unit, m.default_rate`,
    [wId]
  );

  // 4. Total used by material (unfiltered for stock balance calculation)
  const [totalUsedRows] = await pool.query(
    `SELECT wt.material_id, SUM(wt.quantity) AS total_used
     FROM warehouse_transactions wt
     WHERE wt.warehouse_id = ? AND wt.transaction_type = 'issue'
     GROUP BY wt.material_id`,
    [wId]
  );
  const usedMap = new Map();
  totalUsedRows.forEach((r) => usedMap.set(Number(r.material_id), Number(r.total_used || 0)));

  const allMaterialIds = new Set([
    ...stockRows.map((s) => Number(s.material_id)),
    ...recRows.map((r) => Number(r.material_id)),
    ...totalUsedRows.map((u) => Number(u.material_id)),
  ]);

  const [matDetails] = await pool.query(
    `SELECT id, name, code, category, unit, default_rate FROM materials WHERE id IN (${Array.from(allMaterialIds).concat([0]).join(',')})`
  );
  const matInfoMap = new Map();
  matDetails.forEach((m) => matInfoMap.set(m.id, m));

  const currentStock = Array.from(allMaterialIds).filter(Boolean).map((mId) => {
    const mat = matInfoMap.get(mId) || {};
    const stockRow = stockRows.find((s) => Number(s.material_id) === mId);
    let balance = Number(stockRow?.current_balance || 0);
    const totalUsed = Number((usedMap.get(mId) || 0).toFixed(2));
    let totalReceived = Number((recMap.get(mId) || 0).toFixed(2));

    if (totalReceived < totalUsed + balance) {
      totalReceived = Number((totalUsed + balance).toFixed(2));
    } else {
      balance = Number((totalReceived - totalUsed).toFixed(2));
    }

    return {
      materialId: mId,
      name: mat.name || stockRow?.material_name || 'Material',
      code: mat.code || stockRow?.material_code || '',
      category: mat.category || stockRow?.category || '',
      unit: mat.unit || stockRow?.unit || 'unit',
      defaultRate: Number(mat.default_rate || stockRow?.default_rate || 0),
      totalReceived,
      totalUsed,
      availableBalance: balance,
      stockValue: Number((balance * Number(mat.default_rate || 0)).toFixed(2)),
    };
  });

  const [filterSites] = await pool.query(
    `SELECT DISTINCT s.id AS site_id, s.name AS site_name, p.id AS project_id, p.name AS project_name
     FROM warehouse_transactions wt
     LEFT JOIN sites s ON s.id = wt.site_id
     LEFT JOIN projects p ON p.id = wt.project_id
     WHERE wt.warehouse_id = ? AND (s.id IS NOT NULL OR p.id IS NOT NULL)`,
    [wId]
  );

  return {
    warehouse: {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      location: warehouse.location,
    },
    currentStock,
    materialUsed: usedRows.map((u) => {
      let pNum = u.phase_number;
      let pTitle = u.phase_title;
      let subcat = u.subcategory;
      if (!pNum && u.notes) {
        const match = u.notes.match(/Phase\s+(\d+)\s*\(([^)]+)\)/i);
        if (match) {
          pNum = Number(match[1]);
          subcat = match[2];
          pTitle = `Phase ${pNum}`;
        }
      }

      return {
        id: u.id,
        transactionNumber: u.transaction_number,
        materialId: u.material_id,
        materialName: u.material_name,
        materialCode: u.material_code,
        category: u.material_category,
        quantityUsed: Number(u.quantity_used || 0),
        unit: u.unit,
        date: u.transaction_date,
        projectId: u.project_id,
        projectName: u.project_name || '—',
        projectCode: u.project_code,
        siteId: u.site_id,
        siteName: u.site_name || 'All Sites / General',
        phaseNumber: pNum,
        phaseTitle: pTitle || (pNum ? `Phase ${pNum}` : '—'),
        subcategory: subcat || '—',
        contractorName: u.contractor_name || warehouse.name,
        reference: u.reference || u.transaction_number,
        notes: u.notes,
      };
    }),
    filterSites: filterSites
      .filter((fs) => fs.site_id || fs.project_id)
      .map((fs) => ({
        id: fs.site_id ? String(fs.site_id) : `p-${fs.project_id}`,
        siteId: fs.site_id,
        projectId: fs.project_id,
        name: fs.site_name ? `${fs.site_name} (${fs.project_name})` : `${fs.project_name} (All Sites)`,
        site_name: fs.site_name,
        project_name: fs.project_name,
      })),
  };
}
