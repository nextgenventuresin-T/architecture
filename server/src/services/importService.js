'use strict';

/**
 * Bulk import from Excel / CSV. The browser parses the file and maps its
 * headers to the field keys below; every row is then validated here and
 * written through the same service/model calls the single-record forms use,
 * so an imported vendor, material or machine obeys exactly the same rules.
 *
 * Rows are independent: one bad row is reported and the rest still import.
 * `dryRun` runs the checks (field rules, duplicates, lookups) without writing.
 */
const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const vendorModel = require('../models/vendorModel');
const materialModel = require('../models/materialModel');
const materialService = require('./materialService');
const toolModel = require('../models/toolModel');
const toolService = require('./toolService');
const toolUnitService = require('./toolUnitService');

const MAX_ROWS = 1000;

// ------------------------------------------------------------------ fields
// type: text | number | int | date | enum. `aliases` are extra header names
// accepted for the column (matched case/space/punctuation-insensitively).

const ENTITIES = {
  vendors: {
    label: 'Vendors',
    matchBy: 'name',
    fields: [
      { key: 'name', label: 'Vendor Name', required: true, max: 150, aliases: ['vendor', 'supplier', 'supplier name', 'company', 'company name'], example: 'Shree Ram Steel Traders' },
      { key: 'contact_person', label: 'Contact Person', max: 120, aliases: ['contact', 'contact name'], example: 'Ramesh Kumar' },
      { key: 'phone', label: 'Phone', max: 30, aliases: ['mobile', 'phone number', 'mobile number', 'contact number'], example: '9876543210' },
      { key: 'email', label: 'Email', max: 150, aliases: ['email id', 'mail'], example: 'sales@shreeram.in' },
      { key: 'city', label: 'City', max: 80, aliases: ['location'], example: 'Pune' },
      { key: 'address', label: 'Address', max: 500, example: 'Plot 12, MIDC Bhosari' },
      { key: 'billing_address', label: 'Billing Address', max: 500 },
      { key: 'gst_number', label: 'GST Number', max: 20, aliases: ['gst', 'gstin', 'gst no'], example: '27ABCDE1234F1Z5' },
      { key: 'pan_number', label: 'PAN Number', max: 20, aliases: ['pan', 'pan no'] },
      { key: 'bank_name', label: 'Bank Name', max: 120, aliases: ['bank'] },
      { key: 'bank_account_number', label: 'Bank Account Number', max: 40, aliases: ['account number', 'account no', 'a/c no', 'bank account'] },
      { key: 'bank_ifsc', label: 'Bank IFSC', max: 20, aliases: ['ifsc', 'ifsc code'] },
      { key: 'status', label: 'Status', type: 'enum', values: ['active', 'inactive'], example: 'active' },
      { key: 'notes', label: 'Notes', max: 1000, aliases: ['remarks', 'comments'] },
    ],
  },

  materials: {
    label: 'Materials',
    matchBy: 'name',
    fields: [
      { key: 'name', label: 'Material Name', required: true, max: 120, aliases: ['material', 'item', 'item name'], example: 'OPC Cement 53 Grade' },
      { key: 'category', label: 'Category', required: true, max: 80, example: 'Cement' },
      { key: 'unit', label: 'Unit', required: true, max: 20, aliases: ['uom', 'unit of measure'], example: 'bags' },
      { key: 'code', label: 'Material Code', max: 30, aliases: ['code', 'item code', 'sku'], hint: 'Leave blank to auto-generate' },
      { key: 'min_stock', label: 'Minimum Stock', type: 'number', min: 0, aliases: ['min stock', 'reorder level', 'reorder point'], example: '200' },
      { key: 'default_rate', label: 'Purchase Rate', type: 'number', min: 0, aliases: ['rate', 'price', 'default rate', 'unit price'], example: '420' },
      { key: 'default_supplier', label: 'Default Supplier', max: 150, aliases: ['supplier', 'vendor'], example: 'Shree Ram Steel Traders' },
      { key: 'status', label: 'Status', type: 'enum', values: ['active', 'inactive', 'discontinued'], example: 'active' },
      { key: 'notes', label: 'Notes', max: 1000, aliases: ['remarks', 'description'] },
    ],
  },

  tools: {
    label: 'Machine & Tool Types',
    matchBy: 'name',
    fields: [
      { key: 'name', label: 'Machine / Tool Name', required: true, max: 150, aliases: ['name', 'machine', 'tool', 'machine name', 'tool name', 'machine type'], example: 'Concrete Mixer 10/7' },
      { key: 'type', label: 'Type', max: 80, aliases: ['category', 'tool type'], hint: 'Defaults to Equipment', example: 'Machinery' },
      { key: 'code', label: 'Code', max: 30, aliases: ['tool code', 'machine code'], hint: 'Leave blank to auto-generate' },
      { key: 'ownership_type', label: 'Ownership', type: 'enum', values: ['owned', 'to_be_purchased', 'rented'], aliases: ['ownership type'], example: 'owned' },
      { key: 'total_quantity', label: 'Total Quantity', type: 'int', min: 1, aliases: ['quantity', 'qty'], example: '2' },
      { key: 'default_charge_rate', label: 'Charge Rate per Day', type: 'number', min: 0, aliases: ['charge rate', 'default charge rate', 'rate per day'], example: '1500' },
      { key: 'rental_rate', label: 'Rental Rate per Day', type: 'number', min: 0, aliases: ['rental rate', 'rent per day'] },
      { key: 'description', label: 'Description', max: 1000, aliases: ['notes', 'remarks'] },
      { key: 'status', label: 'Status', type: 'enum', values: ['active', 'inactive'], example: 'active' },
    ],
  },

  machines: {
    label: 'Machines (with serial no.)',
    matchBy: 'serial_number',
    updatable: false,
    fields: [
      { key: 'machine_type', label: 'Machine Type', required: true, max: 150, aliases: ['type', 'machine', 'tool', 'machine name', 'tool name', 'machine type name'], hint: 'Name or code of an existing machine type', example: 'Concrete Mixer 10/7' },
      { key: 'serial_number', label: 'Serial Number', required: true, max: 80, aliases: ['serial', 'serial no', 'sr no', 's/n'], example: 'CM-2024-0042' },
      { key: 'ownership_type', label: 'Ownership', type: 'enum', values: ['owned', 'rented'], example: 'owned' },
      { key: 'purchase_date', label: 'Purchase Date', type: 'date', aliases: ['date of purchase', 'bought on'], example: '2024-05-15' },
      { key: 'expiry_date', label: 'Expiry / Warranty Date', type: 'date', aliases: ['expiry date', 'warranty', 'warranty date', 'expiry'] },
      { key: 'purchase_cost', label: 'Purchase Cost', type: 'number', min: 0, aliases: ['cost', 'price', 'amount'], example: '85000' },
      { key: 'vendor', label: 'Vendor', max: 150, aliases: ['vendor name', 'supplier', 'supplier name'], hint: 'Name of an existing vendor', example: 'Shree Ram Steel Traders' },
      { key: 'health', label: 'Condition', type: 'enum', values: ['excellent', 'good', 'average', 'poor'], aliases: ['health', 'condition'], example: 'good' },
      { key: 'notes', label: 'Notes', max: 255, aliases: ['remarks'] },
    ],
  },
};

