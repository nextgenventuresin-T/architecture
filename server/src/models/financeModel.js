'use strict';

const { pool } = require('../config/db');

/**
 * Read/write access for the finance module.
 *
 * Every figure here is read from tables that already existed:
 *   expenses              — the expense ledger (Interface 3, extended by
 *                           schema_finance.sql with number/status/payment fields)
 *   contractor_payments   — contract value and paid amount per project+contractor
 *   procurement_requests  — estimated / ordered / received value (Interface 7)
 *   procurement_receipts  — received quantities
 *   projects              — `estimated_budget` IS the project budget
 *
 * No finance-specific entity table exists, and none is needed.
 */

// Rejected and cancelled expenses are not money spent, so they are excluded
// from every total. One expression, used everywhere, so the dashboard, the
// project view and the payment tracker can never disagree.
const COUNTED_EXPENSE = "e.status NOT IN ('rejected', 'cancelled')";

// -------------------------------------------------------------- expenses

const EXPENSE_SELECT = `
  SELECT
    e.id, e.expense_number, e.project_id, e.site_id, e.contractor_id, e.category, e.description,
    e.amount, e.expense_date, e.paid_by, e.party_name, e.payment_method, e.reference,
    e.bill_file_path, e.bill_file_name, e.bill_file_type, e.bill_file_size, e.bill_uploaded_at,
    e.status, e.notes, e.created_by, e.created_at, e.updated_at,
    p.name AS project_name, p.code AS project_code,
    s.name AS site_name,
    c.name AS contractor_name,
    u.full_name AS created_by_name
  FROM expenses e
  JOIN projects p ON p.id = e.project_id
  LEFT JOIN sites s ON s.id = e.site_id
  LEFT JOIN contractors c ON c.id = e.contractor_id
  LEFT JOIN users u ON u.id = e.created_by
`;

const EXPENSE_COUNT_FROM = `
  FROM expenses e
  JOIN projects p ON p.id = e.project_id
  LEFT JOIN sites s ON s.id = e.site_id
  LEFT JOIN contractors c ON c.id = e.contractor_id
`;

