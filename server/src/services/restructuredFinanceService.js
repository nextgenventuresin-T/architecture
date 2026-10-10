'use strict';

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { getActualMaterialRate } = require('../utils/materialPricing');

/**
 * Helper to ensure numeric values
 */
function num(v, def = 0) {
  if (v === null || v === undefined) return def;
  const n = Number(v);
  return isNaN(n) ? def : n;
}


// ---------------------------------------------------------------------------
// MATERIAL ACTUAL COST - single definition used by Project Summary and Budget vs
// Actual so both always agree.
//
// A material consumption is recorded as a daily-work update AND an expense row
// (the expense is how it reaches Finance). Counting both doubles the cost. So the
// actual cost is taken ONCE per consumption: the cost snapshot stored on the update
// (quantity x the actual cost per unit of the stock it came from), falling back to
// its linked expense amount, then to the latest actual purchase rate. Material-
// consumption expenses that no update points at (entered directly) are added once.
// Receiving or transferring material is never counted here - only consumption is.
// ---------------------------------------------------------------------------
const FALLBACK_RATE_SQL = `COALESCE(
  (SELECT prx.purchase_rate FROM procurement_requests prx
    WHERE prx.material_id = dwu.material_id AND prx.purchase_rate > 0 ORDER BY prx.id DESC LIMIT 1),
  m.default_rate, 0)`;

function materialActualSql(dwuWhere, expenseWhere) {
  return `(
        COALESCE((
          SELECT SUM(CASE WHEN ex.status IN ('rejected', 'cancelled') THEN 0
                          ELSE COALESCE(dwu.material_cost, ex.amount, dwu.quantity_used * ${FALLBACK_RATE_SQL}) END)
          FROM daily_work_updates dwu
          LEFT JOIN expenses ex ON ex.id = dwu.expense_id
          LEFT JOIN materials m ON m.id = dwu.material_id
          WHERE dwu.quantity_used > 0 AND ${dwuWhere}
        ), 0) + COALESCE((
          SELECT SUM(e2.amount) FROM expenses e2
          WHERE e2.category = 'Material Consumption' AND e2.status NOT IN ('rejected', 'cancelled')
            AND NOT EXISTS (SELECT 1 FROM daily_work_updates d2 WHERE d2.expense_id = e2.id)
            AND ${expenseWhere}
        ), 0)
      )`;
}

