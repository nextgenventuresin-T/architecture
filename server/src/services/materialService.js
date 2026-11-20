'use strict';

const ApiError = require('../utils/ApiError');
const materialModel = require('../models/materialModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');
const { pool } = require('../config/db');
const { normalizeUnit } = require('../utils/materialUnits');
const subUnits = require('./materialSubUnitService');

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
    // `unit` is the unit stock is counted in (the sub-unit when one is set).
    unit: row.unit,
    // The unit it is bought in; for a material without a sub-unit, its unit.
    purchaseUnit: row.purchase_unit || row.unit,
    subUnit: row.purchase_unit ? row.unit : null,
    unitsPerPurchaseUnit: row.purchase_unit && row.units_per_purchase_unit != null ? Number(row.units_per_purchase_unit) : null,
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
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 10));

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
    projectModel.findAll({ page: 1, pageSize: 10000 }),
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

const UNIT_FIELDS = ['unit', 'sub_unit', 'units_per_purchase_unit'];

/**
 * Turns the form's units (unit = the unit it is bought in, optional sub_unit and
 * units_per_purchase_unit) into storage: with a sub-unit, `unit` holds the
 * sub-unit and `purchase_unit` the bought unit. `current` is the stored row on
 * an edit, so a field left out keeps its value. Returns null when no unit field
 * was sent.
 */
function storageUnits(payload, current = null) {
  if (!UNIT_FIELDS.some((k) => payload[k] !== undefined)) return null;
  const clean = (v) => normalizeUnit(String(v ?? '').trim()) || null;
  const mainUnit = payload.unit !== undefined ? clean(payload.unit) : (current ? (current.purchase_unit || current.unit) : null);
  const subUnit = payload.sub_unit !== undefined ? clean(payload.sub_unit) : (current?.purchase_unit ? current.unit : null);
  const factorIn = payload.units_per_purchase_unit !== undefined ? payload.units_per_purchase_unit : current?.units_per_purchase_unit;
  const factor = factorIn === '' || factorIn == null ? null : Number(factorIn);

  if (!mainUnit) throw ApiError.badRequest('Check the highlighted fields.', { unit: 'Enter a unit.' });
  if (!subUnit) return { unit: mainUnit, purchase_unit: null, units_per_purchase_unit: null };
  if (subUnit.toLowerCase() === mainUnit.toLowerCase()) {
    throw ApiError.badRequest('Check the highlighted fields.', { sub_unit: 'The sub-unit must be different from the unit. Leave it blank if there is none.' });
  }
  if (subUnit.length > 20) throw ApiError.badRequest('Check the highlighted fields.', { sub_unit: 'Keep the sub-unit under 20 characters.' });
  if (!(factor > 0)) {
    throw ApiError.badRequest('Check the highlighted fields.', { units_per_purchase_unit: `Enter how many ${subUnit} are in 1 ${mainUnit}.` });
  }
  return { unit: subUnit, purchase_unit: mainUnit, units_per_purchase_unit: factor };
}

/** Payload without the form-only unit fields, with the storage units merged in. */
function withStorageUnits(payload, units) {
  const { sub_unit: _s, units_per_purchase_unit: _f, ...rest } = payload;
  return units ? { ...rest, ...units } : rest;
}

async function create(payload) {
  const units = storageUnits(payload);
  payload = withStorageUnits(payload, units);
  const code = payload.code?.trim() || (await generateCode());

  if (await materialModel.findByCode(code)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      code: 'That material code is already in use.',
    });
  }
  // `materials` has carried a unique name since Interface 3 — catch it here so
  // the user gets a field error instead of a driver-level duplicate-key crash.
  // Adding back a material that was deleted restores it (names are unique).
  const [[deleted]] = await pool.query("SELECT id FROM materials WHERE name = ? AND status = 'deleted' LIMIT 1", [payload.name?.trim()]);
  if (deleted) {
    // Through update, so a sub-unit given now also converts its old records.
    const { code: _ignored, ...rest } = payload;
    const formUnits = units
      ? { unit: units.purchase_unit || units.unit, sub_unit: units.purchase_unit ? units.unit : '', units_per_purchase_unit: units.units_per_purchase_unit }
      : {};
    const { purchase_unit: _p, ...restNoStorage } = rest;
    return update(deleted.id, { ...restNoStorage, ...formUnits, name: payload.name.trim(), status: 'active' });
  }
  if (await materialModel.findByName(payload.name?.trim())) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      name: 'A material with that name already exists.',
    });
  }

  const id = await materialModel.create({ ...payload, code, name: payload.name?.trim() });
  return getById(id);
}

