'use strict';

const ApiError = require('../utils/ApiError');
const materialModel = require('../models/materialModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');

/** Categories Interface 6 offers. Existing catalogue values are merged in via lookups. */
const CATEGORIES = [
  'Cement', 'Steel/Sariya', 'Stone/Patthar', 'Sand', 'Bricks',
  'Aggregate', 'Tiles', 'Paint', 'Other',
];

/** Mirrors STOCK_STATUS_SQL in materialModel so badge and filter always agree. */
function stockStatusOf(currentStock, minStock) {
  const stock = Number(currentStock || 0);
  const min = Number(minStock || 0);
  if (stock <= 0) return 'out';
  if (min > 0 && stock <= min) return 'low';
  return 'healthy';
}

function toMaterial(row) {
  if (!row) return null;
  const currentStock = Number(row.current_stock || 0);
  const minStock = Number(row.min_stock || 0);

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    unit: row.unit,
    minStock,
    currentStock,
    stockStatus: stockStatusOf(currentStock, minStock),
    supplier: row.default_supplier || row.latest_supplier || null,
    purchaseRate: Number(row.default_rate || 0) || Number(row.latest_rate || 0),
    status: row.status,
    notes: row.notes,
    stats: {
      receivedQty: Number(row.received_qty || 0),
      usedQty: Number(row.used_qty || 0),
      stockValue: Number(row.stock_value || 0),
      entryCount: Number(row.entry_count || 0),
      projectCount: Number(row.project_count || 0),
      siteCount: Number(row.site_count || 0),
      lastReceived: row.last_received || null,
    },
  };
}

async function list(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));

  const { rows, total } = await materialModel.findAll({ ...query, page, pageSize });

  return {
    materials: rows.map(toMaterial),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id) {
  const row = await materialModel.findById(id);
  if (!row) throw ApiError.notFound('That material does not exist.');
  return toMaterial(row);
}

async function getDetail(id) {
  const material = await getById(id);

  const [entries, locations, suppliers, requests] = await Promise.all([
    materialModel.findEntries(id),
    materialModel.findStockByLocation(id),
    materialModel.findSuppliers(id),
    materialModel.findRequests(id, material.name),
  ]);

  return { material, entries, locations, suppliers, requests };
}

/** Summary strip plus the dropdown data the list and form screens need. */
async function getLookups() {
  const [categories, units, projects, summary] = await Promise.all([
    materialModel.findCategories(),
    materialModel.findUnits(),
    projectModel.findAll({ page: 1, pageSize: 100 }),
    materialModel.findStockSummary(),
  ]);

  // Interface 6's canonical list first, then any category already in the
  // catalogue, so the 15 seeded materials stay filterable and keep their value.
  const merged = [...CATEGORIES];
  for (const c of categories) if (!merged.includes(c)) merged.push(c);

  return {
    categories: merged,
    units,
    projects: (projects.rows || []).map((p) => ({ id: p.id, code: p.code, name: p.name })),
    summary: {
      total: Number(summary.total || 0),
      outOfStock: Number(summary.out_of_stock || 0),
      lowStock: Number(summary.low_stock || 0),
      healthy: Number(summary.healthy || 0),
      stockValue: Number(summary.stock_value || 0),
    },
  };
}

async function generateCode() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `MAT-${String((await materialModel.nextCodeNumber()) + attempt).padStart(4, '0')}`;
    if (!(await materialModel.findByCode(candidate))) return candidate;
  }
  throw ApiError.badRequest('Could not generate a material code. Enter one manually.');
}

async function create(payload) {
  const code = payload.code?.trim() || (await generateCode());

  if (await materialModel.findByCode(code)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      code: 'That material code is already in use.',
    });
  }
  // `materials` has carried a unique name since Interface 3 — catch it here so
  // the user gets a field error instead of a driver-level duplicate-key crash.
  if (await materialModel.findByName(payload.name?.trim())) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      name: 'A material with that name already exists.',
    });
  }

  const id = await materialModel.create({ ...payload, code, name: payload.name?.trim() });
  return getById(id);
}

async function update(id, payload) {
  await getById(id);

  if (payload.code) {
    const existing = await materialModel.findByCode(payload.code);
    if (existing && existing.id !== Number(id)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        code: 'That material code is already in use.',
      });
    }
  }
  if (payload.name) {
    const existing = await materialModel.findByName(payload.name.trim());
    if (existing && existing.id !== Number(id)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        name: 'A material with that name already exists.',
      });
    }
  }

  await materialModel.update(id, payload);
  return getById(id);
}

/**
 * Records a delivery into `material_entries` — the same table Interface 3's
 * project and site screens read, so stock added here shows up there too.
 */
async function addEntry(id, payload) {
  const material = await getById(id);

  const project = await projectModel.findById(payload.project_id);
  if (!project) throw ApiError.notFound('That project does not exist.');

  if (payload.site_id) {
    const site = await siteModel.findById(payload.site_id);
    if (!site) throw ApiError.notFound('That site does not exist.');
    if (Number(site.project_id) !== Number(payload.project_id)) {
      throw ApiError.badRequest('Check the highlighted fields.', {
        site_id: 'That site does not belong to the selected project.',
      });
    }
  }

  if (Number(payload.quantity) <= 0) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      quantity: 'Enter a quantity greater than zero.',
    });
  }

  await materialModel.createEntry({
    material_id: id,
    project_id: payload.project_id,
    site_id: payload.site_id ?? null,
    quantity: payload.quantity,
    used_quantity: payload.used_quantity ?? 0,
    rate: payload.rate ?? material.purchaseRate ?? 0,
    supplier: payload.supplier ?? material.supplier ?? null,
    received_date: payload.received_date,
    notes: payload.notes ?? null,
  });

  return getDetail(id);
}

/** Records consumption against one delivery, capped at what was received. */
async function recordUsage(id, entryId, usedQuantity) {
  await getById(id);

  const entry = await materialModel.findEntryById(entryId);
  if (!entry || Number(entry.material_id) !== Number(id)) {
    throw ApiError.notFound('That stock entry does not exist.');
  }

  const used = Number(usedQuantity);
  if (used < 0) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      used_quantity: 'Used quantity cannot be negative.',
    });
  }
  if (used > Number(entry.quantity)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      used_quantity: `Used quantity cannot exceed the ${entry.quantity} received.`,
    });
  }

  await materialModel.updateEntryUsage(entryId, used);
  return getDetail(id);
}

module.exports = {
  list, getById, getDetail, getLookups, create, update,
  addEntry, recordUsage, toMaterial, CATEGORIES,
};