// =========================================================================
// TAB 1: PROJECT COST SUMMARY
// Project, Site, Material Cost, Labour Cost, Machine/Tool Cost, Misc Cost, Total Actual, Budget, Remaining, Util %
// =========================================================================
async function getProjectCosts({ projectId, siteId } = {}) {
  const where = ['p.is_archived = 0'];
  const params = [];
  if (projectId) {
    where.push('p.id = ?');
    params.push(Number(projectId));
  }
  if (siteId) {
    where.push('s.id = ?');
    params.push(Number(siteId));
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const query = `
    SELECT
      p.id AS project_id, p.name AS project_name, p.code AS project_code,
      s.id AS site_id, s.name AS site_name,
      COALESCE(p.estimated_budget, 0) AS planned_budget,
      
      -- Material cost: ONE amount per consumption (never the update AND its expense)
      ${materialActualSql('dwu.project_id = p.id AND (s.id IS NULL OR dwu.site_id = s.id)', 'e2.project_id = p.id AND (s.id IS NULL OR e2.site_id = s.id)')} AS material_cost,

      -- Labour cost from worker logs
      COALESCE((
        SELECT SUM((twl.hours_worked / 8.0) * twl.daily_wage)
        FROM task_worker_logs twl
        WHERE twl.project_id = p.id AND (s.id IS NULL OR twl.site_id = s.id OR (twl.site_id IS NULL AND (SELECT site_id FROM project_tasks pt WHERE pt.id = twl.task_id) = s.id))
          AND COALESCE(twl.worker_type, 'daily_wage') NOT IN ('company_labour', 'company_employee')
          AND LOWER(COALESCE(twl.labour_type, '')) NOT LIKE '%company%'
      ), 0) + COALESCE((
        SELECT SUM(e.amount) FROM expenses e
        WHERE e.project_id = p.id AND (s.id IS NULL OR e.site_id = s.id)
          AND e.category IN ('Labour Expense', 'Advance Wages', 'Labour Room Rent', 'Labour Conveyance')
          AND e.status NOT IN ('rejected', 'cancelled')
      ), 0) AS labour_cost,

      -- Machine / Tool cost from daily work and tool expenses
      COALESCE((
        SELECT SUM(dwu.tool_cost)
        FROM daily_work_updates dwu
        WHERE dwu.project_id = p.id AND (s.id IS NULL OR dwu.site_id = s.id) AND dwu.tool_cost > 0
      ), 0) + COALESCE((
        SELECT SUM(e.amount) FROM expenses e
        WHERE e.project_id = p.id AND (s.id IS NULL OR e.site_id = s.id)
          AND e.category IN ('Machine / Tool', 'Equipment Rental', 'Tools', 'Machinery', 'Tools & Equipment')
          AND e.status NOT IN ('rejected', 'cancelled')
          AND (e.reference IS NULL OR e.reference NOT LIKE 'DWU-TOOL-%')
      ), 0) AS machine_tool_cost,

      -- Misc cost from daily work and miscellaneous expenses
      COALESCE((
        SELECT SUM(dwu.misc_amount)
        FROM daily_work_updates dwu
        WHERE dwu.project_id = p.id AND (s.id IS NULL OR dwu.site_id = s.id) AND dwu.misc_amount > 0
      ), 0) + COALESCE((
        SELECT SUM(e.amount) FROM expenses e
        WHERE e.project_id = p.id AND (s.id IS NULL OR e.site_id = s.id)
          AND e.category NOT IN (
            'Material Consumption', 'Labour Expense', 'Advance Wages', 'Labour Room Rent',
            'Labour Conveyance', 'Machine / Tool', 'Equipment Rental', 'Tools', 'Machinery', 'Tools & Equipment'
          )
          AND e.status NOT IN ('rejected', 'cancelled')
          AND (e.reference IS NULL OR e.reference NOT LIKE 'DWU-MISC-%')
      ), 0) AS misc_cost

    FROM projects p
    LEFT JOIN sites s ON s.project_id = p.id
    ${whereSql}
    ORDER BY p.name ASC, s.name ASC
  `;

  const [rows] = await pool.query(query, params);

  return rows.map((r) => {
    const materialCost = Number(num(r.material_cost).toFixed(2));
    const labourCost = Number(num(r.labour_cost).toFixed(2));
    const machineToolCost = Number(num(r.machine_tool_cost).toFixed(2));
    const miscCost = Number(num(r.misc_cost).toFixed(2));
    const totalActualCost = Number((materialCost + labourCost + machineToolCost + miscCost).toFixed(2));
    const budget = Number(num(r.planned_budget).toFixed(2));
    const remainingBudget = Number(Math.max(0, budget - totalActualCost).toFixed(2));
    const utilization = budget > 0 ? Number(((totalActualCost / budget) * 100).toFixed(1)) : 0;

    return {
      projectId: r.project_id,
      projectName: r.project_name,
      projectCode: r.project_code,
      siteId: r.site_id,
      siteName: r.site_name || 'All Sites / General',
      materialCost,
      labourCost,
      machineToolCost,
      miscCost,
      totalActualCost,
      budget,
      remainingBudget,
      utilization,
    };
  });
}

// =========================================================================
// TAB 2: ACTUAL EXPENSES
// Date, Project, Site, Task, Category, Material, Quantity, Cost/Unit, Labour, Machines, Misc, Amount, Updated By, Source Transaction
// =========================================================================
async function getActualExpenses({ projectId, siteId, taskId, category, dateFrom, dateTo, search, page = 1, pageSize = 25 } = {}) {
  // We union real records from:
  // 1. Material consumption (daily_work_updates)
  // 2. Worker labour logs (task_worker_logs)
  // 3. Machine / tool usage (daily_work_updates)
  // 4. Daily work misc (daily_work_updates)
  // 5. Approved direct expenses (expenses)
  const offset = (page - 1) * pageSize;

  const unionSql = `
    SELECT
      'material' AS category_type,
      'Material' AS category,
      dwu.work_date AS expense_date,
      dwu.project_id, p.name AS project_name, p.code AS project_code,
      dwu.site_id, s.name AS site_name,
      dwu.task_id, pt.name AS task_name,
      m.name AS item_material,
      dwu.quantity_used AS quantity,
      dwu.unit,
      CASE WHEN dwu.quantity_used > 0 THEN ROUND(COALESCE(dwu.material_cost, mex.amount, dwu.quantity_used * ${FALLBACK_RATE_SQL}) / dwu.quantity_used, 4) END AS cost_per_unit,
      NULL AS item_labour,
      NULL AS item_machine,
      NULL AS item_misc,
      ROUND(COALESCE(dwu.material_cost, mex.amount, dwu.quantity_used * ${FALLBACK_RATE_SQL}), 2) AS amount,
      u.full_name AS updated_by_name,
      CONCAT('DWU-MAT-', dwu.id) AS source_transaction,
      dwu.id AS source_id
    FROM daily_work_updates dwu
    JOIN projects p ON p.id = dwu.project_id
    LEFT JOIN sites s ON s.id = dwu.site_id
    LEFT JOIN project_tasks pt ON pt.id = dwu.task_id
    JOIN materials m ON m.id = dwu.material_id
    LEFT JOIN expenses mex ON mex.id = dwu.expense_id
    LEFT JOIN users u ON u.id = dwu.created_by
    WHERE dwu.quantity_used > 0 AND (mex.id IS NULL OR mex.status NOT IN ('rejected', 'cancelled'))

    UNION ALL

    SELECT
      'labour' AS category_type,
      'Labour' AS category,
      twl.work_date AS expense_date,
      twl.project_id, p.name AS project_name, p.code AS project_code,
      twl.site_id, s.name AS site_name,
      twl.task_id, pt.name AS task_name,
      NULL AS item_material,
      (twl.hours_worked / 8.0) AS quantity,
      'day(s)' AS unit,
      twl.daily_wage AS cost_per_unit,
      CONCAT(twl.worker_name, ' (', twl.labour_type, ')') AS item_labour,
      NULL AS item_machine,
      NULL AS item_misc,
      ROUND((twl.hours_worked / 8.0) * twl.daily_wage, 2) AS amount,
      u.full_name AS updated_by_name,
      CONCAT('TWL-', twl.id) AS source_transaction,
      twl.id AS source_id
    FROM task_worker_logs twl
    JOIN projects p ON p.id = twl.project_id
    LEFT JOIN sites s ON s.id = twl.site_id
    LEFT JOIN project_tasks pt ON pt.id = twl.task_id
    LEFT JOIN users u ON u.id = twl.created_by
    WHERE COALESCE(twl.worker_type, 'daily_wage') NOT IN ('company_labour', 'company_employee')
      AND LOWER(COALESCE(twl.labour_type, '')) NOT LIKE '%company%'

    UNION ALL

    SELECT
      'machines_tools' AS category_type,
      'Machines/Tools' AS category,
      dwu.work_date AS expense_date,
      dwu.project_id, p.name AS project_name, p.code AS project_code,
      dwu.site_id, s.name AS site_name,
      dwu.task_id, pt.name AS task_name,
      NULL AS item_material,
      1 AS quantity,
      'unit' AS unit,
      dwu.tool_cost AS cost_per_unit,
      NULL AS item_labour,
      dwu.tool_name AS item_machine,
      NULL AS item_misc,
      dwu.tool_cost AS amount,
      u.full_name AS updated_by_name,
      CONCAT('DWU-TOOL-', dwu.id) AS source_transaction,
      dwu.id AS source_id
    FROM daily_work_updates dwu
    JOIN projects p ON p.id = dwu.project_id
    LEFT JOIN sites s ON s.id = dwu.site_id
    LEFT JOIN project_tasks pt ON pt.id = dwu.task_id
    LEFT JOIN users u ON u.id = dwu.created_by
    WHERE dwu.tool_cost > 0

    UNION ALL

    SELECT
      'miscellaneous' AS category_type,
      'Miscellaneous' AS category,
      dwu.work_date AS expense_date,
      dwu.project_id, p.name AS project_name, p.code AS project_code,
      dwu.site_id, s.name AS site_name,
      dwu.task_id, pt.name AS task_name,
      NULL AS item_material,
      1 AS quantity,
      'entry' AS unit,
      dwu.misc_amount AS cost_per_unit,
      NULL AS item_labour,
      NULL AS item_machine,
      dwu.misc_description AS item_misc,
      dwu.misc_amount AS amount,
      u.full_name AS updated_by_name,
      CONCAT('DWU-MISC-', dwu.id) AS source_transaction,
      dwu.id AS source_id
    FROM daily_work_updates dwu
    JOIN projects p ON p.id = dwu.project_id
    LEFT JOIN sites s ON s.id = dwu.site_id
    LEFT JOIN project_tasks pt ON pt.id = dwu.task_id
    LEFT JOIN users u ON u.id = dwu.created_by
    WHERE dwu.misc_amount > 0

    UNION ALL

    SELECT
      CASE
        WHEN e.category = 'Material Consumption' THEN 'material'
        WHEN e.category IN ('Labour Expense', 'Advance Wages', 'Labour Room Rent', 'Labour Conveyance') THEN 'labour'
        WHEN e.category IN ('Machine / Tool', 'Equipment Rental', 'Tools', 'Machinery', 'Tools & Equipment') THEN 'machines_tools'
        ELSE 'miscellaneous'
      END AS category_type,
      CASE
        WHEN e.category = 'Material Consumption' THEN 'Material'
        WHEN e.category IN ('Labour Expense', 'Advance Wages', 'Labour Room Rent', 'Labour Conveyance') THEN 'Labour'
        WHEN e.category IN ('Machine / Tool', 'Equipment Rental', 'Tools', 'Machinery', 'Tools & Equipment') THEN 'Machines/Tools'
        WHEN e.category = 'Material Transport' THEN 'Miscellaneous (Transport)'
        ELSE 'Miscellaneous'
      END AS category,
      e.expense_date,
      e.project_id, p.name AS project_name, p.code AS project_code,
      e.site_id, s.name AS site_name,
      e.task_id, pt.name AS task_name,
      NULL AS item_material,
      1 AS quantity,
      'expense' AS unit,
      e.amount AS cost_per_unit,
      NULL AS item_labour,
      NULL AS item_machine,
      e.description AS item_misc,
      e.amount,
      u.full_name AS updated_by_name,
      e.expense_number AS source_transaction,
      e.id AS source_id
    FROM expenses e
    JOIN projects p ON p.id = e.project_id
    LEFT JOIN sites s ON s.id = e.site_id
    LEFT JOIN project_tasks pt ON pt.id = e.task_id
    LEFT JOIN users u ON u.id = e.created_by
    WHERE e.status NOT IN ('rejected', 'cancelled')
      AND (e.reference IS NULL OR (e.reference NOT LIKE 'DWU-TOOL-%' AND e.reference NOT LIKE 'DWU-MISC-%'))
      AND NOT (e.category = 'Material Consumption' AND EXISTS (SELECT 1 FROM daily_work_updates dx WHERE dx.expense_id = e.id))
  `;

  const filters = [];
  const params = [];
  if (projectId) {
    filters.push('t.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId) {
    filters.push('t.site_id = ?');
    params.push(Number(siteId));
  }
  if (taskId) {
    filters.push('t.task_id = ?');
    params.push(Number(taskId));
  }
  if (category && category !== 'all') {
    filters.push('t.category_type = ?');
    params.push(category.toLowerCase().replace(/[^a-z]/g, '_'));
  }
  if (dateFrom) {
    filters.push('t.expense_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    filters.push('t.expense_date <= ?');
    params.push(dateTo);
  }
  if (search) {
    filters.push('(t.project_name LIKE ? OR t.item_material LIKE ? OR t.item_labour LIKE ? OR t.item_machine LIKE ? OR t.item_misc LIKE ? OR t.source_transaction LIKE ?)');
    params.push(...Array(6).fill(`%${search}%`));
  }

  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(t.amount), 0) AS total_amount FROM (${unionSql}) t ${whereSql}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);
  const totalAmount = Number(num(countRows[0]?.total_amount).toFixed(2));

  const [rows] = await pool.query(
    `SELECT t.* FROM (${unionSql}) t ${whereSql} ORDER BY t.expense_date DESC, t.source_id DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  return {
    rows: rows.map((r) => ({
      date: r.expense_date,
      projectId: r.project_id,
      projectName: r.project_name,
      projectCode: r.project_code,
      siteId: r.site_id,
      siteName: r.site_name || 'General',
      taskId: r.task_id,
      taskName: r.task_name || '-',
      category: r.category,
      categoryType: r.category_type,
      material: r.item_material || '-',
      quantity: r.quantity ? Number(r.quantity) : null,
      unit: r.unit || '',
      costPerUnit: r.cost_per_unit ? Number(num(r.cost_per_unit).toFixed(2)) : null,
      labour: r.item_labour || '-',
      machinesTools: r.item_machine || '-',
      miscellaneous: r.item_misc || '-',
      amount: Number(num(r.amount).toFixed(2)),
      updatedBy: r.updated_by_name || 'System',
      sourceTransaction: r.source_transaction,
      sourceId: r.source_id,
    })),
    total,
    totalAmount,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

// =========================================================================
// TAB 3: BUDGET VS ACTUAL
// Project, Site, Task, Admin Budget, Material (Budget/Actual), Labour (Budget/Actual), Machine (Budget/Actual), Misc (Budget/Actual), Total (Budget/Actual), Remaining, Variance, Util %, Status, Excess Info
// =========================================================================
async function getBudgetVsActual({ projectId, siteId, taskId } = {}) {
  const where = ['p.is_archived = 0'];
  const params = [];
  if (projectId) {
    where.push('p.id = ?');
    params.push(Number(projectId));
  }
  if (siteId) {
    where.push('s.id = ?');
    params.push(Number(siteId));
  }
  if (taskId) {
    where.push('pt.id = ?');
    params.push(Number(taskId));
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const query = `
    SELECT
      pt.id AS task_id, pt.name AS task_name, pt.status AS task_status,
      pt.total_budget, pt.material_budget, pt.labour_budget, pt.tool_budget, pt.misc_budget,
      pt.approved_additional_budget, pt.pending_excess_budget, pt.excess_reason,
      p.id AS project_id, p.name AS project_name, p.code AS project_code,
      s.id AS site_id, s.name AS site_name,

      -- Actual Material: quantity consumed x the actual cost linked to the stock it came from
      ${materialActualSql('dwu.task_id = pt.id', 'e2.task_id = pt.id')} AS material_actual,

      -- Actual Labour
      COALESCE((
        SELECT SUM((twl.hours_worked / 8.0) * twl.daily_wage)
        FROM task_worker_logs twl
        WHERE twl.task_id = pt.id AND COALESCE(twl.worker_type, 'daily_wage') NOT IN ('company_labour', 'company_employee') AND LOWER(COALESCE(twl.labour_type, '')) NOT LIKE '%company%'
      ), 0) AS labour_actual,

      -- Actual Machine/Tool
      COALESCE((
        SELECT SUM(dwu.tool_cost)
        FROM daily_work_updates dwu
        WHERE dwu.task_id = pt.id AND dwu.tool_cost > 0
      ), 0) + COALESCE((
        SELECT SUM(e.amount) FROM expenses e
        WHERE e.task_id = pt.id AND e.category IN ('Machine / Tool', 'Equipment Rental', 'Tools', 'Machinery', 'Tools & Equipment')
          AND e.status NOT IN ('rejected', 'cancelled') AND (e.reference IS NULL OR e.reference NOT LIKE 'DWU-TOOL-%')
      ), 0) AS machine_actual,

      -- Actual Misc
      COALESCE((
        SELECT SUM(dwu.misc_amount)
        FROM daily_work_updates dwu
        WHERE dwu.task_id = pt.id AND dwu.misc_amount > 0
      ), 0) + COALESCE((
        SELECT SUM(e.amount) FROM expenses e
        WHERE e.task_id = pt.id AND e.category IN ('Miscellaneous', 'Misc', 'Operational Misc', 'Material Transport')
          AND e.status NOT IN ('rejected', 'cancelled') AND (e.reference IS NULL OR e.reference NOT LIKE 'DWU-MISC-%')
      ), 0) AS misc_actual

    FROM project_tasks pt
    JOIN projects p ON p.id = pt.project_id
    LEFT JOIN sites s ON s.id = pt.site_id
    ${whereSql}
    ORDER BY p.name ASC, s.name ASC, pt.id ASC
  `;

  const [rows] = await pool.query(query, params);

  return rows.map((r) => {
    const adminBudget = Number(num(r.total_budget).toFixed(2));
    const approvedAdditional = Number(num(r.approved_additional_budget).toFixed(2));
    const totalBudget = Number((adminBudget + approvedAdditional).toFixed(2));

    const materialBudget = Number(num(r.material_budget).toFixed(2));
    const materialActual = Number(num(r.material_actual).toFixed(2));

    const labourBudget = Number(num(r.labour_budget).toFixed(2));
    const labourActual = Number(num(r.labour_actual).toFixed(2));

    const machineBudget = Number(num(r.tool_budget).toFixed(2));
    const machineActual = Number(num(r.machine_actual).toFixed(2));

    const miscBudget = Number(num(r.misc_budget).toFixed(2));
    const miscActual = Number(num(r.misc_actual).toFixed(2));

    const totalActual = Number((materialActual + labourActual + machineActual + miscActual).toFixed(2));
    const remaining = Number((totalBudget - totalActual).toFixed(2));
    const variance = Number((totalBudget - totalActual).toFixed(2));
    const utilization = totalBudget > 0 ? Number(((totalActual / totalBudget) * 100).toFixed(1)) : 0;

    let status = 'Under Budget';
    if (totalActual > totalBudget) {
      status = 'Over Budget';
    } else if (utilization >= 95) {
      status = 'At Budget';
    }

    return {
      projectId: r.project_id,
      projectName: r.project_name,
      projectCode: r.project_code,
      siteId: r.site_id,
      siteName: r.site_name || 'General',
      taskId: r.task_id,
      taskName: r.task_name,
      taskStatus: r.task_status,
      adminBudget,
      approvedAdditional,
      excessReason: r.excess_reason,
      totalBudget,
      materialBudget,
      materialActual,
      materialRemaining: Number((materialBudget - materialActual).toFixed(2)),
      materialVariance: Number((materialBudget - materialActual).toFixed(2)),
      labourBudget,
      labourActual,
      machineBudget,
      machineActual,
      miscBudget,
      miscActual,
      labourVariance: Number((labourBudget - labourActual).toFixed(2)),
      machineVariance: Number((machineBudget - machineActual).toFixed(2)),
      miscVariance: Number((miscBudget - miscActual).toFixed(2)),
      totalActual,
      remaining,
      variance,
      utilization,
      status,
    };
  });
}

// =========================================================================
// TAB 4: PROCUREMENT FINANCE (DEBIT / CREDIT)
//
// One entry per REAL transaction, typed so each is understandable on its own
// and so no physical event is ever counted as an expense twice:
//
//   vendor_purchase        stock acquisition from a vendor (inventory in, payable up).
//                          NOT a project expense - recorded once, here.
//   vendor_payment         payment against a vendor payable (payable down, cash out).
//   internal_transfer      Central Warehouse -> Contractor, Contractor -> Contractor.
//                          Stock moves; there is NO company expense. Valued at the
//                          actual cost the stock was acquired at.
//   material_consumption   material actually used on a Project/Site/Task. THE project
//                          material expense - recorded once, here.
//   machine_purchase       a newly bought machine registered as a company asset.
//   machine_allocation     an owned/rented machine handed to a contractor: no value
//                          moves, no purchase expense.
//   machine_usage_charge   approved charge for using a company-owned machine, for the
//                          ACTUAL days used. Separate from the original purchase cost.
//   machine_rental         actual rental cost allocated to the Task by days used.
//   machine_rental_idle    rental days nobody used: company cost, not a project cost.
//   transport              transport / freight of a received shipment, charged to the
//                          project/site/task it was for (expense EXP-TR-<movement>).
//
// `affectsExpense` marks the only entries that raise project cost; everything else
// is inventory, payable or informational. `GET /finance/ledger-entry` opens any
// entry down to its source transaction.
// =========================================================================
const LEDGER_TYPES = [
  'vendor_purchase', 'vendor_payment', 'internal_transfer', 'material_consumption',
  'machine_purchase', 'machine_allocation', 'machine_usage_charge', 'machine_rental', 'machine_rental_idle',
  'transport',
];

const LEDGER_LABELS = {
  vendor_purchase: 'Vendor Purchase',
  vendor_payment: 'Vendor Payment',
  internal_transfer: 'Internal Transfer',
  material_consumption: 'Material Consumption',
  machine_purchase: 'Machine Purchase (Asset)',
  machine_allocation: 'Machine Allocation',
  machine_usage_charge: 'Machine Usage Charge',
  machine_rental: 'Machine Rental',
  machine_rental_idle: 'Machine Rental - Idle Days',
  transport: 'Transport Cost',
};


function ledgerUnionSql() {
  return `
    SELECT 'vendor_purchase' AS entry_type, CONCAT('vendor_purchase:', pr.id) AS entry_key, pr.id AS source_id,
           'procurement_request' AS source_type,
           COALESCE(pr.fulfilled_at, pr.purchase_date, pr.created_at) AS tx_date,
           pr.request_number AS reference_number,
           pr.project_id, p.name AS project_name, pr.site_id, s.name AS site_name, pr.task_id, pt.name AS task_name,
           m.name AS item_name, COALESCE(pr.ordered_quantity, pr.quantity) AS quantity, COALESCE(pr.unit, m.unit) AS unit,
           COALESCE(pr.purchase_rate, pr.estimated_rate, 0) AS cost_per_unit,
           COALESCE(pr.total_amount, ROUND(COALESCE(pr.ordered_quantity, pr.quantity) * COALESCE(pr.purchase_rate, pr.estimated_rate, 0), 2)) AS value_amount,
           COALESCE(v.name, pr.supplier, 'Outside vendor') AS from_name,
           COALESCE(dw.name, 'Warehouse') AS to_name,
           CONCAT('Inventory - ', COALESCE(dw.name, 'Warehouse')) AS debit_account,
           CONCAT('Vendor payable - ', COALESCE(v.name, pr.supplier, 'Outside vendor')) AS credit_account,
           0 AS affects_expense, 1 AS affects_inventory,
           COALESCE(v.name, pr.supplier) AS vendor_name, rc.name AS contractor_name,
           pr.status AS status, ru.full_name AS user_name, NULL AS machine_serial
    FROM procurement_requests pr
    LEFT JOIN materials m ON m.id = pr.material_id
    LEFT JOIN vendors v ON v.id = pr.vendor_id
    LEFT JOIN warehouses dw ON dw.id = pr.destination_warehouse_id
    LEFT JOIN projects p ON p.id = pr.project_id
    LEFT JOIN sites s ON s.id = pr.site_id
    LEFT JOIN project_tasks pt ON pt.id = pr.task_id
    LEFT JOIN contractors rc ON rc.id = pr.contractor_id
    LEFT JOIN users ru ON ru.id = pr.requested_by
    WHERE pr.source_type = 'supplier' AND pr.item_type = 'material'
      AND pr.status IN ('received', 'partially_received')

    UNION ALL

    SELECT 'vendor_payment', CONCAT('vendor_payment:', vp.id), vp.id, 'vendor_payment',
           vp.payment_date, CONVERT(COALESCE(vp.payment_reference, CONCAT('VPAY-', vp.id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci,
           pr.project_id, p.name, pr.site_id, s.name, pr.task_id, pt.name,
           COALESCE(m.name, t.name, 'Payment'), NULL, NULL, NULL, vp.amount,
           'Company bank / cash', COALESCE(v.name, 'Vendor'),
           CONCAT('Vendor payable - ', COALESCE(v.name, 'Vendor')), 'Cash / Bank',
           0, 0, v.name, NULL, 'paid', u.full_name, NULL
    FROM vendor_payments vp
    LEFT JOIN procurement_requests pr ON pr.id = vp.procurement_request_id
    LEFT JOIN materials m ON m.id = pr.material_id
    LEFT JOIN tools t ON t.id = pr.tool_id
    LEFT JOIN vendors v ON v.id = vp.vendor_id
    LEFT JOIN projects p ON p.id = pr.project_id
    LEFT JOIN sites s ON s.id = pr.site_id
    LEFT JOIN project_tasks pt ON pt.id = pr.task_id
    LEFT JOIN users u ON u.id = vp.created_by

    UNION ALL

    SELECT 'internal_transfer', CONCAT('internal_transfer:', mm.id), mm.id, 'material_movement',
           COALESCE(mm.received_at, mm.sent_at), mm.movement_number,
           mm.project_id, p.name, mm.site_id, s.name, pr.task_id, pt.name,
           COALESCE(m.name, t.name, 'Item'),
           COALESCE(mm.received_quantity, mm.sent_quantity), mm.unit, mm.cost_per_unit,
           ROUND(COALESCE(mm.received_quantity, mm.sent_quantity) * COALESCE(mm.cost_per_unit, 0), 2),
           COALESCE(sc.name, sw.name), COALESCE(dc.name, dw.name),
           CONCAT('Stock - ', COALESCE(dc.name, dw.name, 'destination'), IF(mm.status = 'in_transit', ' (in transit)', '')),
           CONCAT('Stock - ', COALESCE(sc.name, sw.name, 'source')),
           0, 0, NULL, COALESCE(dc.name, sc.name), mm.status, COALESCE(ru.full_name, su.full_name), NULL
    FROM material_movements mm
    LEFT JOIN materials m ON m.id = mm.material_id
    LEFT JOIN tools t ON t.id = mm.tool_id
    LEFT JOIN warehouses sw ON sw.id = mm.source_warehouse_id
    LEFT JOIN warehouses dw ON dw.id = mm.destination_warehouse_id
    LEFT JOIN contractors sc ON sc.id = mm.source_contractor_id
    LEFT JOIN contractors dc ON dc.id = mm.destination_contractor_id
    LEFT JOIN projects p ON p.id = mm.project_id
    LEFT JOIN sites s ON s.id = mm.site_id
    LEFT JOIN procurement_requests pr ON pr.id = mm.procurement_request_id
    LEFT JOIN project_tasks pt ON pt.id = pr.task_id
    LEFT JOIN users su ON su.id = mm.sent_by
    LEFT JOIN users ru ON ru.id = mm.received_by
    WHERE mm.status <> 'cancelled'

    UNION ALL

    SELECT 'material_consumption', CONCAT('material_consumption:', dwu.id), dwu.id, 'daily_work_update',
           dwu.work_date, CONCAT('DWU-MAT-', dwu.id),
           dwu.project_id, p.name, dwu.site_id, s.name, dwu.task_id, pt.name,
           m.name, dwu.quantity_used, COALESCE(dwu.unit, m.unit),
           CASE WHEN dwu.quantity_used > 0 THEN ROUND(COALESCE(dwu.material_cost, e.amount, dwu.quantity_used * ${FALLBACK_RATE_SQL}) / dwu.quantity_used, 4) END,
           ROUND(COALESCE(dwu.material_cost, e.amount, dwu.quantity_used * ${FALLBACK_RATE_SQL}), 2),
           CONCAT(c.name, ' inventory'), CONCAT('Project cost - ', COALESCE(pt.name, s.name, p.name)),
           CONCAT('Project cost (Material) - ', COALESCE(pt.name, s.name, p.name)),
           CONCAT('Inventory - ', c.name),
           1, 0, NULL, c.name, 'consumed', u.full_name, NULL
    FROM daily_work_updates dwu
    JOIN materials m ON m.id = dwu.material_id
    JOIN projects p ON p.id = dwu.project_id
    LEFT JOIN sites s ON s.id = dwu.site_id
    LEFT JOIN project_tasks pt ON pt.id = dwu.task_id
    LEFT JOIN contractors c ON c.id = dwu.contractor_id
    LEFT JOIN expenses e ON e.id = dwu.expense_id
    LEFT JOIN users u ON u.id = dwu.created_by
    WHERE dwu.quantity_used > 0 AND (e.id IS NULL OR e.status NOT IN ('rejected', 'cancelled'))

    UNION ALL

    SELECT 'machine_purchase', CONCAT('machine_purchase:', tu.id), tu.id, 'tool_unit',
           COALESCE(tu.purchase_date, tu.created_at), tu.serial_number,
           NULL, NULL, NULL, NULL, NULL, NULL,
           t.name, 1, 'unit', tu.purchase_cost, tu.purchase_cost,
           COALESCE(v.name, 'Vendor'), 'Company machine pool',
           CONCAT('Machine asset - ', tu.serial_number),
           CONCAT('Vendor payable - ', COALESCE(v.name, 'Vendor')),
           0, 1, v.name, NULL, tu.availability_status, cu.full_name, tu.serial_number
    FROM tool_units tu
    JOIN tools t ON t.id = tu.tool_id
    LEFT JOIN vendors v ON v.id = tu.vendor_id
    LEFT JOIN users cu ON cu.id = tu.created_by
    WHERE tu.ownership_type = 'owned' AND tu.purchase_cost > 0

    UNION ALL

    SELECT 'machine_allocation', CONCAT('machine_allocation:', a.id), a.id, 'tool_allocation',
           a.start_date, tu.serial_number,
           a.project_id, p.name, a.site_id, s.name, a.task_id, pt.name,
           t.name, 1, 'unit', NULL, 0,
           'Company machine pool', COALESCE(c.name, 'Contractor'),
           CONCAT('Machine in use - ', COALESCE(c.name, 'Contractor')),
           CONCAT('Machine pool - ', tu.serial_number),
           0, 0, NULL, c.name, a.status, COALESCE(au.full_name, ru.full_name), tu.serial_number
    FROM tool_allocations a
    JOIN tool_units tu ON tu.id = a.unit_id
    JOIN tools t ON t.id = a.tool_id
    LEFT JOIN projects p ON p.id = a.project_id
    LEFT JOIN sites s ON s.id = a.site_id
    LEFT JOIN project_tasks pt ON pt.id = a.task_id
    LEFT JOIN contractors c ON c.id = a.contractor_id
    LEFT JOIN users au ON au.id = a.approved_by
    LEFT JOIN users ru ON ru.id = a.requested_by

    UNION ALL

    SELECT 'machine_usage_charge', CONCAT('machine_usage_charge:', a.id), a.id, 'tool_allocation',
           a.returned_date, CONCAT(tu.serial_number, ' / ', a.usage_days, ' day(s)'),
           a.project_id, p.name, a.site_id, s.name, a.task_id, pt.name,
           t.name, a.usage_days, 'day(s)', a.daily_charge_rate, a.usage_charge,
           'Company machine pool', COALESCE(c.name, 'Contractor'),
           CONCAT('Project cost (Machine) - ', COALESCE(pt.name, s.name, p.name)),
           'Machine usage recovery - company',
           IF(a.source_kind = 'rented', 0, 1), 0, NULL, c.name, a.status, au.full_name, tu.serial_number
    FROM tool_allocations a
    JOIN tool_units tu ON tu.id = a.unit_id
    JOIN tools t ON t.id = a.tool_id
    LEFT JOIN projects p ON p.id = a.project_id
    LEFT JOIN sites s ON s.id = a.site_id
    LEFT JOIN project_tasks pt ON pt.id = a.task_id
    LEFT JOIN contractors c ON c.id = a.contractor_id
    LEFT JOIN users au ON au.id = COALESCE(a.returned_by, a.approved_by)
    WHERE a.status = 'returned' AND a.usage_charge > 0

    UNION ALL

    SELECT 'machine_rental', CONCAT('machine_rental:', a.id), a.id, 'tool_allocation',
           a.returned_date, CONCAT(tu.serial_number, ' / ', a.usage_days, ' day(s)'),
           a.project_id, p.name, a.site_id, s.name, a.task_id, pt.name,
           t.name, a.usage_days, 'day(s)', ROUND(a.rental_cost_allocated / NULLIF(a.usage_days, 0), 2), a.rental_cost_allocated,
           COALESCE(v.name, 'Rental vendor'), COALESCE(pt.name, s.name, p.name),
           CONCAT('Project cost (Machine rental) - ', COALESCE(pt.name, s.name, p.name)),
           CONCAT('Rental vendor payable - ', COALESCE(v.name, 'Vendor')),
           1, 0, v.name, c.name, a.status, au.full_name, tu.serial_number
    FROM tool_allocations a
    JOIN tool_units tu ON tu.id = a.unit_id
    JOIN tools t ON t.id = a.tool_id
    LEFT JOIN projects p ON p.id = a.project_id
    LEFT JOIN sites s ON s.id = a.site_id
    LEFT JOIN project_tasks pt ON pt.id = a.task_id
    LEFT JOIN contractors c ON c.id = a.contractor_id
    LEFT JOIN vendors v ON v.id = tu.vendor_id
    LEFT JOIN users au ON au.id = COALESCE(a.returned_by, a.approved_by)
    WHERE a.status = 'returned' AND a.rental_cost_allocated > 0

    UNION ALL

    SELECT 'machine_rental_idle', CONCAT('machine_rental_idle:', r.id), r.id, 'tool_rental',
           r.actual_return_date, tu.serial_number,
           r.project_id, p.name, r.site_id, s.name, r.task_id, pt.name,
           t.name, NULL, NULL, r.rate_per_day, ROUND(r.total_cost - r.allocated_cost, 2),
           COALESCE(v.name, 'Rental vendor'), 'Company overhead',
           'Company overhead - unused rental days', CONCAT('Rental vendor payable - ', COALESCE(v.name, 'Vendor')),
           0, 0, v.name, NULL, r.status, cu.full_name, tu.serial_number
    FROM tool_rentals r
    JOIN tool_units tu ON tu.id = r.unit_id
    JOIN tools t ON t.id = r.tool_id
    LEFT JOIN vendors v ON v.id = r.vendor_id
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN sites s ON s.id = r.site_id
    LEFT JOIN project_tasks pt ON pt.id = r.task_id
    LEFT JOIN users cu ON cu.id = r.created_by
    WHERE r.status = 'returned' AND r.total_cost - r.allocated_cost > 0.004

    UNION ALL

    SELECT 'transport', CONCAT('transport:', e.id), e.id, 'expense',
           e.expense_date, e.expense_number,
           e.project_id, p.name, e.site_id, s.name, e.task_id, pt.name,
           COALESCE(m.name, t.name, 'Transport'), NULL, NULL, NULL, e.amount,
           COALESCE(sc.name, sw.name, 'Sender'), COALESCE(dc.name, dw.name, 'Receiver'),
           CONCAT('Project cost (Transport) - ', COALESCE(pt.name, s.name, p.name, 'Company')),
           CONCAT('Transport payable - ', COALESCE(mm.vehicle_number, 'transporter')),
           IF(e.project_id IS NULL, 0, 1), 0, NULL, dc.name, e.status, u.full_name, NULL
    FROM expenses e
    JOIN material_movements mm ON mm.id = e.source_id
    LEFT JOIN materials m ON m.id = mm.material_id
    LEFT JOIN tools t ON t.id = mm.tool_id
    LEFT JOIN warehouses sw ON sw.id = mm.source_warehouse_id
    LEFT JOIN warehouses dw ON dw.id = mm.destination_warehouse_id
    LEFT JOIN contractors sc ON sc.id = mm.source_contractor_id
    LEFT JOIN contractors dc ON dc.id = mm.destination_contractor_id
    LEFT JOIN projects p ON p.id = e.project_id
    LEFT JOIN sites s ON s.id = e.site_id
    LEFT JOIN project_tasks pt ON pt.id = e.task_id
    LEFT JOIN users u ON u.id = COALESCE(mm.received_by, e.created_by)
    WHERE e.source_type = 'material_transport' AND e.status NOT IN ('rejected', 'cancelled')
  `;
}

async function getProcurementLedger({ projectId, siteId, taskId, type, search, page = 1, pageSize = 25 } = {}) {
  const offset = (page - 1) * pageSize;
  const filters = [];
  const params = [];
  if (projectId) { filters.push('t.project_id = ?'); params.push(Number(projectId)); }
  if (siteId) { filters.push('t.site_id = ?'); params.push(Number(siteId)); }
  if (taskId) { filters.push('t.task_id = ?'); params.push(Number(taskId)); }
  if (type && type !== 'all' && LEDGER_TYPES.includes(type)) { filters.push('t.entry_type = ?'); params.push(type); }
  if (search) {
    filters.push('(t.reference_number LIKE ? OR t.item_name LIKE ? OR t.from_name LIKE ? OR t.to_name LIKE ? OR t.machine_serial LIKE ? OR t.project_name LIKE ?)');
    params.push(...Array(6).fill(`%${search}%`));
  }
  const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const union = ledgerUnionSql();

  const [rows] = await pool.query(
    `SELECT t.* FROM (${union}) t ${whereSql} ORDER BY t.tx_date DESC, t.entry_key DESC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );
  const [[count]] = await pool.query(`SELECT COUNT(*) AS total FROM (${union}) t ${whereSql}`, params);
  const [sumRows] = await pool.query(
    `SELECT t.entry_type, COALESCE(SUM(t.value_amount), 0) AS amount, COALESCE(SUM(CASE WHEN t.affects_expense = 1 THEN t.value_amount ELSE 0 END), 0) AS expense_amount
     FROM (${union}) t ${whereSql} GROUP BY t.entry_type`,
    params
  );
  const byType = {};
  let expenseTotal = 0;
  for (const r of sumRows) {
    byType[r.entry_type] = Number(num(r.amount).toFixed(2));
    expenseTotal += Number(r.expense_amount);
  }
  const total = Number(count.total || 0);

  return {
    rows: rows.map((r) => {
      const value = Number(num(r.value_amount).toFixed(2));
      const qty = r.quantity != null ? Number(r.quantity) : null;
      const label = LEDGER_LABELS[r.entry_type];
      return {
        id: r.source_id,
        entryKey: r.entry_key,
        sourceType: r.source_type,
        sourceId: r.source_id,
        transactionType: r.entry_type,
        transactionLabel: label,
        date: r.tx_date,
        referenceNumber: r.reference_number,
        projectId: r.project_id,
        projectName: r.project_name || '-',
        siteId: r.site_id,
        siteName: r.site_name || '-',
        taskId: r.task_id,
        taskName: r.task_name || '-',
        material: r.item_name || '-',
        machineSerial: r.machine_serial || null,
        quantity: qty,
        unit: r.unit || '',
        costPerUnit: r.cost_per_unit != null ? Number(num(r.cost_per_unit).toFixed(2)) : null,
        totalAmount: value,
        value,
        source: r.from_name || '-',
        destination: r.to_name || '-',
        vendor: r.vendor_name || '-',
        contractor: r.contractor_name || '-',
        status: r.status,
        user: r.user_name || '-',
        affectsExpense: Boolean(r.affects_expense),
        affectsInventory: Boolean(r.affects_inventory),
        // Legacy shape kept for existing consumers; the accounts are now explicit.
        debit: { description: r.debit_account, quantity: qty, amount: value },
        credit: { description: r.credit_account, quantity: qty, amount: value },
        debitAccount: r.debit_account,
        creditAccount: r.credit_account,
      };
    }),
    summary: {
      byType,
      projectExpenseTotal: Number(expenseTotal.toFixed(2)),
      note: 'Only Material Consumption, Machine Usage Charge (owned), Machine Rental and Transport Cost raise project cost. Vendor purchases, transfers and allocations move inventory or payables and are never counted as a second expense.',
    },
    types: LEDGER_TYPES.map((t) => ({ value: t, label: LEDGER_LABELS[t] })),
    total,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

/**
 * Click-through for one ledger entry: the entry itself plus the source
 * transaction(s) behind it (request, movement, warehouse rows, expense, serial).
 */
async function getLedgerEntryDetail({ type, id }) {
  const key = `${type}:${Number(id)}`;
  if (!LEDGER_TYPES.includes(type) || !Number(id)) throw ApiError.badRequest('Unknown ledger entry.');
  const [rows] = await pool.query(`SELECT t.* FROM (${ledgerUnionSql()}) t WHERE t.entry_key = ? LIMIT 1`, [key]);
  if (!rows.length) throw ApiError.notFound('That ledger entry does not exist.');
  const r = rows[0];
  const entry = {
    transactionType: r.entry_type,
    transactionLabel: LEDGER_LABELS[r.entry_type],
    referenceNumber: r.reference_number,
    date: r.tx_date,
    project: r.project_name, site: r.site_name, task: r.task_name,
    item: r.item_name, machineSerial: r.machine_serial,
    quantity: r.quantity != null ? Number(r.quantity) : null, unit: r.unit,
    costPerUnit: r.cost_per_unit != null ? Number(r.cost_per_unit) : null,
    value: Number(num(r.value_amount).toFixed(2)),
    source: r.from_name, destination: r.to_name, vendor: r.vendor_name, contractor: r.contractor_name,
    status: r.status, user: r.user_name,
    debitAccount: r.debit_account, creditAccount: r.credit_account,
    affectsExpense: Boolean(r.affects_expense), affectsInventory: Boolean(r.affects_inventory),
  };

  const related = {};
  const sid = Number(id);
  if (type === 'vendor_purchase') {
    const [[req]] = await pool.query(
      `SELECT pr.id, pr.request_number, pr.po_number, pr.vehicle_number, pr.driver_name, pr.driver_phone, pr.invoice_number,
              pr.bill_reference, pr.warehouse_transaction_id, pr.amount_paid, pr.payment_status, pr.received_vehicle_number,
              wt.transaction_number AS warehouse_transaction_number
       FROM procurement_requests pr LEFT JOIN warehouse_transactions wt ON wt.id = pr.warehouse_transaction_id WHERE pr.id = ?`, [sid]);
    related.procurementRequest = req || null;
  } else if (type === 'vendor_payment') {
    const [[pay]] = await pool.query('SELECT * FROM vendor_payments WHERE id = ?', [sid]);
    related.payment = pay || null;
  } else if (type === 'internal_transfer') {
    const [[mv]] = await pool.query(
      `SELECT mm.*, pr.request_number, it.transaction_number AS issue_tx, rt.transaction_number AS receive_tx
       FROM material_movements mm
       LEFT JOIN procurement_requests pr ON pr.id = mm.procurement_request_id
       LEFT JOIN warehouse_transactions it ON it.id = mm.issue_transaction_id
       LEFT JOIN warehouse_transactions rt ON rt.id = mm.receive_transaction_id WHERE mm.id = ?`, [sid]);
    related.movement = mv || null;
  } else if (type === 'material_consumption') {
    const [[dw]] = await pool.query(
      `SELECT dwu.id, dwu.work_date, dwu.quantity_used, dwu.unit_cost, dwu.material_cost, dwu.remarks, wt.transaction_number, e.expense_number
       FROM daily_work_updates dwu
       LEFT JOIN warehouse_transactions wt ON wt.id = dwu.warehouse_transaction_id
       LEFT JOIN expenses e ON e.id = dwu.expense_id WHERE dwu.id = ?`, [sid]);
    related.dailyWork = dw || null;
  } else if (type === 'machine_purchase') {
    const [[u]] = await pool.query('SELECT * FROM tool_units WHERE id = ?', [sid]);
    related.unit = u || null;
  } else if (['machine_allocation', 'machine_usage_charge', 'machine_rental'].includes(type)) {
    const [[a]] = await pool.query(
      `SELECT a.*, e.expense_number FROM tool_allocations a LEFT JOIN expenses e ON e.id = a.expense_id WHERE a.id = ?`, [sid]);
    related.allocation = a || null;
  } else if (type === 'machine_rental_idle') {
    const [[rt]] = await pool.query('SELECT * FROM tool_rentals WHERE id = ?', [sid]);
    related.rental = rt || null;
  } else if (type === 'transport') {
    const [[ex]] = await pool.query(
      `SELECT e.expense_number, e.amount, e.notes, mm.movement_number, mm.vehicle_number, mm.driver_name, mm.transport_cost,
              mm.other_expenses, mm.sent_at, mm.received_at, pr.request_number
       FROM expenses e
       JOIN material_movements mm ON mm.id = e.source_id
       LEFT JOIN procurement_requests pr ON pr.id = mm.procurement_request_id
       WHERE e.id = ?`, [sid]);
    related.transport = ex || null;
  }
  return { entry, related };
}

// =========================================================================
// TAB 5: VENDOR PAYABLES
// Vendor, Purchase Date, Invoice/Bill, Project/Site, Material, Quantity, Cost/Unit, Total, Paid, Due, Status, History
// =========================================================================
async function getVendorPayables({ vendorId, search, status, page = 1, pageSize = 25 } = {}) {
  // A payable exists once a purchase is approved. (The previous condition mixed AND/OR without
  // parentheses, which let cancelled vendor requests through.) Owned-machine allocations are not purchases.
  const where = [
    "pr.status IN ('approved', 'ordered', 'partially_received', 'received')",
    "(pr.source_type = 'supplier' OR pr.vendor_id IS NOT NULL)",
    "COALESCE(pr.tool_procurement_type, '') <> 'purchased_owned'",
  ];
  const params = [];

  if (vendorId) {
    where.push('pr.vendor_id = ?');
    params.push(Number(vendorId));
  }
  if (status && status !== 'all') {
    where.push('pr.payment_status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(v.name LIKE ? OR pr.invoice_number LIKE ? OR pr.bill_reference LIKE ? OR pr.request_number LIKE ? OR m.name LIKE ?)');
    params.push(...Array(5).fill(`%${search}%`));
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const offset = (page - 1) * pageSize;

  const query = `
    SELECT
      pr.id,
      pr.vendor_id,
      COALESCE(v.name, pr.supplier, 'External Vendor') AS vendor_name,
      v.contact_person AS vendor_contact,
      v.phone AS vendor_phone,
      COALESCE(pr.purchase_date, pr.order_date, pr.created_at) AS purchase_date,
      COALESCE(pr.invoice_number, pr.bill_reference, pr.request_number) AS invoice_bill_number,
      p.id AS project_id, p.name AS project_name,
      s.id AS site_id, s.name AS site_name,
      COALESCE(m.name, t.name, 'Procured Item') AS material_name,
      pr.quantity,
      COALESCE(pr.unit, m.unit, 'units') AS unit,
      COALESCE(pr.purchase_rate, pr.estimated_rate, m.default_rate, 0) AS cost_per_unit,
      COALESCE(pr.total_amount, ROUND(pr.quantity * COALESCE(pr.purchase_rate, pr.estimated_rate, 0), 2)) AS total_amount,
      COALESCE((SELECT SUM(amount) FROM vendor_payments vp WHERE vp.procurement_request_id = pr.id), pr.amount_paid, 0) AS amount_paid,
      pr.payment_status,
      pr.remarks
    FROM procurement_requests pr
    LEFT JOIN vendors v ON v.id = pr.vendor_id
    LEFT JOIN projects p ON p.id = pr.project_id
    LEFT JOIN sites s ON s.id = pr.site_id
    LEFT JOIN materials m ON m.id = pr.material_id
    LEFT JOIN tools t ON t.id = pr.tool_id
    ${whereSql}
    ORDER BY pr.id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(query, [...params, Number(pageSize), Number(offset)]);

  const summaryQuery = `
    SELECT
      COUNT(*) AS total_count,
      SUM(COALESCE(pr.total_amount, ROUND(pr.quantity * COALESCE(pr.purchase_rate, pr.estimated_rate, 0), 2))) AS total_purchase,
      SUM(COALESCE((SELECT SUM(amount) FROM vendor_payments vp WHERE vp.procurement_request_id = pr.id), pr.amount_paid, 0)) AS total_paid
    FROM procurement_requests pr
    LEFT JOIN vendors v ON v.id = pr.vendor_id
    LEFT JOIN materials m ON m.id = pr.material_id
    ${whereSql}
  `;
  const [summaryRows] = await pool.query(summaryQuery, params);
  const totalPurchase = Number(num(summaryRows[0]?.total_purchase).toFixed(2));
  const totalPaid = Number(num(summaryRows[0]?.total_paid).toFixed(2));
  const totalDue = Number(Math.max(0, totalPurchase - totalPaid).toFixed(2));
  const total = Number(summaryRows[0]?.total_count || 0);

  return {
    rows: rows.map((r) => {
      const costPerUnit = Number(num(r.cost_per_unit).toFixed(2));
      const totalAmount = Number(num(r.total_amount).toFixed(2));
      const paid = Number(num(r.amount_paid).toFixed(2));
      const due = Number(Math.max(0, totalAmount - paid).toFixed(2));

      let payStatus = r.payment_status || 'pending';
      if (paid >= totalAmount && totalAmount > 0) payStatus = 'paid';
      else if (paid > 0) payStatus = 'partially_paid';

      return {
        id: r.id,
        vendorId: r.vendor_id,
        vendorName: r.vendor_name,
        contactPerson: r.vendor_contact || '-',
        phone: r.vendor_phone || '-',
        purchaseDate: r.purchase_date,
        invoiceBillNumber: r.invoice_bill_number,
        projectId: r.project_id,
        projectName: r.project_name || '-',
        siteId: r.site_id,
        siteName: r.site_name || '-',
        material: r.material_name,
        quantity: Number(num(r.quantity)),
        unit: r.unit,
        costPerUnit,
        totalAmount,
        amountPaid: paid,
        amountDue: due,
        paymentStatus: payStatus,
        remarks: r.remarks || '-',
      };
    }),
    summary: {
      totalVendorPurchase: totalPurchase,
      totalPaid,
      totalDue,
    },
    total,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

/**
 * Record a payment to a vendor for a procurement request
 */
async function recordVendorPayment({ procurementRequestId, vendorId, amount, paymentDate, paymentReference, paymentMethod = 'bank_transfer', remarks }, userId) {
  const payAmount = Number(amount);
  if (!(payAmount > 0)) throw ApiError.badRequest('Enter a payment amount greater than zero.');

  const [prRows] = await pool.query('SELECT * FROM procurement_requests WHERE id = ? LIMIT 1', [procurementRequestId]);
  if (!prRows.length) throw ApiError.notFound('Procurement request not found.');
  const pr = prRows[0];

  const actualVendorId = vendorId ? Number(vendorId) : (pr.vendor_id || null);

  await pool.query(
    `INSERT INTO vendor_payments
      (vendor_id, procurement_request_id, project_id, site_id, payment_date, amount, payment_reference, payment_method, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actualVendorId,
      procurementRequestId,
      pr.project_id || null,
      pr.site_id || null,
      paymentDate || new Date().toISOString().slice(0, 10),
      payAmount,
      paymentReference || `VPAY-${Date.now()}`,
      paymentMethod,
      remarks || null,
      userId || null,
    ]
  );

  // Recalculate total paid
  const [[{ totalPaid }]] = await pool.query(
    'SELECT COALESCE(SUM(amount), 0) AS totalPaid FROM vendor_payments WHERE procurement_request_id = ?',
    [procurementRequestId]
  );

  const totalAmount = Number(pr.total_amount || 0);
  const numPaid = Number(totalPaid);
  const numDue = Math.max(0, totalAmount - numPaid);
  const paymentStatus = numPaid >= totalAmount && totalAmount > 0 ? 'paid' : (numPaid > 0 ? 'partially_paid' : 'pending');

  await pool.query(
    'UPDATE procurement_requests SET amount_paid = ?, amount_due = ?, payment_status = ? WHERE id = ?',
    [numPaid, numDue, paymentStatus, procurementRequestId]
  );

  return { success: true, totalPaid: numPaid, amountDue: numDue, paymentStatus };
}

/**
 * List vendor payments for a specific procurement request
 */
async function getVendorPaymentsHistory(procurementRequestId) {
  const [rows] = await pool.query(
    `SELECT vp.*, u.full_name AS created_by_name, v.name AS vendor_name
     FROM vendor_payments vp
     LEFT JOIN users u ON u.id = vp.created_by
     LEFT JOIN vendors v ON v.id = vp.vendor_id
     WHERE vp.procurement_request_id = ?
     ORDER BY vp.payment_date DESC, vp.id DESC`,
    [procurementRequestId]
  );
  return rows.map((r) => ({
    id: r.id,
    paymentDate: r.payment_date,
    amount: Number(num(r.amount).toFixed(2)),
    paymentReference: r.payment_reference,
    paymentMethod: r.payment_method,
    remarks: r.remarks,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  }));
}

// =========================================================================
// TAB 6: CLIENT PAYMENTS
// Client, Project, Contract Value, Invoice/Payment Ref, Payment Date, Amount Received, Amount Due, Status
// =========================================================================
async function getClientPaymentsSummary({ clientId, projectId, search, page = 1, pageSize = 25 } = {}) {
  const offset = (page - 1) * pageSize;
  const where = ['p.is_archived = 0'];
  const params = [];

  if (clientId) {
    where.push('p.client_id = ?');
    params.push(Number(clientId));
  }
  if (projectId) {
    where.push('p.id = ?');
    params.push(Number(projectId));
  }
  if (search) {
    where.push('(c.name LIKE ? OR p.name LIKE ? OR p.code LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const query = `
    SELECT
      p.id AS project_id, p.name AS project_name, p.code AS project_code,
      c.id AS client_id, c.name AS client_name,
      COALESCE(p.client_contract_value, p.estimated_budget, 0) AS contract_value,
      COALESCE((SELECT SUM(amount) FROM client_payments cp WHERE cp.project_id = p.id), 0) AS amount_received,
      (
        SELECT cp.payment_reference FROM client_payments cp
        WHERE cp.project_id = p.id ORDER BY cp.payment_date DESC, cp.id DESC LIMIT 1
      ) AS latest_payment_reference,
      (
        SELECT cp.payment_date FROM client_payments cp
        WHERE cp.project_id = p.id ORDER BY cp.payment_date DESC, cp.id DESC LIMIT 1
      ) AS latest_payment_date
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    ${whereSql}
    ORDER BY c.name ASC, p.name ASC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(query, [...params, Number(pageSize), Number(offset)]);

  const summaryQuery = `
    SELECT
      SUM(COALESCE(p.client_contract_value, p.estimated_budget, 0)) AS total_contract_value,
      SUM(COALESCE((SELECT SUM(amount) FROM client_payments cp WHERE cp.project_id = p.id), 0)) AS total_received,
      COUNT(*) AS total_count
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    ${whereSql}
  `;
  const [summaryRows] = await pool.query(summaryQuery, params);
  const totalContractValue = Number(num(summaryRows[0]?.total_contract_value).toFixed(2));
  const totalReceived = Number(num(summaryRows[0]?.total_received).toFixed(2));
  const totalDue = Number(Math.max(0, totalContractValue - totalReceived).toFixed(2));
  const total = Number(summaryRows[0]?.total_count || 0);

  return {
    rows: rows.map((r) => {
      const contractValue = Number(num(r.contract_value).toFixed(2));
      const received = Number(num(r.amount_received).toFixed(2));
      const due = Number(Math.max(0, contractValue - received).toFixed(2));
      let status = 'pending';
      if (received >= contractValue && contractValue > 0) status = 'paid';
      else if (received > 0) status = 'partially_paid';

      return {
        clientId: r.client_id,
        clientName: r.client_name || 'Direct / Internal',
        projectId: r.project_id,
        projectName: r.project_name,
        projectCode: r.project_code,
        contractValue,
        amountReceived: received,
        amountDue: due,
        paymentStatus: status,
        latestPaymentReference: r.latest_payment_reference || '-',
        latestPaymentDate: r.latest_payment_date || null,
      };
    }),
    summary: {
      totalContractValue,
      totalReceived,
      totalDue,
    },
    total,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

/**
 * Record payment received from client
 */
async function recordClientPayment({ clientId, projectId, amount, paymentDate, paymentReference, invoiceReference, paymentMethod = 'bank_transfer', notes }, userId) {
  const payAmount = Number(amount);
  if (!(payAmount > 0)) throw ApiError.badRequest('Enter a valid received amount greater than zero.');

  const [projRows] = await pool.query('SELECT client_id FROM projects WHERE id = ? LIMIT 1', [projectId]);
  if (!projRows.length) throw ApiError.notFound('Project not found.');

  const actualClientId = clientId ? Number(clientId) : (projRows[0].client_id || null);

  const [result] = await pool.query(
    `INSERT INTO client_payments
      (client_id, project_id, invoice_reference, payment_reference, payment_date, amount, payment_method, payment_status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?, ?)`,
    [
      actualClientId,
      projectId,
      invoiceReference || null,
      paymentReference || `CPAY-${Date.now()}`,
      paymentDate || new Date().toISOString().slice(0, 10),
      payAmount,
      paymentMethod,
      notes || null,
      userId || null,
    ]
  );

  return { id: result.insertId, success: true };
}

/**
 * List client payments history
 */
async function getClientPaymentsHistory({ clientId, projectId } = {}) {
  const where = [];
  const params = [];
  if (clientId) {
    where.push('cp.client_id = ?');
    params.push(Number(clientId));
  }
  if (projectId) {
    where.push('cp.project_id = ?');
    params.push(Number(projectId));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT cp.*, c.name AS client_name, p.name AS project_name, p.code AS project_code, u.full_name AS created_by_name
     FROM client_payments cp
     LEFT JOIN clients c ON c.id = cp.client_id
     LEFT JOIN projects p ON p.id = cp.project_id
     LEFT JOIN users u ON u.id = cp.created_by
     ${whereSql}
     ORDER BY cp.payment_date DESC, cp.id DESC`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    projectId: r.project_id,
    projectName: r.project_name,
    projectCode: r.project_code,
    invoiceReference: r.invoice_reference || '-',
    paymentReference: r.payment_reference || '-',
    paymentDate: r.payment_date,
    amount: Number(num(r.amount).toFixed(2)),
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    notes: r.notes,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
  }));
}

// =========================================================================
// TAB 7: PROFITABILITY / PROJECT FINANCIAL SUMMARY
// Client Contract Value (Revenue) - Admin Estimated Budget - Actual Expenses = Profit
// =========================================================================
async function getProfitabilitySummary({ clientId, projectId, search } = {}) {
  const where = ['p.is_archived = 0'];
  const params = [];

  if (clientId) {
    where.push('p.client_id = ?');
    params.push(Number(clientId));
  }
  if (projectId) {
    where.push('p.id = ?');
    params.push(Number(projectId));
  }
  if (search) {
    where.push('(c.name LIKE ? OR p.name LIKE ? OR p.code LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const query = `
    SELECT
      p.id AS project_id, p.name AS project_name, p.code AS project_code, p.status AS project_status,
      c.id AS client_id, c.name AS client_name,
      COALESCE(p.client_contract_value, p.estimated_budget, 0) AS contract_value,
      COALESCE(p.estimated_budget, 0) AS estimated_budget,

      -- Total Actual Material (same single definition as Project Summary / Budget vs Actual)
      ${materialActualSql('dwu.project_id = p.id', 'e2.project_id = p.id')} AS actual_material,

      -- Total Actual Labour
      COALESCE((
        SELECT SUM((twl.hours_worked / 8.0) * twl.daily_wage)
        FROM task_worker_logs twl
        WHERE twl.project_id = p.id AND COALESCE(twl.worker_type, 'daily_wage') NOT IN ('company_labour', 'company_employee') AND LOWER(COALESCE(twl.labour_type, '')) NOT LIKE '%company%'
      ), 0) + COALESCE((
        SELECT SUM(e.amount) FROM expenses e
        WHERE e.project_id = p.id AND e.category IN ('Labour Expense', 'Advance Wages', 'Labour Room Rent', 'Labour Conveyance')
          AND e.status NOT IN ('rejected', 'cancelled')
      ), 0) AS actual_labour,

      -- Total Actual Machines / Tools
      COALESCE((
        SELECT SUM(dwu.tool_cost)
        FROM daily_work_updates dwu
        WHERE dwu.project_id = p.id AND dwu.tool_cost > 0
      ), 0) + COALESCE((
        SELECT SUM(e.amount) FROM expenses e
        WHERE e.project_id = p.id AND e.category IN ('Machine / Tool', 'Equipment Rental', 'Tools', 'Machinery', 'Tools & Equipment')
          AND e.status NOT IN ('rejected', 'cancelled') AND (e.reference IS NULL OR e.reference NOT LIKE 'DWU-TOOL-%')
      ), 0) AS actual_machine,

      -- Total Actual Misc
      COALESCE((
        SELECT SUM(dwu.misc_amount)
        FROM daily_work_updates dwu
        WHERE dwu.project_id = p.id AND dwu.misc_amount > 0
      ), 0) + COALESCE((
        SELECT SUM(e.amount) FROM expenses e
        WHERE e.project_id = p.id AND e.category NOT IN (
          'Material Consumption', 'Labour Expense', 'Advance Wages', 'Labour Room Rent',
          'Labour Conveyance', 'Machine / Tool', 'Equipment Rental', 'Tools', 'Machinery', 'Tools & Equipment'
        )
        AND e.status NOT IN ('rejected', 'cancelled') AND (e.reference IS NULL OR e.reference NOT LIKE 'DWU-MISC-%')
      ), 0) AS actual_misc,

      -- Client payments received
      COALESCE((SELECT SUM(amount) FROM client_payments cp WHERE cp.project_id = p.id), 0) AS total_client_paid

    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    ${whereSql}
    ORDER BY c.name ASC, p.name ASC
  `;

  const [rows] = await pool.query(query, params);

  let sumRevenue = 0;
  let sumBudget = 0;
  let sumActual = 0;
  let sumProfit = 0;

  const resultRows = rows.map((r) => {
    const contractValue = Number(num(r.contract_value).toFixed(2));
    const estimatedBudget = Number(num(r.estimated_budget).toFixed(2));
    const actualMaterial = Number(num(r.actual_material).toFixed(2));
    const actualLabour = Number(num(r.actual_labour).toFixed(2));
    const actualMachine = Number(num(r.actual_machine).toFixed(2));
    const actualMisc = Number(num(r.actual_misc).toFixed(2));
    const actualExpense = Number((actualMaterial + actualLabour + actualMachine + actualMisc).toFixed(2));
    const profit = Number((contractValue - actualExpense).toFixed(2));
    const profitMargin = contractValue > 0 ? Number(((profit / contractValue) * 100).toFixed(1)) : 0;
    const clientPaid = Number(num(r.total_client_paid).toFixed(2));
    const clientDue = Number(Math.max(0, contractValue - clientPaid).toFixed(2));

    sumRevenue += contractValue;
    sumBudget += estimatedBudget;
    sumActual += actualExpense;
    sumProfit += profit;

    let status = 'Profitable';
    if (profit < 0) status = 'Loss';
    else if (profit === 0) status = 'Breakeven';

    return {
      clientId: r.client_id,
      clientName: r.client_name || 'Direct / Internal',
      projectId: r.project_id,
      projectName: r.project_name,
      projectCode: r.project_code,
      projectStatus: r.project_status,
      contractValue,
      estimatedBudget,
      actualExpense,
      actualMaterial,
      actualLabour,
      actualMachine,
      actualMisc,
      profit,
      profitMargin,
      clientPaid,
      clientDue,
      status,
    };
  });

  return {
    rows: resultRows,
    summary: {
      totalRevenue: Number(sumRevenue.toFixed(2)),
      totalBudget: Number(sumBudget.toFixed(2)),
      totalActual: Number(sumActual.toFixed(2)),
      totalProfit: Number(sumProfit.toFixed(2)),
      overallMargin: sumRevenue > 0 ? Number(((sumProfit / sumRevenue) * 100).toFixed(1)) : 0,
    },
  };
}

// =========================================================================
// DRILL-DOWN DATA FOR CLICKABLE CELLS
// Returns underlying transactions for any clicked amount
// =========================================================================
async function getDrilldownTransactions({ type, projectId, siteId, taskId, category, recordId } = {}) {
  const where = [];
  const params = [];

  if (projectId) { where.push('p.id = ?'); params.push(Number(projectId)); }
  if (siteId) { where.push('s.id = ?'); params.push(Number(siteId)); }
  if (taskId) { where.push('pt.id = ?'); params.push(Number(taskId)); }

  // 1. Material Drilldown
  if (category === 'material' || type === 'material') {
    const query = `
      SELECT
        dwu.work_date AS date,
        CONCAT('DWU-MAT-', dwu.id) AS source_reference,
        'Material Usage' AS transaction_type,
        m.name AS item_name,
        dwu.quantity_used AS quantity,
        dwu.unit,
        CASE WHEN dwu.quantity_used > 0 THEN ROUND(COALESCE(dwu.material_cost, mex.amount, dwu.quantity_used * ${FALLBACK_RATE_SQL}) / dwu.quantity_used, 4) END AS rate,
        ROUND(COALESCE(dwu.material_cost, mex.amount, dwu.quantity_used * ${FALLBACK_RATE_SQL}), 2) AS amount,
        c.name AS contractor_name,
        dwu.remarks AS notes
      FROM daily_work_updates dwu
      JOIN projects p ON p.id = dwu.project_id
      LEFT JOIN sites s ON s.id = dwu.site_id
      LEFT JOIN project_tasks pt ON pt.id = dwu.task_id
      JOIN materials m ON m.id = dwu.material_id
      LEFT JOIN contractors c ON c.id = dwu.contractor_id
      LEFT JOIN expenses mex ON mex.id = dwu.expense_id
      WHERE dwu.quantity_used > 0 AND (mex.id IS NULL OR mex.status NOT IN ('rejected', 'cancelled')) ${where.length ? `AND ${where.join(' AND ')}` : ''}
      ORDER BY dwu.work_date DESC, dwu.id DESC
    `;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  // 2. Labour Drilldown
  if (category === 'labour' || type === 'labour') {
    const query = `
      SELECT
        twl.work_date AS date,
        CONCAT('TWL-', twl.id) AS source_reference,
        'Labour Worker Log' AS transaction_type,
        CONCAT(twl.worker_name, ' (', twl.labour_type, ')') AS item_name,
        (twl.hours_worked / 8.0) AS quantity,
        'day(s)' AS unit,
        twl.daily_wage AS rate,
        ROUND((twl.hours_worked / 8.0) * twl.daily_wage, 2) AS amount,
        c.name AS contractor_name,
        twl.work_performed AS notes
      FROM task_worker_logs twl
      JOIN projects p ON p.id = twl.project_id
      LEFT JOIN sites s ON s.id = twl.site_id
      LEFT JOIN project_tasks pt ON pt.id = twl.task_id
      LEFT JOIN contractors c ON c.id = twl.contractor_id
      WHERE COALESCE(twl.worker_type, 'daily_wage') NOT IN ('company_labour', 'company_employee') AND LOWER(COALESCE(twl.labour_type, '')) NOT LIKE '%company%' ${where.length ? `AND ${where.join(' AND ')}` : ''}
      ORDER BY twl.work_date DESC, twl.id DESC
    `;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  // 3. Machine / Tool Drilldown
  if (category === 'machine' || category === 'machines_tools' || type === 'machine') {
    const query = `
      SELECT
        dwu.work_date AS date,
        CONCAT('DWU-TOOL-', dwu.id) AS source_reference,
        'Machine/Tool Usage' AS transaction_type,
        dwu.tool_name AS item_name,
        1 AS quantity,
        'shift' AS unit,
        dwu.tool_cost AS rate,
        dwu.tool_cost AS amount,
        c.name AS contractor_name,
        dwu.tool_remarks AS notes
      FROM daily_work_updates dwu
      JOIN projects p ON p.id = dwu.project_id
      LEFT JOIN sites s ON s.id = dwu.site_id
      LEFT JOIN project_tasks pt ON pt.id = dwu.task_id
      LEFT JOIN contractors c ON c.id = dwu.contractor_id
      WHERE dwu.tool_cost > 0 ${where.length ? `AND ${where.join(' AND ')}` : ''}
      ORDER BY dwu.work_date DESC, dwu.id DESC
    `;
    const [rows] = await pool.query(query, params);
    return rows;
  }

  // 4. Misc Drilldown
  if (category === 'misc' || category === 'miscellaneous' || type === 'misc') {
    const query = `
      SELECT
        dwu.work_date AS date,
        CONCAT('DWU-MISC-', dwu.id) AS source_reference,
        'Miscellaneous Expense' AS transaction_type,
        dwu.misc_description AS item_name,
        1 AS quantity,
        'entry' AS unit,
        dwu.misc_amount AS rate,
        dwu.misc_amount AS amount,
        c.name AS contractor_name,
        dwu.misc_remarks AS notes
      FROM daily_work_updates dwu
      JOIN projects p ON p.id = dwu.project_id
      LEFT JOIN sites s ON s.id = dwu.site_id
      LEFT JOIN project_tasks pt ON pt.id = dwu.task_id
      LEFT JOIN contractors c ON c.id = dwu.contractor_id
      WHERE dwu.misc_amount > 0 ${where.length ? `AND ${where.join(' AND ')}` : ''}

      UNION ALL

      SELECT e.expense_date, e.expense_number, e.category, e.description, 1, 'entry', e.amount, e.amount,
             c.name, e.notes
      FROM expenses e
      JOIN projects p ON p.id = e.project_id
      LEFT JOIN sites s ON s.id = e.site_id
      LEFT JOIN project_tasks pt ON pt.id = e.task_id
      LEFT JOIN contractors c ON c.id = e.contractor_id
      WHERE e.category IN ('Miscellaneous', 'Misc', 'Operational Misc', 'Material Transport')
        AND e.status NOT IN ('rejected', 'cancelled')
        AND (e.reference IS NULL OR e.reference NOT LIKE 'DWU-MISC-%')
        ${where.length ? `AND ${where.join(' AND ')}` : ''}
      ORDER BY date DESC
    `;
    const [rows] = await pool.query(query, [...params, ...params]);
    return rows;
  }

  // Fallback: general expenses for this scope
  const [rows] = await pool.query(
    `SELECT
       e.expense_date AS date,
       e.expense_number AS source_reference,
       e.category AS transaction_type,
       e.description AS item_name,
       1 AS quantity,
       'entry' AS unit,
       e.amount AS rate,
       e.amount AS amount,
       c.name AS contractor_name,
       e.notes
     FROM expenses e
     JOIN projects p ON p.id = e.project_id
     LEFT JOIN sites s ON s.id = e.site_id
     LEFT JOIN project_tasks pt ON pt.id = e.task_id
     LEFT JOIN contractors c ON c.id = e.contractor_id
     WHERE e.status NOT IN ('rejected', 'cancelled') ${where.length ? `AND ${where.join(' AND ')}` : ''}
     ORDER BY e.expense_date DESC, e.id DESC`,
    params
  );
  return rows;
}

module.exports = {
  getProjectCosts,
  getActualExpenses,
  getBudgetVsActual,
  getProcurementLedger,
  getVendorPayables,
  recordVendorPayment,
  getVendorPaymentsHistory,
  getClientPaymentsSummary,
  recordClientPayment,
  getClientPaymentsHistory,
  getProfitabilitySummary,
  getDrilldownTransactions,
  getLedgerEntryDetail,
  materialActualSql,
};
