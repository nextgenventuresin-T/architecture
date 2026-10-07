'use strict';

const { pool } = require('../config/db');

/**
 * Read/write access for the material catalogue and its stock entries.
 *
 * Current stock is always derived by summing `material_entries`, never stored.
 * schema_projects.sql set that rule ("remaining quantity is derived ... so it
 * cannot drift") and Interface 3's project and site screens already depend on
 * it, so Interface 6 follows the same approach instead of caching a total that
 * could disagree with the entries behind it.
 */

/** Per-material stock roll-up across every delivery. */
const STOCK_ROLLUP = `
  SELECT me.material_id,
         COALESCE(SUM(me.quantity), 0)                       AS received_qty,
         COALESCE(SUM(me.used_quantity), 0)                  AS used_qty,
         COALESCE(SUM(me.quantity - me.used_quantity), 0)    AS current_stock,
         COALESCE(SUM(me.quantity * me.rate), 0)             AS stock_value,
         COUNT(*)                                            AS entry_count,
         COUNT(DISTINCT me.project_id)                       AS project_count,
         COUNT(DISTINCT me.site_id)                          AS site_count,
         MAX(me.received_date)                               AS last_received
  FROM material_entries me
  GROUP BY me.material_id
`;

/** Codes are backfilled by the migration, but derive one if a row slips through. */
const CODE_EXPR = "COALESCE(m.code, CONCAT('MAT-', LPAD(m.id, 4, '0')))";

const LIST_SELECT = `
  SELECT
    m.id, ${CODE_EXPR} AS code, m.name, m.category, m.unit, m.min_stock,
    m.default_supplier, m.default_rate, m.status, m.notes,
    COALESCE(st.current_stock, 0) AS current_stock,
    COALESCE(st.received_qty, 0)  AS received_qty,
    COALESCE(st.used_qty, 0)      AS used_qty,
    COALESCE(st.stock_value, 0)   AS stock_value,
    COALESCE(st.entry_count, 0)   AS entry_count,
    COALESCE(st.project_count, 0) AS project_count,
    COALESCE(st.site_count, 0)    AS site_count,
    st.last_received,
    latest.supplier AS latest_supplier,
    latest.rate     AS latest_rate
  FROM materials m
  LEFT JOIN (${STOCK_ROLLUP}) st ON st.material_id = m.id
  LEFT JOIN (
    SELECT x.material_id, x.supplier, x.rate
    FROM (
      SELECT me.material_id, me.supplier, me.rate,
             ROW_NUMBER() OVER (PARTITION BY me.material_id
                                ORDER BY me.received_date DESC, me.id DESC) AS rn
      FROM material_entries me
    ) x
    WHERE x.rn = 1
  ) latest ON latest.material_id = m.id
`;

/**
 * Stock status is computed from the same expression everywhere so the filter
 * and the badge can never disagree:
 *   out     — nothing left
 *   low     — at or below the reorder point (only when one is set)
 *   healthy — everything else
 */
const STOCK_STATUS_SQL = {
  out: 'COALESCE(st.current_stock, 0) <= 0',
  low: 'COALESCE(st.current_stock, 0) > 0 AND m.min_stock > 0 AND COALESCE(st.current_stock, 0) <= m.min_stock',
  healthy: 'COALESCE(st.current_stock, 0) > 0 AND (m.min_stock <= 0 OR COALESCE(st.current_stock, 0) > m.min_stock)',
};