async function update(id, payload) {
  const [[current]] = await pool.query(
    'SELECT id, unit, purchase_unit, units_per_purchase_unit, min_stock, default_rate FROM materials WHERE id = ?',
    [id]
  );
  if (!current) throw ApiError.notFound('That material does not exist.');
  const units = storageUnits(payload, current);
  payload = withStorageUnits(payload, units);

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

  const hadSub = Boolean(current.purchase_unit);
  const hasSub = Boolean(units?.purchase_unit);

  if (units && hadSub && !hasSub && (await subUnits.hasRecords(id))) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      sub_unit: `This material already has stock or records in ${current.unit}, so its sub-unit cannot be removed.`,
    });
  }

  if (units && !hadSub && hasSub) {
    // First sub-unit: convert existing records (stock, purchases, plans, logs).
    // Minimum stock and purchase rate convert too, unless a new value was typed.
    const f = Number(units.units_per_purchase_unit);
    if (payload.min_stock !== undefined && Number(payload.min_stock) === Number(current.min_stock)) delete payload.min_stock;
    if (payload.default_rate !== undefined && Number(payload.default_rate) === Number(current.default_rate)) delete payload.default_rate;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await subUnits.convertRecords(conn, id, { factor: f, purchaseUnit: current.unit, subUnit: units.unit });
      await conn.query(
        `UPDATE materials SET min_stock = min_stock * ?, default_rate = default_rate / ? WHERE id = ?`,
        [f, f, id]
      );
      await materialModel.update(id, payload, conn);
      await conn.commit();
      return getById(id);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } else if (units && hadSub && hasSub && units.unit !== current.unit) {
    // Sub-unit renamed: only the label changes.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await subUnits.renameUnitCopies(conn, id, units.unit);
      await materialModel.update(id, payload, conn);
      await conn.commit();
      return getById(id);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
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

/**
 * Deletes a material. Refused while any warehouse still holds it. A material that was
 * never used is removed completely; one that past requests / stock / logs name is taken
 * out of the catalogue and every picker (status 'deleted') so that history keeps its name.
 */
async function remove(id) {
  const material = await getById(id);
  const [[held]] = await pool.query(
    `SELECT COALESCE(SUM(ws.quantity), 0) AS qty, GROUP_CONCAT(DISTINCT w.name SEPARATOR ', ') AS places
     FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
     WHERE ws.material_id = ? AND ws.quantity > 0`,
    [id]
  );
  if (Number(held.qty) > 0) {
    throw ApiError.badRequest(
      `${material.name} is still in stock (${Number(held.qty)} ${material.unit} in ${held.places}). Use, issue or adjust that stock to zero before deleting it.`
    );
  }
  const [[used]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM procurement_requests WHERE material_id = ?)
          + (SELECT COUNT(*) FROM warehouse_transactions WHERE material_id = ?)
          + (SELECT COUNT(*) FROM material_entries WHERE material_id = ?)
          + (SELECT COUNT(*) FROM material_movements WHERE material_id = ?)
          + (SELECT COUNT(*) FROM daily_work_updates WHERE material_id = ?)
          + (SELECT COUNT(*) FROM task_materials WHERE material_id = ?)
          + (SELECT COUNT(*) FROM project_phase_materials WHERE material_id = ?) AS n`,
    Array(7).fill(id)
  );
  if (Number(used.n) === 0) {
    try {
      await pool.query('DELETE FROM warehouse_stock WHERE material_id = ? AND quantity = 0', [id]);
      await pool.query('DELETE FROM materials WHERE id = ?', [id]);
      return { deleted: true, kept: false };
    } catch (error) {
      if (error.code !== 'ER_ROW_IS_REFERENCED_2' && error.code !== 'ER_ROW_IS_REFERENCED') throw error;
    }
  }
  await pool.query("UPDATE materials SET status = 'deleted' WHERE id = ?", [id]);
  return { deleted: true, kept: true };
}

module.exports = {
  remove,
  list, getById, getDetail, getLookups, create, update,
  addEntry, recordUsage, toMaterial, CATEGORIES,
};