function buildExpenseFilters({ search, projectId, siteId, category, status, dateFrom, dateTo, contractorId }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(e.expense_number LIKE ? OR e.description LIKE ? OR e.paid_by LIKE ? OR e.party_name LIKE ? OR e.reference LIKE ? OR p.name LIKE ? OR c.name LIKE ?)');
    params.push(...Array(7).fill(`%${search}%`));
  }
  if (projectId && projectId !== 'all') {
    where.push('e.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId && siteId !== 'all') {
    where.push('e.site_id = ?');
    params.push(Number(siteId));
  }
  if (contractorId && contractorId !== 'all') {
    where.push('e.contractor_id = ?');
    params.push(Number(contractorId));
  }
  if (category && category !== 'all') {
    where.push('e.category = ?');
    params.push(category);
  }
  if (status && status !== 'all') {
    where.push('e.status = ?');
    params.push(status);
  }
  if (dateFrom) {
    where.push('e.expense_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('e.expense_date <= ?');
    params.push(dateTo);
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findExpenses({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildExpenseFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${EXPENSE_SELECT} ${whereSql} ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total ${EXPENSE_COUNT_FROM} ${whereSql}`,
    params
  );

  // Filtered total, so the screen can show the value of what is on screen
  // rather than only a page count.
  const [[{ filtered_amount: filteredAmount }]] = await pool.query(
    `SELECT COALESCE(SUM(e.amount), 0) AS filtered_amount ${EXPENSE_COUNT_FROM} ${whereSql}`,
    params
  );

  return { rows, total, filteredAmount: Number(filteredAmount || 0) };
}

async function findExpenseById(id) {
  const [rows] = await pool.query(`${EXPENSE_SELECT} WHERE e.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function findRawExpenseById(id) {
  const [rows] = await pool.query('SELECT * FROM expenses WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findExpenseByNumber(expenseNumber) {
  const [rows] = await pool.query('SELECT id FROM expenses WHERE expense_number = ? LIMIT 1', [expenseNumber]);
  return rows[0] || null;
}

/** Highest number in play, so a generated expense number cannot collide. */
async function nextExpenseNumber() {
  const [rows] = await pool.query(
    `SELECT GREATEST(
              COALESCE(MAX(CASE WHEN expense_number REGEXP '^EXP-[0-9]+$'
                                THEN CAST(SUBSTRING(expense_number, 5) AS UNSIGNED) END), 0),
              COALESCE(MAX(id), 0)
            ) AS max_num
     FROM expenses`
  );
  return Number(rows[0]?.max_num || 0) + 1;
}

const EXPENSE_WRITABLE = [
  'expense_number', 'project_id', 'site_id', 'contractor_id', 'category', 'description', 'amount',
  'expense_date', 'paid_by', 'party_name', 'payment_method', 'reference',
  'bill_file_path', 'bill_file_name', 'bill_file_type', 'bill_file_size', 'bill_uploaded_at',
  'status', 'notes', 'created_by',
  // Linkage: which Task it belongs to and which source transaction produced it.
  'task_id', 'source_type', 'source_id', 'tool_unit_id',
];

async function createExpense(payload) {
  const columns = EXPENSE_WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO expenses (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

const EXPENSE_UPDATABLE = [
  'project_id', 'site_id', 'contractor_id', 'category', 'description', 'amount', 'expense_date',
  'paid_by', 'party_name', 'payment_method', 'reference',
  'bill_file_path', 'bill_file_name', 'bill_file_type', 'bill_file_size', 'bill_uploaded_at',
  'status', 'notes',
];

async function updateExpense(id, payload) {
  const columns = EXPENSE_UPDATABLE.filter((key) => payload[key] !== undefined);
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE expenses SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

async function updateExpenseStatus(id, status) {
  await pool.query('UPDATE expenses SET status = ? WHERE id = ?', [status, id]);
}

/** Categories already in use, so existing values stay filterable. */
async function findExpenseCategories() {
  const [rows] = await pool.query(
    "SELECT DISTINCT category FROM expenses WHERE category <> '' ORDER BY category"
  );
  return rows.map((row) => row.category);
}

// --------------------------------------------------- contractor payments

const CONTRACTOR_PAYMENT_SELECT = `
  SELECT
    cp.id, cp.project_id, cp.contractor_id, cp.site_id, cp.contract_value,
    cp.paid_amount, cp.payment_reference, cp.payment_date, cp.payment_status,
    cp.notes, cp.updated_at,
    (cp.contract_value - cp.paid_amount) AS outstanding,
    p.name AS project_name, p.code AS project_code,
    s.name AS site_name,
    c.name AS contractor_name, c.contact_person, c.phone AS contractor_phone
  FROM contractor_payments cp
  JOIN projects p ON p.id = cp.project_id
  JOIN contractors c ON c.id = cp.contractor_id
  LEFT JOIN sites s ON s.id = cp.site_id
`;

function buildPaymentFilters({ search, projectId, siteId, contractorId, status }) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(c.name LIKE ? OR p.name LIKE ? OR cp.payment_reference LIKE ?)');
    params.push(...Array(3).fill(`%${search}%`));
  }
  if (projectId && projectId !== 'all') {
    where.push('cp.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId && siteId !== 'all') {
    where.push('cp.site_id = ?');
    params.push(Number(siteId));
  }
  if (contractorId && contractorId !== 'all') {
    where.push('cp.contractor_id = ?');
    params.push(Number(contractorId));
  }
  if (status && status !== 'all') {
    where.push('cp.payment_status = ?');
    params.push(status);
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findContractorPayments({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildPaymentFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${CONTRACTOR_PAYMENT_SELECT} ${whereSql} ORDER BY cp.updated_at DESC, cp.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM contractor_payments cp
     JOIN projects p ON p.id = cp.project_id
     JOIN contractors c ON c.id = cp.contractor_id
     ${whereSql}`,
    params
  );

  return { rows, total };
}

async function findContractorPaymentById(id) {
  const [rows] = await pool.query(`${CONTRACTOR_PAYMENT_SELECT} WHERE cp.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

// ---------------------------------------------------- procurement finance

/**
 * Procurement cost per request. Estimated is quantity * rate; ordered uses the
 * ordered quantity once a PO exists; received values only what has actually
 * arrived, summed from procurement_receipts. Nothing is recalculated in a way
 * that could disagree with Interface 7 — the same source rows are read.
 */
const PROCUREMENT_FINANCE_SELECT = `
  SELECT
    r.id, r.request_number, r.po_number, r.project_id, r.site_id, r.material_id,
    r.supplier, r.quantity, r.unit, r.estimated_rate, r.ordered_quantity,
    r.status, r.order_date, r.required_date,
    (r.quantity * r.estimated_rate) AS estimated_amount,
    (COALESCE(r.ordered_quantity, 0) * r.estimated_rate) AS ordered_amount,
    (COALESCE(rc.received_qty, 0) * r.estimated_rate) AS received_amount,
    COALESCE(rc.received_qty, 0) AS received_quantity,
    p.name AS project_name, p.code AS project_code,
    s.name AS site_name,
    m.name AS material_name, m.category AS material_category
  FROM procurement_requests r
  JOIN projects p ON p.id = r.project_id
  LEFT JOIN sites s ON s.id = r.site_id
  JOIN materials m ON m.id = r.material_id
  LEFT JOIN (
    SELECT procurement_request_id, SUM(received_quantity) AS received_qty
    FROM procurement_receipts GROUP BY procurement_request_id
  ) rc ON rc.procurement_request_id = r.id
`;

function buildProcurementFilters({ search, projectId, siteId, supplier, status }) {
  // Cancelled and rejected requests never become cost, so they are excluded
  // from the financial view by default.
  const where = ["r.status NOT IN ('cancelled', 'rejected')"];
  const params = [];

  if (search) {
    where.push('(r.request_number LIKE ? OR r.po_number LIKE ? OR m.name LIKE ? OR r.supplier LIKE ?)');
    params.push(...Array(4).fill(`%${search}%`));
  }
  if (projectId && projectId !== 'all') {
    where.push('r.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId && siteId !== 'all') {
    where.push('r.site_id = ?');
    params.push(Number(siteId));
  }
  if (supplier && supplier !== 'all') {
    where.push('r.supplier = ?');
    params.push(supplier);
  }
  if (status && status !== 'all') {
    where.push('r.status = ?');
    params.push(status);
  }

  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

async function findProcurementFinance({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildProcurementFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${PROCUREMENT_FINANCE_SELECT} ${whereSql} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM procurement_requests r
     JOIN materials m ON m.id = r.material_id
     ${whereSql}`,
    params
  );

  return { rows, total };
}

// ------------------------------------------------------------- dashboard

/**
 * Headline figures. Procurement cost is counted at ORDERED value (a placed
 * purchase order is committed money), falling back to the estimate for
 * requests not yet ordered, which is what makes "Total spent" reflect
 * commitments rather than only settled invoices.
 */
async function findSummary() {
  const [[budgets]] = await pool.query(
    'SELECT COALESCE(SUM(estimated_budget), 0) AS total_budget, COUNT(*) AS project_count FROM projects WHERE is_archived = 0'
  );

  const [[expenses]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN ${COUNTED_EXPENSE} THEN e.amount END), 0)            AS total,
       COALESCE(SUM(CASE WHEN e.status = 'paid' THEN e.amount END), 0)             AS paid,
       COALESCE(SUM(CASE WHEN e.status IN ('pending', 'approved') THEN e.amount END), 0) AS pending,
       COUNT(*)                                                                    AS count_all,
       SUM(e.status = 'pending')                                                   AS pending_count
     FROM expenses e`
  );

  const [[contractors]] = await pool.query(
    `SELECT
       COALESCE(SUM(contract_value), 0)                  AS contract_value,
       COALESCE(SUM(paid_amount), 0)                     AS paid,
       COALESCE(SUM(contract_value - paid_amount), 0)    AS outstanding,
       COUNT(*)                                          AS count_all
     FROM contractor_payments`
  );

  const [[procurement]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE
         WHEN r.ordered_quantity IS NOT NULL THEN r.ordered_quantity * r.estimated_rate
         ELSE r.quantity * r.estimated_rate END), 0) AS committed_value,
       COALESCE(SUM(rc.received_qty * r.estimated_rate), 0) AS received_value,
       COUNT(*) AS count_all
     FROM procurement_requests r
     LEFT JOIN (
       SELECT procurement_request_id, SUM(received_quantity) AS received_qty
       FROM procurement_receipts GROUP BY procurement_request_id
     ) rc ON rc.procurement_request_id = r.id
     WHERE r.status NOT IN ('cancelled', 'rejected')`
  );

  const [[labour]] = await pool.query(
    `SELECT
       COALESCE(SUM(l.present_count * l.daily_rate), 0) AS labour_cost,
       COUNT(*) AS count_all
     FROM labour_records l`
  );

  return { budgets, expenses, contractors, procurement, labour };
}

/** Expense totals by category, for the dashboard breakdown. */
async function findExpenseByCategory() {
  const [rows] = await pool.query(
    `SELECT e.category, COALESCE(SUM(e.amount), 0) AS total, COUNT(*) AS count_all
     FROM expenses e
     WHERE ${COUNTED_EXPENSE}
     GROUP BY e.category
     ORDER BY total DESC`
  );
  return rows;
}

/**
 * Per-project financial position.
 *
 *   Total spent      = procurement cost + contractor payments + labour cost + other expenses
 *   Remaining budget = project budget - total spent
 *
 * "Other expenses" deliberately EXCLUDES the material and contractor expense
 * categories. Those costs already arrive through the procurement and
 * contractor columns, so counting the expense rows too would inflate every
 * project's spend. This is the one place those sources could overlap.
 *
 * Labour cost comes from `labour_records` (present_count * daily_rate),
 * joined via `sites.project_id` since the table only carries a site_id.
 * It was previously computed and displayed elsewhere (site/contractor/
 * employee detail views) but never rolled into this total — a project's
 * spend could look under-budget while its labour bill was invisible here.
 */
async function findProjectFinancials({ projectId, page = 1, pageSize = 10, search }) {
  const where = ['p.is_archived = 0'];
  const params = [];

  if (projectId && projectId !== 'all') {
    where.push('p.id = ?');
    params.push(Number(projectId));
  }
  if (search) {
    where.push('(p.name LIKE ? OR p.code LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT
       p.id, p.code, p.name, p.status, p.estimated_budget AS budget,
       COALESCE(proc.committed_value, 0)  AS procurement_cost,
       COALESCE(cp.paid_amount, 0)        AS contractor_paid,
       COALESCE(cp.contract_value, 0)     AS contractor_contract_value,
       COALESCE(exp.other_expenses, 0)    AS other_expenses,
       COALESCE(exp.material_consumption_cost, 0) AS material_consumption_cost,
       COALESCE(exp.all_expenses, 0)      AS all_expenses,
       COALESCE(lab.labour_cost, 0)       AS labour_cost
     FROM projects p
     LEFT JOIN (
       SELECT r.project_id,
              SUM(CASE WHEN r.ordered_quantity IS NOT NULL
                       THEN r.ordered_quantity * r.estimated_rate
                       ELSE r.quantity * r.estimated_rate END) AS committed_value
       FROM procurement_requests r
       WHERE r.status NOT IN ('cancelled', 'rejected')
       GROUP BY r.project_id
     ) proc ON proc.project_id = p.id
     LEFT JOIN (
       SELECT project_id,
              SUM(paid_amount)    AS paid_amount,
              SUM(contract_value) AS contract_value
       FROM contractor_payments
       GROUP BY project_id
     ) cp ON cp.project_id = p.id
     LEFT JOIN (
       SELECT e.project_id,
              SUM(CASE WHEN e.category NOT IN ('material', 'contractor', 'Material Consumption') THEN e.amount ELSE 0 END) AS other_expenses,
              SUM(CASE WHEN e.category = 'Material Consumption' THEN e.amount ELSE 0 END) AS material_consumption_cost,
              SUM(e.amount) AS all_expenses
       FROM expenses e
       WHERE ${COUNTED_EXPENSE}
       GROUP BY e.project_id
     ) exp ON exp.project_id = p.id
     LEFT JOIN (
       SELECT s.project_id,
              SUM(l.present_count * l.daily_rate) AS labour_cost
       FROM labour_records l
       JOIN sites s ON s.id = l.site_id
       GROUP BY s.project_id
     ) lab ON lab.project_id = p.id
     ${whereSql}
     ORDER BY p.name
     LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM projects p ${whereSql}`,
    params
  );

  return { rows, total };
}

// ------------------------------------------------------- payment tracking

/**
 * One unified payment feed across the three sources. UNION ALL rather than a
 * payments table, so nothing has to be kept in sync and the tracker can never
 * disagree with the module a payment came from.
 */
function paymentTrackingSql() {
  return `
    SELECT * FROM (
      SELECT
        CONCAT('EXP-', e.id)         AS row_key,
        'expense'                    AS payment_type,
        e.expense_number             AS reference,
        e.project_id, e.site_id,
        p.name AS project_name, s.name AS site_name,
        COALESCE(e.party_name, e.paid_by, 'Not recorded') AS party,
        e.amount, e.expense_date AS payment_date, e.status, e.notes,
        e.category AS detail
      FROM expenses e
      JOIN projects p ON p.id = e.project_id
      LEFT JOIN sites s ON s.id = e.site_id

      UNION ALL

      SELECT
        CONCAT('CON-', cp.id),
        'contractor',
        COALESCE(cp.payment_reference, CONCAT('CP-', LPAD(cp.id, 4, '0'))),
        cp.project_id, cp.site_id,
        p.name, s.name,
        c.name,
        cp.paid_amount, cp.payment_date, cp.payment_status, cp.notes,
        'Contractor payment'
      FROM contractor_payments cp
      JOIN projects p ON p.id = cp.project_id
      JOIN contractors c ON c.id = cp.contractor_id
      LEFT JOIN sites s ON s.id = cp.site_id

      UNION ALL

      SELECT
        CONCAT('PRC-', r.id),
        'procurement',
        COALESCE(r.po_number, r.request_number),
        r.project_id, r.site_id,
        p.name, s.name,
        COALESCE(r.supplier, 'Not recorded'),
        (COALESCE(r.ordered_quantity, r.quantity) * r.estimated_rate),
        r.order_date,
        r.status, r.notes,
        m.name
      FROM procurement_requests r
      JOIN projects p ON p.id = r.project_id
      JOIN materials m ON m.id = r.material_id
      LEFT JOIN sites s ON s.id = r.site_id
      WHERE r.status NOT IN ('cancelled', 'rejected', 'draft')
    ) t
  `;
}

async function findPaymentTracking({ page = 1, pageSize = 15, type, projectId, siteId, status, search, dateFrom, dateTo }) {
  const where = [];
  const params = [];

  if (type && type !== 'all') {
    where.push('t.payment_type = ?');
    params.push(type);
  }
  if (projectId && projectId !== 'all') {
    where.push('t.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId && siteId !== 'all') {
    where.push('t.site_id = ?');
    params.push(Number(siteId));
  }
  if (status && status !== 'all') {
    where.push('t.status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(t.reference LIKE ? OR t.party LIKE ? OR t.project_name LIKE ?)');
    params.push(...Array(3).fill(`%${search}%`));
  }
  if (dateFrom) {
    where.push('t.payment_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('t.payment_date <= ?');
    params.push(dateTo);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;
  const base = paymentTrackingSql();

  const [rows] = await pool.query(
    `SELECT t.* FROM (${base}) t ${whereSql}
     ORDER BY t.payment_date IS NULL, t.payment_date DESC, t.reference DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM (${base}) t ${whereSql}`,
    params
  );

  const [[{ total_amount: totalAmount }]] = await pool.query(
    `SELECT COALESCE(SUM(t.amount), 0) AS total_amount FROM (${base}) t ${whereSql}`,
    params
  );

  return { rows, total, totalAmount: Number(totalAmount || 0) };
}

/** Suppliers already in play, offered as a finance filter. */
async function findSuppliers() {
  const [rows] = await pool.query(
    `SELECT DISTINCT supplier FROM procurement_requests
     WHERE supplier IS NOT NULL AND supplier <> '' ORDER BY supplier`
  );
  return rows.map((row) => row.supplier);
}

module.exports = {
  findExpenses, findExpenseById, findRawExpenseById, findExpenseByNumber,
  nextExpenseNumber, createExpense, updateExpense, updateExpenseStatus,
  findExpenseCategories,
  findContractorPayments, findContractorPaymentById,
  findProcurementFinance,
  findSummary, findExpenseByCategory, findProjectFinancials,
  findPaymentTracking, findSuppliers,
};