function buildFilters({ search, category, status, stockStatus, projectId, siteId }) {
  const where = [];
  const params = [];

  if (search) {
    where.push(`(m.name LIKE ? OR ${CODE_EXPR} LIKE ? OR m.category LIKE ? OR m.default_supplier LIKE ?)`);
    params.push(...Array(4).fill(`%${search}%`));
  }
  if (category && category !== 'all') {
    where.push('m.category = ?');
    params.push(category);
  }
  if (status && status !== 'all') {
    where.push('m.status = ?');
    params.push(status);
  }
  if (stockStatus && stockStatus !== 'all' && STOCK_STATUS_SQL[stockStatus]) {
    where.push(`(${STOCK_STATUS_SQL[stockStatus]})`);
  }
  if (projectId) {
    where.push('EXISTS (SELECT 1 FROM material_entries f WHERE f.material_id = m.id AND f.project_id = ?)');
    params.push(Number(projectId));
  }
  if (siteId) {
    where.push('EXISTS (SELECT 1 FROM material_entries f2 WHERE f2.material_id = m.id AND f2.site_id = ?)');
    params.push(Number(siteId));
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

/** Count query needs the same stock join for the stock-status filter to work. */
const COUNT_FROM = `
  FROM materials m
  LEFT JOIN (${STOCK_ROLLUP}) st ON st.material_id = m.id
`;

async function findAll({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${LIST_SELECT} ${whereSql} ORDER BY m.category, m.name LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total ${COUNT_FROM} ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query(`${LIST_SELECT} WHERE m.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findByName(name) {
  const [rows] = await pool.query('SELECT id FROM materials WHERE name = ? LIMIT 1', [name]);
  return rows[0] || null;
}

async function findByCode(code) {
  const [rows] = await pool.query(
    `SELECT id FROM materials
     WHERE code = ? OR (code IS NULL AND CONCAT('MAT-', LPAD(id, 4, '0')) = ?)
     LIMIT 1`,
    [code, code]
  );
  return rows[0] || null;
}

/** Highest number in play, so a generated code cannot collide. */
async function nextCodeNumber() {
  const [rows] = await pool.query(
    `SELECT GREATEST(
              COALESCE(MAX(CASE WHEN code REGEXP '^MAT-[0-9]+$'
                                THEN CAST(SUBSTRING(code, 5) AS UNSIGNED) END), 0),
              COALESCE(MAX(id), 0)
            ) AS max_num
     FROM materials`
  );
  return Number(rows[0]?.max_num || 0) + 1;
}

const WRITABLE = [
  'code', 'name', 'category', 'unit', 'min_stock',
  'default_supplier', 'default_rate', 'status', 'notes',
];

async function create(payload) {
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO materials (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

async function update(id, payload) {
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE materials SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

// --------------------------------------------------------------- entries

/** Every delivery of this material, newest first. */
async function findEntries(materialId) {
  const [rows] = await pool.query(
    `SELECT me.id, me.quantity, me.used_quantity, me.rate, me.supplier,
            me.received_date, me.notes,
            (me.quantity - me.used_quantity) AS remaining_quantity,
            (me.quantity * me.rate)          AS total_cost,
            p.id AS project_id, p.name AS project_name, p.code AS project_code,
            s.id AS site_id, s.name AS site_name
     FROM material_entries me
     JOIN projects p ON p.id = me.project_id
     LEFT JOIN sites s ON s.id = me.site_id
     WHERE me.material_id = ?
     ORDER BY me.received_date DESC, me.id DESC
     LIMIT 100`,
    [materialId]
  );
  return rows;
}

/** Stock broken down by project and site — the "project/site association". */
async function findStockByLocation(materialId) {
  const [rows] = await pool.query(
    `SELECT p.id AS project_id, p.name AS project_name, p.code AS project_code,
            s.id AS site_id, s.name AS site_name,
            SUM(me.quantity)                    AS received_qty,
            SUM(me.used_quantity)               AS used_qty,
            SUM(me.quantity - me.used_quantity) AS current_stock,
            SUM(me.quantity * me.rate)          AS stock_value,
            COUNT(*)                            AS entry_count
     FROM material_entries me
     JOIN projects p ON p.id = me.project_id
     LEFT JOIN sites s ON s.id = me.site_id
     WHERE me.material_id = ?
     GROUP BY p.id, p.name, p.code, s.id, s.name
     ORDER BY p.name, s.name`,
    [materialId]
  );
  return rows;
}

/** Distinct suppliers who have delivered this material. */
async function findSuppliers(materialId) {
  const [rows] = await pool.query(
    `SELECT me.supplier,
            COUNT(*)                   AS delivery_count,
            SUM(me.quantity)           AS total_quantity,
            AVG(me.rate)               AS avg_rate,
            MAX(me.received_date)      AS last_delivery
     FROM material_entries me
     WHERE me.material_id = ? AND me.supplier IS NOT NULL AND me.supplier <> ''
     GROUP BY me.supplier
     ORDER BY last_delivery DESC`,
    [materialId]
  );
  return rows;
}

/**
 * Material requests raised on the projects where this material is stocked.
 * `approval_requests` has no material_id column — it is a generic Interface 3
 * table keyed by project/site — so requests are scoped by project and the ones
 * whose title names this material are flagged and sorted first, rather than
 * pretending a direct link exists.
 */
async function findRequests(materialId, materialName) {
  const [rows] = await pool.query(
    `SELECT ar.id, ar.title, ar.status, ar.amount, ar.requested_by,
            ar.requested_on, ar.details,
            p.name AS project_name, s.name AS site_name,
            (ar.title LIKE ?) AS mentions_material
     FROM approval_requests ar
     LEFT JOIN projects p ON p.id = ar.project_id
     LEFT JOIN sites    s ON s.id = ar.site_id
     WHERE ar.request_type = 'material-request'
       AND (ar.title LIKE ?
            OR ar.project_id IN (SELECT DISTINCT project_id FROM material_entries WHERE material_id = ?))
     ORDER BY mentions_material DESC, ar.requested_on DESC
     LIMIT 25`,
    [`%${materialName}%`, `%${materialName}%`, materialId]
  );
  return rows;
}

async function createEntry(payload) {
  const [result] = await pool.query(
    `INSERT INTO material_entries
       (project_id, site_id, material_id, quantity, used_quantity, rate, supplier, received_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.project_id,
      payload.site_id ?? null,
      payload.material_id,
      payload.quantity,
      payload.used_quantity ?? 0,
      payload.rate ?? 0,
      payload.supplier ?? null,
      payload.received_date,
      payload.notes ?? null,
    ]
  );
  return result.insertId;
}

async function findEntryById(id) {
  const [rows] = await pool.query('SELECT * FROM material_entries WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

/** Records consumption against one delivery. */
async function updateEntryUsage(id, usedQuantity) {
  await pool.query('UPDATE material_entries SET used_quantity = ? WHERE id = ?', [usedQuantity, id]);
}

/** Categories already in the catalogue, so existing values stay filterable. */
async function findCategories() {
  const [rows] = await pool.query(
    "SELECT DISTINCT category FROM materials WHERE category <> '' ORDER BY category"
  );
  return rows.map((row) => row.category);
}

/** Units already in use, offered as suggestions on the form. */
async function findUnits() {
  const [rows] = await pool.query(
    "SELECT DISTINCT unit FROM materials WHERE unit <> '' ORDER BY unit"
  );
  return rows.map((row) => row.unit);
}

/** Headline counts for the stock overview strip. */
async function findStockSummary() {
  const [[row]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(${STOCK_STATUS_SQL.out})     AS out_of_stock,
       SUM(${STOCK_STATUS_SQL.low})     AS low_stock,
       SUM(${STOCK_STATUS_SQL.healthy}) AS healthy,
       COALESCE(SUM(COALESCE(st.current_stock, 0) * m.default_rate), 0) AS stock_value
     ${COUNT_FROM}`
  );
  return row;
}

module.exports = {
  findAll, findById, findByName, findByCode, nextCodeNumber, create, update,
  findEntries, findStockByLocation, findSuppliers, findRequests,
  createEntry, findEntryById, updateEntryUsage,
  findCategories, findUnits, findStockSummary,
};