function getEntity(name) {
  const entity = ENTITIES[name];
  if (!entity) throw ApiError.notFound('Unknown import type.');
  return entity;
}

/** Field definitions for the client: header mapping, preview and template. */
function describe(name) {
  const e = getEntity(name);
  return {
    entity: name,
    label: e.label,
    matchBy: e.matchBy,
    updatable: e.updatable !== false,
    maxRows: MAX_ROWS,
    fields: e.fields.map(({ key, label, required, type = 'text', values, aliases = [], hint, example }) => ({
      key, label, required: Boolean(required), type, values: values || null, aliases, hint: hint || null, example: example ?? null,
    })),
  };
}

// --------------------------------------------------------------- parsing

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

function parseNumber(raw) {
  const cleaned = String(raw).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Accepts YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY and DD.MM.YYYY (Indian day-first). */
function parseDate(raw) {
  const s = String(raw).trim();
  let y; let m; let d;
  let match = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) [, y, m, d] = match.map(Number);
  else {
    match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (!match) return null;
    [, d, m, y] = match.map(Number);
    if (y < 100) y += 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const enumKey = (v) => String(v).trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Turns one raw row into typed values plus per-field error messages. */
function normalizeRow(entity, raw) {
  const values = {};
  const errors = {};
  for (const f of entity.fields) {
    const v = raw?.[f.key];
    if (isBlank(v)) {
      if (f.required) errors[f.key] = `${f.label} is required.`;
      continue;
    }
    const type = f.type || 'text';
    if (type === 'number' || type === 'int') {
      const n = parseNumber(v);
      if (Number.isNaN(n)) errors[f.key] = `${f.label} must be a number.`;
      else if (type === 'int' && !Number.isInteger(n)) errors[f.key] = `${f.label} must be a whole number.`;
      else if (f.min !== undefined && n < f.min) errors[f.key] = `${f.label} cannot be less than ${f.min}.`;
      else values[f.key] = n;
    } else if (type === 'date') {
      const d = parseDate(v);
      if (!d) errors[f.key] = `${f.label} must be a date like 2024-05-15 or 15/05/2024.`;
      else values[f.key] = d;
    } else if (type === 'enum') {
      const k = enumKey(v);
      if (!f.values.includes(k)) errors[f.key] = `${f.label} must be one of: ${f.values.join(', ')}.`;
      else values[f.key] = k;
    } else {
      const s = String(v).trim().replace(/\s+/g, ' ');
      if (f.max && s.length > f.max) errors[f.key] = `${f.label} is too long (max ${f.max} characters).`;
      else values[f.key] = s;
    }
  }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'Email is not valid.';
  if (values.purchase_date && values.expiry_date && values.expiry_date < values.purchase_date) {
    errors.expiry_date = 'Expiry cannot be before the purchase date.';
  }
  return { values, errors };
}

/** Flattens an ApiError's field details (or a driver error) into one sentence. */
function errorMessage(err) {
  if (err instanceof ApiError) {
    const details = err.details && typeof err.details === 'object' ? Object.values(err.details).filter(Boolean) : [];
    return details.length ? details.join(' ') : err.message;
  }
  if (err && err.code === 'ER_DUP_ENTRY') return 'A record with the same unique value already exists.';
  return err?.message || 'Could not save this row.';
}

// --------------------------------------------------------- lookups / writes

const norm = (s) => String(s || '').trim().toLowerCase();

async function findVendorByName(name) {
  const [rows] = await pool.query('SELECT id, name FROM vendors WHERE LOWER(TRIM(name)) = ? LIMIT 1', [norm(name)]);
  return rows[0] || null;
}

async function findMaterialByName(name) {
  const [rows] = await pool.query('SELECT id FROM materials WHERE LOWER(TRIM(name)) = ? LIMIT 1', [norm(name)]);
  return rows[0] || null;
}

async function findToolByName(name) {
  const [rows] = await pool.query('SELECT id FROM tools WHERE LOWER(TRIM(name)) = ? LIMIT 1', [norm(name)]);
  return rows[0] || null;
}

async function findToolByNameOrCode(value) {
  const [rows] = await pool.query(
    'SELECT id, name FROM tools WHERE LOWER(TRIM(name)) = ? OR LOWER(TRIM(code)) = ? ORDER BY id LIMIT 1',
    [norm(value), norm(value)]
  );
  return rows[0] || null;
}

async function findUnitBySerial(serial) {
  const [rows] = await pool.query('SELECT id FROM tool_units WHERE serial_number = ? LIMIT 1', [String(serial).trim().replace(/\s+/g, ' ')]);
  return rows[0] || null;
}

/**
 * Per entity: find the existing record a row matches, and how to create or
 * update it. `resolve` checks references (e.g. machine type, vendor) and
 * returns the payload to write, throwing ApiError for a bad reference.
 */
const HANDLERS = {
  vendors: {
    findExisting: (v) => findVendorByName(v.name),
    resolve: async (v) => v,
    create: (p) => vendorModel.create(p),
    update: (id, p) => vendorModel.update(id, p),
  },
  materials: {
    findExisting: (v) => findMaterialByName(v.name),
    resolve: async (v) => v,
    create: (p) => materialService.create(p),
    // The match is by name, so the stored name (and its casing) is kept.
    update: (id, { name, ...rest }) => materialService.update(id, rest),
  },
  tools: {
    findExisting: (v) => findToolByName(v.name),
    resolve: async (v) => ({ ...v, type: v.type || 'Equipment' }),
    create: (p) => toolService.create(p),
    update: (id, { name, code, ...rest }) => toolService.update(id, rest),
  },
  machines: {
    findExisting: (v) => findUnitBySerial(v.serial_number),
    resolve: async (v) => {
      const tool = await findToolByNameOrCode(v.machine_type);
      if (!tool) {
        throw ApiError.badRequest('Unknown machine type.', {
          machine_type: `Machine type "${v.machine_type}" was not found. Add it under Machine Types first (or import it).`,
        });
      }
      let vendorId = null;
      if (v.vendor) {
        const vendor = await findVendorByName(v.vendor);
        if (!vendor) throw ApiError.badRequest('Unknown vendor.', { vendor: `Vendor "${v.vendor}" was not found.` });
        vendorId = vendor.id;
      }
      return {
        tool_id: tool.id,
        serial_number: v.serial_number,
        ownership_type: v.ownership_type || 'owned',
        purchase_date: v.purchase_date || null,
        expiry_date: v.expiry_date || null,
        purchase_cost: v.purchase_cost ?? 0,
        vendor_id: vendorId,
        health: v.health || 'good',
        notes: v.notes || 'Imported from spreadsheet',
      };
    },
    create: (p, actor) => toolUnitService.registerUnit(p, actor),
  },
};

// ------------------------------------------------------------------- run

/**
 * @param {string} name       vendors | materials | tools | machines
 * @param {object[]} rows     objects keyed by field key (row order = sheet order)
 * @param {object} options    { onDuplicate: 'skip' | 'update', dryRun, firstRowNumber }
 */
async function run(name, rows, { onDuplicate = 'skip', dryRun = false, firstRowNumber = 2 } = {}, actor = null) {
  const entity = getEntity(name);
  const handler = HANDLERS[name];
  if (!Array.isArray(rows) || rows.length === 0) throw ApiError.badRequest('The file has no data rows to import.');
  if (rows.length > MAX_ROWS) throw ApiError.badRequest(`Import at most ${MAX_ROWS} rows at a time. Split the file and try again.`);
  const updateDuplicates = onDuplicate === 'update' && entity.updatable !== false;

  const results = [];
  const seenInFile = new Map(); // match value -> first row number, for duplicates within the file

  for (let i = 0; i < rows.length; i += 1) {
    // `_row` is the sheet row number the browser read it from (blank rows are skipped there).
    const rowNumber = Number(rows[i]?._row) || firstRowNumber + i;
    const { values, errors } = normalizeRow(entity, rows[i]);
    const label = values[entity.matchBy] || values.name || '';

    if (Object.keys(errors).length) {
      results.push({ row: rowNumber, label, status: 'error', message: Object.values(errors).join(' ') });
      continue;
    }

    const matchKey = norm(values[entity.matchBy]);
    const repeatOf = seenInFile.get(matchKey);
    seenInFile.set(matchKey, repeatOf ?? rowNumber);

    try {
      // A repeat inside the file behaves like an existing record (the first
      // occurrence is created first). In a dry run nothing exists yet, so say so.
      const existing = await handler.findExisting(values);
      const payload = await handler.resolve(values);

      if (existing || repeatOf) {
        if (!updateDuplicates) {
          results.push({
            row: rowNumber, label, status: 'skipped',
            message: repeatOf ? `Same ${entity.matchBy === 'name' ? 'name' : 'serial number'} as row ${repeatOf}.` : 'Already exists.',
          });
          continue;
        }
        if (dryRun) {
          results.push({ row: rowNumber, label, status: 'updated', message: repeatOf && !existing ? `Updates the record from row ${repeatOf}.` : 'Will update the existing record.' });
          continue;
        }
        const target = existing || (await handler.findExisting(values));
        await handler.update(target.id, payload, actor);
        results.push({ row: rowNumber, label, status: 'updated' });
        continue;
      }

      if (dryRun) {
        results.push({ row: rowNumber, label, status: 'created', message: 'Will be added.' });
        continue;
      }
      await handler.create(payload, actor);
      results.push({ row: rowNumber, label, status: 'created' });
    } catch (err) {
      if (!(err instanceof ApiError) && err?.code !== 'ER_DUP_ENTRY') console.error(`[import:${name}] row ${rowNumber}`, err);
      results.push({ row: rowNumber, label, status: 'error', message: errorMessage(err) });
    }
  }

  const summary = { total: results.length, created: 0, updated: 0, skipped: 0, error: 0 };
  for (const r of results) summary[r.status] += 1;
  return { entity: name, dryRun: Boolean(dryRun), summary, results };
}

module.exports = { ENTITIES, MAX_ROWS, describe, run, normalizeRow, parseDate };
