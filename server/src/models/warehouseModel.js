'use strict';

const { pool } = require('../config/db');

/**
 * Read/write access for warehouses, their stock balances and the movement
 * ledger behind those balances.
 *
 * Two rules carried over from the rest of the ERP:
 *
 *  1. Material identity is never copied. Name, code, category, unit and
 *     min_stock are always JOINed from `materials` (Interface 3/6), so a
 *     catalogue edit is reflected here immediately and there is no second
 *     material master to keep in sync.
 *
 *  2. Stock-changing work is transactional. Every write helper takes an
 *     optional `conn` (a pooled connection with an open transaction). The
 *     service layer passes one in so a transfer's two balance updates and its
 *     ledger row either all land or none do.
 */

/** Runs against the caller's transaction when given one, the pool otherwise. */
const runner = (conn) => conn || pool;

// ------------------------------------------------------------------ warehouses

/**
 * Per-warehouse roll-up. Counts only slots that still hold stock, so a
 * warehouse that has been fully issued out reads as empty rather than
 * carrying a misleading "12 materials" badge from historical rows.
 */
const WAREHOUSE_ROLLUP = `
  SELECT ws.warehouse_id,
         COUNT(DISTINCT CASE WHEN ws.quantity > 0 THEN ws.material_id END) AS material_count,
         COALESCE(SUM(GREATEST(ws.quantity, 0)), 0)                        AS total_quantity,
         MAX(ws.updated_at)                                                AS stock_updated_at
  FROM warehouse_stock ws
  GROUP BY ws.warehouse_id
`;

/**
 * Low / out-of-stock counts per warehouse. `min_stock` is the catalogue-level
 * reorder point from Interface 6 — the warehouse does not define its own.
 */
const WAREHOUSE_ALERTS = `
  SELECT a.warehouse_id,
         SUM(a.is_low) AS low_count,
         SUM(a.is_out) AS out_count
  FROM (
    SELECT ws.warehouse_id,
           ws.material_id,
           SUM(ws.quantity) AS qty,
           MAX(m.min_stock) AS min_stock,
           CASE WHEN SUM(ws.quantity) <= 0 THEN 1 ELSE 0 END AS is_out,
           CASE WHEN SUM(ws.quantity) > 0 AND MAX(m.min_stock) > 0
                     AND SUM(ws.quantity) <= MAX(m.min_stock) THEN 1 ELSE 0 END AS is_low
    FROM warehouse_stock ws
    JOIN materials m ON m.id = ws.material_id
    GROUP BY ws.warehouse_id, ws.material_id
  ) a
  GROUP BY a.warehouse_id
`;

const WAREHOUSE_SELECT = `
  SELECT w.id, w.code, w.name, w.location, w.description, w.status,
         w.type, w.contractor_id, c.name AS contractor_name,
         w.created_at, w.updated_at,
         COALESCE(r.material_count, 0)  AS material_count,
         COALESCE(r.total_quantity, 0)  AS total_quantity,
         COALESCE(al.low_count, 0)      AS low_count,
         COALESCE(al.out_count, 0)      AS out_count,
         GREATEST(w.updated_at, COALESCE(r.stock_updated_at, w.updated_at)) AS last_updated
  FROM warehouses w
  LEFT JOIN contractors c ON c.id = w.contractor_id
  LEFT JOIN (${WAREHOUSE_ROLLUP}) r  ON r.warehouse_id = w.id
  LEFT JOIN (${WAREHOUSE_ALERTS}) al ON al.warehouse_id = w.id
`;

function buildWarehouseFilters({ search, status, location }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(w.code LIKE ? OR w.name LIKE ? OR w.location LIKE ?)');
    params.push(...Array(3).fill(`%${search}%`));
  }
  if (status && status !== 'all') {
    where.push('w.status = ?');
    params.push(status);
  }
  if (location && location !== 'all') {
    where.push('w.location = ?');
    params.push(location);
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findAll({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildWarehouseFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${WAREHOUSE_SELECT} ${whereSql} ORDER BY w.code LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM warehouses w ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findById(id) {
  const [rows] = await pool.query(`${WAREHOUSE_SELECT} WHERE w.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findRawById(id, conn) {
  const [rows] = await runner(conn).query('SELECT * FROM warehouses WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByCode(code, excludeId = null) {
  const params = [code];
  let sql = 'SELECT id FROM warehouses WHERE code = ?';
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  const [rows] = await pool.query(`${sql} LIMIT 1`, params);
  return rows[0] || null;
}

/**
 * Takes an exclusive lock on a warehouse row. Every stock-changing operation
 * calls this first, which serialises movements for that warehouse and makes
 * the read-then-insert-or-update on `warehouse_stock` safe (see the note in
 * schema_warehouse.sql explaining why a UNIQUE key cannot do this job).
 */
async function lockWarehouse(id, conn) {
  const [rows] = await conn.query('SELECT * FROM warehouses WHERE id = ? FOR UPDATE', [id]);
  return rows[0] || null;
}

/** Highest code in play, so a generated warehouse code cannot collide. */
async function nextCodeNumber() {
  const [rows] = await pool.query(
    `SELECT COALESCE(MAX(CASE WHEN code REGEXP '^WH-[0-9]+$'
                              THEN CAST(SUBSTRING(code, 4) AS UNSIGNED) END), 0) AS max_num
     FROM warehouses`
  );
  return Number(rows[0]?.max_num || 0) + 1;
}

const WAREHOUSE_WRITABLE = ['code', 'name', 'location', 'description', 'status'];

async function create(payload) {
  const columns = WAREHOUSE_WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO warehouses (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

async function update(id, payload) {
  const columns = WAREHOUSE_WRITABLE.filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE warehouses SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

/** Distinct locations already in use, offered as a filter option. */
async function findLocations() {
  const [rows] = await pool.query(
    "SELECT DISTINCT location FROM warehouses WHERE location <> '' ORDER BY location"
  );
  return rows.map((row) => row.location);
}

// ----------------------------------------------------------------- stock reads

/**
 * Stock rows joined to the material catalogue. Material identity and the
 * reorder point come from `materials`; only the quantity belongs to Interface 8.
 */
const STOCK_SELECT = `
  SELECT
    ws.id, ws.warehouse_id, ws.material_id, ws.project_id, ws.site_id,
    ws.quantity, ws.updated_at,
    w.code AS warehouse_code, w.name AS warehouse_name, w.location AS warehouse_location,
    COALESCE(m.code, CONCAT('MAT-', LPAD(m.id, 4, '0'))) AS material_code,
    m.name AS material_name, m.category AS material_category,
    m.unit AS material_unit, m.min_stock,
    p.name AS project_name, p.code AS project_code,
    s.name AS site_name,
    CASE
      WHEN ws.quantity <= 0 THEN 'out'
      WHEN m.min_stock > 0 AND ws.quantity <= m.min_stock THEN 'low'
      ELSE 'in_stock'
    END AS stock_status
  FROM warehouse_stock ws
  JOIN warehouses w  ON w.id = ws.warehouse_id
  JOIN materials  m  ON m.id = ws.material_id
  LEFT JOIN projects p ON p.id = ws.project_id
  LEFT JOIN sites    s ON s.id = ws.site_id
`;

const STOCK_STATUS_SQL = {
  out: 'ws.quantity <= 0',
  low: 'ws.quantity > 0 AND m.min_stock > 0 AND ws.quantity <= m.min_stock',
  in_stock: 'ws.quantity > 0 AND (m.min_stock <= 0 OR ws.quantity > m.min_stock)',
};

function buildStockFilters({ search, warehouseId, materialId, category, projectId, siteId, stockStatus, hideEmpty }) {
  const where = [];
  const params = [];

  if (search) {
    where.push("(m.name LIKE ? OR COALESCE(m.code, CONCAT('MAT-', LPAD(m.id, 4, '0'))) LIKE ? OR m.category LIKE ? OR w.name LIKE ?)");
    params.push(...Array(4).fill(`%${search}%`));
  }
  if (warehouseId && warehouseId !== 'all') {
    where.push('ws.warehouse_id = ?');
    params.push(Number(warehouseId));
  }
  if (materialId && materialId !== 'all') {
    where.push('ws.material_id = ?');
    params.push(Number(materialId));
  }
  if (category && category !== 'all') {
    where.push('m.category = ?');
    params.push(category);
  }
  if (projectId && projectId !== 'all') {
    where.push('ws.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId && siteId !== 'all') {
    where.push('ws.site_id = ?');
    params.push(Number(siteId));
  }
  if (stockStatus && stockStatus !== 'all' && STOCK_STATUS_SQL[stockStatus]) {
    where.push(`(${STOCK_STATUS_SQL[stockStatus]})`);
  }
  // Slots that have been fully issued out are kept for history but hidden by
  // default, so the stock screen shows what is actually on hand.
  if (hideEmpty) where.push('ws.quantity > 0');

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const STOCK_COUNT_FROM = `
  FROM warehouse_stock ws
  JOIN warehouses w ON w.id = ws.warehouse_id
  JOIN materials  m ON m.id = ws.material_id
`;

async function findStock({ page = 1, pageSize = 20, ...filters }) {
  const { whereSql, params } = buildStockFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${STOCK_SELECT} ${whereSql} ORDER BY w.code, m.category, m.name LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total ${STOCK_COUNT_FROM} ${whereSql}`,
    params
  );

  return { rows, total };
}

/**
 * Finds the balance row for one exact slot. `<=>` is the NULL-safe equality
 * operator, so an unassigned slot (project_id IS NULL) matches correctly
 * instead of silently never matching the way `= NULL` would.
 */
async function findStockSlot({ warehouseId, materialId, projectId = null, siteId = null }, conn) {
  const [rows] = await runner(conn).query(
    `SELECT * FROM warehouse_stock
     WHERE warehouse_id = ? AND material_id = ? AND project_id <=> ? AND site_id <=> ?
     LIMIT 1`,
    [warehouseId, materialId, projectId ?? null, siteId ?? null]
  );
  return rows[0] || null;
}

/** Total held for a material in a warehouse, across every project/site slot. */
async function totalForMaterial(warehouseId, materialId, conn) {
  const [[row]] = await runner(conn).query(
    'SELECT COALESCE(SUM(quantity), 0) AS total FROM warehouse_stock WHERE warehouse_id = ? AND material_id = ?',
    [warehouseId, materialId]
  );
  return Number(row.total || 0);
}

/**
 * Applies a signed delta to one slot, creating the row when the slot is new.
 * Always called inside a transaction that already holds the warehouse lock.
 */
async function adjustStockSlot({ warehouseId, materialId, projectId = null, siteId = null, delta }, conn) {
  const existing = await findStockSlot({ warehouseId, materialId, projectId, siteId }, conn);

  if (existing) {
    await runner(conn).query('UPDATE warehouse_stock SET quantity = quantity + ? WHERE id = ?', [delta, existing.id]);
    return existing.id;
  }

  const [result] = await runner(conn).query(
    `INSERT INTO warehouse_stock (warehouse_id, material_id, project_id, site_id, quantity)
     VALUES (?, ?, ?, ?, ?)`,
    [warehouseId, materialId, projectId ?? null, siteId ?? null, delta]
  );
  return result.insertId;
}

/** Stock grouped Project -> Site -> Material, for the project/site stock view. */
async function findProjectSiteStock({ projectId, siteId, contractorId }) {
  const where = ['ws.quantity > 0', 'ws.project_id IS NOT NULL'];
  const params = [];

  if (projectId && projectId !== 'all') {
    where.push('ws.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId && siteId !== 'all') {
    where.push('ws.site_id = ?');
    params.push(Number(siteId));
  }
  if (contractorId) {
    where.push('(p.contractor_id = ? OR s.contractor_id = ?)');
    params.push(Number(contractorId), Number(contractorId));
  }

  const [rows] = await pool.query(
    `SELECT ws.project_id, ws.site_id, ws.material_id,
            p.name AS project_name, p.code AS project_code,
            s.name AS site_name,
            COALESCE(m.code, CONCAT('MAT-', LPAD(m.id, 4, '0'))) AS material_code,
            m.name AS material_name, m.unit AS material_unit, m.category AS material_category,
            SUM(ws.quantity) AS quantity,
            COUNT(DISTINCT ws.warehouse_id) AS warehouse_count
     FROM warehouse_stock ws
     JOIN materials m  ON m.id = ws.material_id
     JOIN projects  p  ON p.id = ws.project_id
     LEFT JOIN sites s ON s.id = ws.site_id
     WHERE ${where.join(' AND ')}
     GROUP BY ws.project_id, ws.site_id, ws.material_id,
              p.name, p.code, s.name, m.code, m.id, m.name, m.unit, m.category
     ORDER BY p.name, s.name, m.name`,
    params
  );
  return rows;
}

// -------------------------------------------------------------- transactions

const TX_SELECT = `
  SELECT
    t.id, t.transaction_number, t.transaction_type, t.material_id, t.warehouse_id,
    t.destination_warehouse_id, t.project_id, t.site_id, t.quantity, t.unit,
    t.adjustment_type, t.reason, t.reference, t.procurement_receipt_id,
    t.procurement_request_id, t.transaction_date, t.performed_by, t.notes, t.created_at,
    w.code AS warehouse_code, w.name AS warehouse_name,
    dw.code AS destination_code, dw.name AS destination_name,
    COALESCE(m.code, CONCAT('MAT-', LPAD(m.id, 4, '0'))) AS material_code,
    m.name AS material_name, m.category AS material_category, m.unit AS material_unit,
    p.name AS project_name, p.code AS project_code,
    s.name AS site_name,
    u.full_name AS performed_by_name,
    pr.request_number, pr.po_number
  FROM warehouse_transactions t
  JOIN warehouses w   ON w.id = t.warehouse_id
  LEFT JOIN warehouses dw ON dw.id = t.destination_warehouse_id
  JOIN materials m    ON m.id = t.material_id
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN sites    s ON s.id = t.site_id
  LEFT JOIN users    u ON u.id = t.performed_by
  LEFT JOIN procurement_requests pr ON pr.id = t.procurement_request_id
`;

function buildTxFilters({ search, type, warehouseId, materialId, projectId, siteId, dateFrom, dateTo }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(t.transaction_number LIKE ? OR m.name LIKE ? OR t.reference LIKE ? OR t.notes LIKE ?)');
    params.push(...Array(4).fill(`%${search}%`));
  }
  if (type && type !== 'all') {
    where.push('t.transaction_type = ?');
    params.push(type);
  }
  if (warehouseId && warehouseId !== 'all') {
    // A transfer touches two warehouses, so filtering by warehouse has to
    // match either end or the movement disappears from one side's history.
    where.push('(t.warehouse_id = ? OR t.destination_warehouse_id = ?)');
    params.push(Number(warehouseId), Number(warehouseId));
  }
  if (materialId && materialId !== 'all') {
    where.push('t.material_id = ?');
    params.push(Number(materialId));
  }
  if (projectId && projectId !== 'all') {
    where.push('t.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId && siteId !== 'all') {
    where.push('t.site_id = ?');
    params.push(Number(siteId));
  }
  if (dateFrom) {
    where.push('t.transaction_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('t.transaction_date <= ?');
    params.push(dateTo);
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const TX_COUNT_FROM = `
  FROM warehouse_transactions t
  JOIN materials m ON m.id = t.material_id
`;

async function findTransactions({ page = 1, pageSize = 15, ...filters }) {
  const { whereSql, params } = buildTxFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${TX_SELECT} ${whereSql} ORDER BY t.transaction_date DESC, t.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total ${TX_COUNT_FROM} ${whereSql}`,
    params
  );

  return { rows, total };
}

/** Recent movements shown on a warehouse's detail screen. */
async function findRecentTransactions(warehouseId, limit = 10) {
  const [rows] = await pool.query(
    `${TX_SELECT}
     WHERE t.warehouse_id = ? OR t.destination_warehouse_id = ?
     ORDER BY t.transaction_date DESC, t.id DESC
     LIMIT ?`,
    [warehouseId, warehouseId, Number(limit)]
  );
  return rows;
}

/** Highest number in play for a type prefix, so a generated one cannot collide. */
async function nextTransactionNumber(prefix, conn) {
  const [rows] = await runner(conn).query(
    `SELECT COALESCE(MAX(CASE WHEN transaction_number REGEXP ?
                              THEN CAST(SUBSTRING(transaction_number, ?) AS UNSIGNED) END), 0) AS max_num
     FROM warehouse_transactions`,
    [`^${prefix}-[0-9]+$`, prefix.length + 2]
  );
  return Number(rows[0]?.max_num || 0) + 1;
}

const TX_COLUMNS = [
  'transaction_number', 'transaction_type', 'material_id', 'warehouse_id',
  'destination_warehouse_id', 'project_id', 'site_id', 'quantity', 'unit',
  'adjustment_type', 'reason', 'reference', 'procurement_receipt_id',
  'procurement_request_id', 'transaction_date', 'performed_by', 'notes',
];

async function createTransaction(payload, conn) {
  const [result] = await runner(conn).query(
    `INSERT INTO warehouse_transactions (${TX_COLUMNS.map((c) => `\`${c}\``).join(', ')})
     VALUES (${TX_COLUMNS.map(() => '?').join(', ')})`,
    TX_COLUMNS.map((key) => payload[key] ?? null)
  );
  return result.insertId;
}

async function findTransactionById(id) {
  const [rows] = await pool.query(`${TX_SELECT} WHERE t.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

/** Has this procurement receipt already been brought into warehouse stock? */
async function findTransactionByReceipt(procurementReceiptId, conn) {
  const [rows] = await runner(conn).query(
    'SELECT id, transaction_number FROM warehouse_transactions WHERE procurement_receipt_id = ? LIMIT 1',
    [procurementReceiptId]
  );
  return rows[0] || null;
}

// ------------------------------------------------------------------- summary

/** Headline figures for the warehouse overview strip. All derived, none stored. */
async function findSummary() {
  const [[warehouses]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status = 'active')   AS active,
            SUM(status = 'inactive') AS inactive
     FROM warehouses`
  );

  const [[stock]] = await pool.query(
    `SELECT COUNT(DISTINCT CASE WHEN ws.quantity > 0 THEN ws.material_id END) AS materials_in_stock,
            COALESCE(SUM(GREATEST(ws.quantity, 0)), 0)                        AS total_quantity,
            COALESCE(SUM(GREATEST(ws.quantity, 0) * m.default_rate), 0)       AS stock_value
     FROM warehouse_stock ws
     JOIN materials m ON m.id = ws.material_id`
  );

  // Low/out is judged per material per warehouse against the catalogue
  // reorder point, matching the badge shown on the stock table.
  const [[alerts]] = await pool.query(
    `SELECT SUM(a.is_low) AS low_stock, SUM(a.is_out) AS out_of_stock
     FROM (
       SELECT ws.warehouse_id, ws.material_id,
              SUM(ws.quantity) AS qty, MAX(m.min_stock) AS min_stock,
              CASE WHEN SUM(ws.quantity) <= 0 THEN 1 ELSE 0 END AS is_out,
              CASE WHEN SUM(ws.quantity) > 0 AND MAX(m.min_stock) > 0
                        AND SUM(ws.quantity) <= MAX(m.min_stock) THEN 1 ELSE 0 END AS is_low
       FROM warehouse_stock ws
       JOIN materials m ON m.id = ws.material_id
       GROUP BY ws.warehouse_id, ws.material_id
     ) a`
  );

  const [[movements]] = await pool.query(
    `SELECT
       SUM(transaction_type = 'receipt')    AS receipts,
       SUM(transaction_type = 'issue')      AS issues,
       SUM(transaction_type = 'transfer')   AS transfers,
       SUM(transaction_type = 'adjustment') AS adjustments
     FROM warehouse_transactions
     WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`
  );

  return { warehouses, stock, alerts, movements };
}

/** Low and out-of-stock lines for one warehouse's detail screen. */
async function findAlerts(warehouseId, status) {
  const [rows] = await pool.query(
    `${STOCK_SELECT}
     WHERE ws.warehouse_id = ? AND (${STOCK_STATUS_SQL[status]})
     ORDER BY m.name`,
    [warehouseId]
  );
  return rows;
}

// -------------------------------------------------- warehouse ownership (scopes)

/**
 * Provisions a Central Company Warehouse if none exists.
 */
async function ensureCentralWarehouse() {
  await pool.query(
    `INSERT INTO warehouses (code, name, location, description, status, type, contractor_id)
     SELECT 'WH-001', 'Central Main Warehouse', 'Headquarters / Main Store Yard',
            'Main central warehouse for procurement, central stock storage, and site material transfers.',
            'active', 'central', NULL
     WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE type = 'central')`
  );
}

/**
 * Provisions a warehouse for any contractor that does not yet have one. Same
 * INSERT ... SELECT WHERE NOT EXISTS as the migration, run lazily so a
 * contractor created after the migration still gets a warehouse the first time
 * the warehouse screen loads — without the Contractor module needing changes.
 */
async function ensureContractorWarehouses() {
  await pool.query(
    `INSERT INTO warehouses (code, name, location, description, status, type, contractor_id)
     SELECT CONCAT('WH-C', LPAD(c.id, 3, '0')),
            CONCAT(c.name, ' Warehouse'),
            COALESCE(NULLIF(TRIM(c.address), ''), 'Contractor site'),
            'Contractor-held stock', 'active', 'contractor', c.id
     FROM contractors c
     WHERE NOT EXISTS (SELECT 1 FROM warehouses w WHERE w.contractor_id = c.id)`
  );
}

/** Central warehouses and contractor warehouses, for the top-of-page switcher. */
async function findScopes() {
  const [central] = await pool.query(
    `SELECT id, code, name, location FROM warehouses
     WHERE type = 'central' AND status = 'active'
     ORDER BY id ASC`
  );
  const [contractors] = await pool.query(
    `SELECT w.id, w.code, w.name, w.location, w.contractor_id,
            c.name AS contractor_name
     FROM warehouses w
     JOIN contractors c ON c.id = w.contractor_id
     WHERE w.type = 'contractor' AND w.status = 'active'
     ORDER BY c.name ASC`
  );
  return { central, contractors };
}

/**
 * Per-material overview for one or more central warehouses:
 *   currentStock     — what is on hand right now
 *   purchasedReceived— everything ever brought in (receipts + inbound transfers)
 *   lastMovement     — date of the most recent movement touching that material
 *   status           — in_stock | low | out against the catalogue reorder point
 * Deliberately material-level and warehouse-level only: NO project/site slot,
 * because the Central Company Warehouse is not identified by project or site.
 */
async function findCentralOverview(warehouseIds) {
  if (!warehouseIds || warehouseIds.length === 0) return [];
  const placeholders = warehouseIds.map(() => '?').join(', ');

  const [rows] = await pool.query(
    `SELECT m.id AS material_id,
            COALESCE(m.code, CONCAT('MAT-', LPAD(m.id, 4, '0'))) AS material_code,
            m.name AS material_name, m.category AS material_category,
            m.unit AS material_unit, m.min_stock,
            COALESCE(bal.current_stock, 0)        AS current_stock,
            COALESCE(rcv.purchased_received, 0)   AS purchased_received,
            mv.last_movement,
            CASE
              WHEN COALESCE(bal.current_stock, 0) <= 0 THEN 'out'
              WHEN m.min_stock > 0 AND COALESCE(bal.current_stock, 0) <= m.min_stock THEN 'low'
              ELSE 'in_stock'
            END AS stock_status
     FROM materials m
     LEFT JOIN (
       SELECT material_id, SUM(quantity) AS current_stock
       FROM warehouse_stock
       WHERE warehouse_id IN (${placeholders})
       GROUP BY material_id
     ) bal ON bal.material_id = m.id
     LEFT JOIN (
       SELECT material_id, SUM(quantity) AS purchased_received
       FROM warehouse_transactions
       WHERE (
         (transaction_type = 'receipt'     AND warehouse_id IN (${placeholders})) OR
         (transaction_type = 'transfer'    AND destination_warehouse_id IN (${placeholders})) OR
         (transaction_type = 'adjustment'  AND adjustment_type = 'increase' AND warehouse_id IN (${placeholders}))
       )
       GROUP BY material_id
     ) rcv ON rcv.material_id = m.id
     LEFT JOIN (
       SELECT material_id, MAX(transaction_date) AS last_movement
       FROM warehouse_transactions
       WHERE warehouse_id IN (${placeholders}) OR destination_warehouse_id IN (${placeholders})
       GROUP BY material_id
     ) mv ON mv.material_id = m.id
     WHERE COALESCE(bal.current_stock, 0) <> 0 OR rcv.purchased_received IS NOT NULL
     ORDER BY m.category, m.name`,
    [
      ...warehouseIds, // bal
      ...warehouseIds, ...warehouseIds, ...warehouseIds, // rcv (receipt, transfer, adjustment)
      ...warehouseIds, ...warehouseIds, // mv
    ]
  );
  return rows;
}

/**
 * Movements where either end is a contractor warehouse — the "Total Contractor
 * Warehouses" view. One row per movement, carrying both ends so the screen can
 * show Source and Destination honestly (Central -> Twinkle, Twinkle -> Sahil).
 */
function buildContractorTxFilters({
  search, type, contractorId, materialId, projectId, siteId,
  fromWarehouseId, toWarehouseId, location, dateFrom, dateTo,
}) {
  // Base: the movement must touch at least one contractor warehouse.
  const where = ["(w.type = 'contractor' OR dw.type = 'contractor')"];
  const params = [];

  if (search) {
    where.push('(t.transaction_number LIKE ? OR m.name LIKE ? OR t.reference LIKE ?)');
    params.push(...Array(3).fill(`%${search}%`));
  }
  if (type && type !== 'all') {
    where.push('t.transaction_type = ?');
    params.push(type);
  }
  if (contractorId && contractorId !== 'all') {
    where.push('(w.contractor_id = ? OR dw.contractor_id = ?)');
    params.push(Number(contractorId), Number(contractorId));
  }
  if (materialId && materialId !== 'all') {
    where.push('t.material_id = ?');
    params.push(Number(materialId));
  }
  if (projectId && projectId !== 'all') {
    where.push('t.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId && siteId !== 'all') {
    where.push('t.site_id = ?');
    params.push(Number(siteId));
  }
  if (fromWarehouseId && fromWarehouseId !== 'all') {
    where.push('t.warehouse_id = ?');
    params.push(Number(fromWarehouseId));
  }
  if (toWarehouseId && toWarehouseId !== 'all') {
    where.push('t.destination_warehouse_id = ?');
    params.push(Number(toWarehouseId));
  }
  if (location && location !== 'all') {
    where.push('(w.location = ? OR dw.location = ?)');
    params.push(location, location);
  }
  if (dateFrom) {
    where.push('t.transaction_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('t.transaction_date <= ?');
    params.push(dateTo);
  }

  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

async function findContractorTransactions({ page = 1, pageSize = 20, ...filters }) {
  const { whereSql, params } = buildContractorTxFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT
       t.id, t.transaction_number, t.transaction_type, t.material_id, t.warehouse_id,
       t.destination_warehouse_id, t.project_id, t.site_id, t.quantity, t.unit,
       t.adjustment_type, t.reason, t.reference, t.procurement_receipt_id,
       t.procurement_request_id, t.transaction_date, t.performed_by, t.notes, t.created_at,
       w.code AS warehouse_code, w.name AS warehouse_name,
       dw.code AS destination_code, dw.name AS destination_name,
       COALESCE(m.code, CONCAT('MAT-', LPAD(m.id, 4, '0'))) AS material_code,
       m.name AS material_name, m.category AS material_category, m.unit AS material_unit,
       p.name AS project_name, p.code AS project_code,
       s.name AS site_name,
       u.full_name AS performed_by_name,
       pr.request_number, pr.po_number,
       w.type AS source_type, w.contractor_id AS source_contractor_id, sc.name AS source_contractor_name,
       dw.type AS destination_type, dw.contractor_id AS destination_contractor_id, dc.name AS destination_contractor_name,
       w.location AS source_location, dw.location AS destination_location
     FROM warehouse_transactions t
     JOIN warehouses w   ON w.id = t.warehouse_id
     LEFT JOIN warehouses dw ON dw.id = t.destination_warehouse_id
     JOIN materials m    ON m.id = t.material_id
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN sites    s ON s.id = t.site_id
     LEFT JOIN users    u ON u.id = t.performed_by
     LEFT JOIN procurement_requests pr ON pr.id = t.procurement_request_id
     LEFT JOIN contractors sc ON sc.id = w.contractor_id
     LEFT JOIN contractors dc ON dc.id = dw.contractor_id
     ${whereSql}
     ORDER BY t.transaction_date DESC, t.id DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM warehouse_transactions t
     JOIN warehouses w ON w.id = t.warehouse_id
     LEFT JOIN warehouses dw ON dw.id = t.destination_warehouse_id
     JOIN materials m ON m.id = t.material_id
     ${whereSql}`,
    params
  );

  return { rows, total };
}

module.exports = {
  findAll, findById, findRawById, findByCode, lockWarehouse, nextCodeNumber,
  create, update, findLocations,
  findStock, findStockSlot, totalForMaterial, adjustStockSlot, findProjectSiteStock,
  findTransactions, findRecentTransactions, findTransactionById,
  findTransactionByReceipt, nextTransactionNumber, createTransaction,
  findSummary, findAlerts,
  ensureCentralWarehouse, ensureContractorWarehouses, findScopes, findCentralOverview, findContractorTransactions,
};
