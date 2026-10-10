'use strict';

/**
 * Physical machines / tools, tracked per UNIQUE SERIAL NUMBER.
 *
 * `tools` stays the catalogue of machine TYPES (Bar Bending Machine, Tower
 * Crane ...). Every physical piece of kit is a row in `tool_units` with its own
 * mandatory unique serial number (SR001, SR002, ...), purchase data, health,
 * location and availability. Allocation, rental and return history hang off the
 * unit, never off the type, so three Bar Bending Machines can be with three
 * different contractors at once and each is tracked separately.
 *
 * Cost rules (all computed here, on the server):
 *   - Allocating an OWNED unit never creates a purchase expense. The original
 *     purchase cost stays on the unit (purchase_cost) and, when it was bought
 *     through procurement, on that vendor purchase - once.
 *   - An approved USAGE CHARGE (per-day rate, or a fixed total over N days) is
 *     recorded on the allocation and booked as a project cost when the machine
 *     comes back, for the ACTUAL days used. Days are counted inclusively and a
 *     unit cannot be allocated again until the previous holder's last day has
 *     passed, so the same usage day is never charged twice.
 *   - A RENTED unit's actual rental cost (rate/day x days used) is allocated to
 *     the Task/Project it was used on. It is kept apart from any charge raised
 *     against the contractor, which is a recovery and never a second expense.
 */

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/roles');
const notificationModel = require('../models/notificationModel');
const warehouseModel = require('../models/warehouseModel');

const HEALTH_VALUES = ['excellent', 'good', 'average', 'poor'];
const AVAILABILITY_VALUES = ['available', 'allocated', 'maintenance', 'retired'];
const CHARGE_POLICIES = ['none', 'per_day_rate', 'fixed_total'];
const UNUSED_POLICIES = ['actual_days', 'full_amount'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const r2 = (n) => Number(Number(n || 0).toFixed(2));
const todayStr = () => new Date().toISOString().slice(0, 10);

function assertDate(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw ApiError.badRequest('Check the highlighted fields.', { [field]: 'Enter a date.' });
    return null;
  }
  const v = String(value).slice(0, 10);
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw ApiError.badRequest('Check the highlighted fields.', { [field]: 'Enter a valid date (YYYY-MM-DD).' });
  }
  return v;
}

const dayNumber = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const addDays = (d, n) => new Date((dayNumber(d) + n) * 86400000).toISOString().slice(0, 10);
/** Inclusive day count: start 1st, returned 3rd -> 3 days of use. Never below 1. */
const daysInclusive = (start, end) => Math.max(1, dayNumber(end) - dayNumber(start) + 1);

/**
 * Usage maths for one allocation. Pure, so it is unit-tested directly.
 *   per_day_rate : charge = rate x actual days
 *   fixed_total  : daily = total / approved days
 *                  actual_days (default) -> charge = daily x actual days; the rest
 *                                          of the approved amount is released
 *                  full_amount           -> charge = approved total (more if the
 *                                          machine overran the approved days)
 */
function computeUsage({ startDate, returnedDate, chargePolicy = 'none', chargeRate = 0, chargeTotal = null, chargeDays = null, unusedPolicy = 'actual_days', rentalRatePerDay = 0 }) {
  const usageDays = daysInclusive(startDate, returnedDate);
  let daily = 0;
  let usageCharge = 0;
  let unbilled = 0;

  if (chargePolicy === 'per_day_rate') {
    daily = Number(chargeRate || 0);
    usageCharge = daily * usageDays;
  } else if (chargePolicy === 'fixed_total' && Number(chargeTotal) > 0 && Number(chargeDays) > 0) {
    daily = Number(chargeTotal) / Number(chargeDays);
    if (unusedPolicy === 'full_amount') {
      usageCharge = Math.max(Number(chargeTotal), daily * usageDays);
    } else {
      usageCharge = daily * usageDays;
      unbilled = Math.max(0, Number(chargeTotal) - usageCharge);
    }
  }

  return {
    usageDays,
    dailyChargeRate: Number(daily.toFixed(4)),
    usageCharge: r2(usageCharge),
    unbilledBalance: r2(unbilled),
    rentalCostAllocated: r2(Number(rentalRatePerDay || 0) * usageDays),
  };
}

// ---------------------------------------------------------------- mapping

const UNIT_SELECT = `
  SELECT
    u.id, u.tool_id, u.serial_number, u.ownership_type,
    DATE_FORMAT(u.purchase_date, '%Y-%m-%d') AS purchase_date,
    DATE_FORMAT(u.expiry_date, '%Y-%m-%d') AS expiry_date,
    u.purchase_cost, u.vendor_id, u.health, u.health_updated_at, u.health_updated_by,
    u.warehouse_id, u.current_contractor_id, u.current_project_id, u.current_site_id, u.current_task_id,
    u.availability_status, u.procurement_request_id, u.notes, u.created_at, u.updated_at,
    t.name AS tool_name, t.type AS tool_type,
    v.name AS vendor_name,
    hu.full_name AS health_updated_by_name,
    w.name AS warehouse_name,
    c.name AS contractor_name, p.name AS project_name, p.code AS project_code,
    s.name AS site_name, pt.name AS task_name,
    (SELECT a.id FROM tool_allocations a WHERE a.unit_id = u.id AND a.status = 'active' LIMIT 1) AS active_allocation_id
  FROM tool_units u
  JOIN tools t ON t.id = u.tool_id
  LEFT JOIN vendors v ON v.id = u.vendor_id
  LEFT JOIN users hu ON hu.id = u.health_updated_by
  LEFT JOIN warehouses w ON w.id = u.warehouse_id
  LEFT JOIN contractors c ON c.id = u.current_contractor_id
  LEFT JOIN projects p ON p.id = u.current_project_id
  LEFT JOIN sites s ON s.id = u.current_site_id
  LEFT JOIN project_tasks pt ON pt.id = u.current_task_id
`;

function mapUnit(row, viewer = {}) {
  if (!row) return null;
  // A contractor sees that a unit is allocated, but only the holder's own
  // details; other contractors' assignments stay private to Admin/PM.
  const hideHolder = viewer.role === ROLES.CONTRACTOR
    && row.current_contractor_id != null
    && Number(row.current_contractor_id) !== Number(viewer.contractorId);
  return {
    id: row.id,
    serialNumber: row.serial_number,
    toolId: row.tool_id,
    toolName: row.tool_name,
    toolType: row.tool_type,
    ownershipType: row.ownership_type,
    purchaseDate: row.purchase_date,
    expiryDate: row.expiry_date,
    isExpired: Boolean(row.expiry_date && row.expiry_date < todayStr()),
    purchaseCost: Number(row.purchase_cost || 0),
    vendor: row.vendor_id ? { id: row.vendor_id, name: row.vendor_name } : null,
    health: row.health,
    healthUpdatedAt: row.health_updated_at,
    healthUpdatedBy: row.health_updated_by ? { id: row.health_updated_by, name: row.health_updated_by_name } : null,
    warehouse: row.warehouse_id ? { id: row.warehouse_id, name: row.warehouse_name } : null,
    availabilityStatus: row.availability_status,
    activeAllocationId: row.active_allocation_id || null,
    currentContractor: !hideHolder && row.current_contractor_id ? { id: row.current_contractor_id, name: row.contractor_name } : null,
    currentProject: !hideHolder && row.current_project_id ? { id: row.current_project_id, name: row.project_name, code: row.project_code } : null,
    currentSite: !hideHolder && row.current_site_id ? { id: row.current_site_id, name: row.site_name } : null,
    currentTask: !hideHolder && row.current_task_id ? { id: row.current_task_id, name: row.task_name } : null,
    procurementRequestId: row.procurement_request_id || null,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ALLOC_SELECT = `
  SELECT
    a.id, a.unit_id, a.tool_id, a.contractor_id, a.project_id, a.site_id, a.task_id, a.subtask_id, ast.name AS subtask_name,
    a.requested_by, a.approved_by, a.procurement_request_id, a.previous_allocation_id, a.source_kind,
    DATE_FORMAT(a.start_date, '%Y-%m-%d') AS start_date,
    DATE_FORMAT(a.expected_return_date, '%Y-%m-%d') AS expected_return_date,
    DATE_FORMAT(a.returned_date, '%Y-%m-%d') AS returned_date,
    a.status, a.charge_policy, a.approved_charge_total, a.approved_charge_days, a.daily_charge_rate, a.unused_policy,
    a.usage_days, a.usage_charge, a.rental_cost_allocated, a.unbilled_balance, a.expense_id, a.return_notes,
    a.created_at,
    u.serial_number, u.ownership_type, t.name AS tool_name,
    c.name AS contractor_name, p.name AS project_name, s.name AS site_name, pt.name AS task_name,
    ru.full_name AS requested_by_name, au.full_name AS approved_by_name,
    pr.request_number
  FROM tool_allocations a
  JOIN tool_units u ON u.id = a.unit_id
  JOIN tools t ON t.id = a.tool_id
  LEFT JOIN contractors c ON c.id = a.contractor_id
  LEFT JOIN projects p ON p.id = a.project_id
  LEFT JOIN sites s ON s.id = a.site_id
  LEFT JOIN project_tasks pt ON pt.id = a.task_id
  LEFT JOIN task_subtasks ast ON ast.id = a.subtask_id
  LEFT JOIN users ru ON ru.id = a.requested_by
  LEFT JOIN users au ON au.id = a.approved_by
  LEFT JOIN procurement_requests pr ON pr.id = a.procurement_request_id
`;

function mapAllocation(row) {
  if (!row) return null;
  const rentalRate = null;
  const accruedDays = row.status === 'active' ? daysInclusive(row.start_date, todayStr()) : null;
  let accruedCharge = null;
  if (row.status === 'active' && row.charge_policy !== 'none') {
    accruedCharge = computeUsage({
      startDate: row.start_date,
      returnedDate: todayStr() < row.start_date ? row.start_date : todayStr(),
      chargePolicy: row.charge_policy,
      chargeRate: Number(row.daily_charge_rate),
      chargeTotal: row.approved_charge_total != null ? Number(row.approved_charge_total) : null,
      chargeDays: row.approved_charge_days != null ? Number(row.approved_charge_days) : null,
      unusedPolicy: row.unused_policy,
      rentalRatePerDay: rentalRate,
    }).usageCharge;
  }
  return {
    id: row.id,
    unit: { id: row.unit_id, serialNumber: row.serial_number, ownershipType: row.ownership_type },
    tool: { id: row.tool_id, name: row.tool_name },
    contractor: row.contractor_id ? { id: row.contractor_id, name: row.contractor_name } : null,
    project: row.project_id ? { id: row.project_id, name: row.project_name } : null,
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    task: row.task_id ? { id: row.task_id, name: row.task_name } : null,
    subtask: row.subtask_id ? { id: row.subtask_id, name: row.subtask_name } : null,
    requestedBy: row.requested_by ? { id: row.requested_by, name: row.requested_by_name } : null,
    approvedBy: row.approved_by ? { id: row.approved_by, name: row.approved_by_name } : null,
    procurementRequest: row.procurement_request_id ? { id: row.procurement_request_id, requestNumber: row.request_number } : null,
    previousAllocationId: row.previous_allocation_id || null,
    sourceKind: row.source_kind,
    startDate: row.start_date,
    expectedReturnDate: row.expected_return_date,
    returnedDate: row.returned_date,
    status: row.status,
    chargePolicy: row.charge_policy,
    approvedChargeTotal: row.approved_charge_total != null ? Number(row.approved_charge_total) : null,
    approvedChargeDays: row.approved_charge_days != null ? Number(row.approved_charge_days) : null,
    dailyChargeRate: Number(row.daily_charge_rate || 0),
    unusedPolicy: row.unused_policy,
    usageDays: row.usage_days != null ? Number(row.usage_days) : accruedDays,
    usageCharge: Number(row.usage_charge || 0),
    accruedUsageCharge: accruedCharge,
    rentalCostAllocated: Number(row.rental_cost_allocated || 0),
    unbilledBalance: Number(row.unbilled_balance || 0),
    expenseId: row.expense_id || null,
    returnNotes: row.return_notes,
    createdAt: row.created_at,
  };
}

async function logEvent(conn, e) {
  await conn.query(
    `INSERT INTO tool_unit_history
       (unit_id, event_type, from_contractor_id, to_contractor_id, project_id, site_id, task_id, subtask_id, allocation_id,
        old_value, new_value, amount, details, actor_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      e.unitId, e.type, e.fromContractorId ?? null, e.toContractorId ?? null, e.projectId ?? null,
      e.siteId ?? null, e.taskId ?? null, e.subtaskId ?? null, e.allocationId ?? null, e.oldValue ?? null, e.newValue ?? null,
      e.amount ?? null, e.details ? String(e.details).slice(0, 500) : null, e.actorId ?? null,
    ]
  );
}

function wrapDuplicate(error) {
  if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
    if (/uq_tool_units_serial/.test(error.message)) {
      return ApiError.badRequest('Check the highlighted fields.', { serial_number: 'This serial number is already registered to another machine.' });
    }
    if (/uq_tool_alloc_one_active/.test(error.message)) {
      return ApiError.badRequest('That machine is already allocated. Return or reassign it first.');
    }
  }
  return error;
}

async function withTx(work, sharedConn = null) {
  if (sharedConn) return work(sharedConn);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await work(conn);
    await conn.commit();
    return out;
  } catch (error) {
    await conn.rollback();
    throw wrapDuplicate(error);
  } finally {
    conn.release();
  }
}

// ------------------------------------------------------------------ reads

function viewerFrom(hrScope) {
  return { role: hrScope?.role ?? null, contractorId: hrScope?.contractorId ?? null };
}

async function listUnits(query = {}, hrScope) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const where = [];
  const params = [];
  if (query.toolId) { where.push('u.tool_id = ?'); params.push(Number(query.toolId)); }
  if (query.status && query.status !== 'all') { where.push('u.availability_status = ?'); params.push(query.status); }
  if (query.health && query.health !== 'all') { where.push('u.health = ?'); params.push(query.health); }
  if (query.contractorId) { where.push('u.current_contractor_id = ?'); params.push(Number(query.contractorId)); }
  if (query.search) {
    where.push('(u.serial_number LIKE ? OR t.name LIKE ?)');
    params.push(`%${query.search}%`, `%${query.search}%`);
  }
  // PMs only see units that are free or sitting on one of their projects.
  if (hrScope?.role === ROLES.PROJECT_MANAGER) {
    const ids = hrScope.pmProjectIds || [];
    where.push(ids.length
      ? `(u.availability_status = 'available' OR u.current_project_id IN (${ids.map(() => '?').join(',')}))`
      : "u.availability_status = 'available'");
    params.push(...ids);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `${UNIT_SELECT} ${whereSql} ORDER BY t.name ASC, u.serial_number ASC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM tool_units u JOIN tools t ON t.id = u.tool_id ${whereSql}`,
    params
  );
  const viewer = viewerFrom(hrScope);
  return {
    units: rows.map((r) => mapUnit(r, viewer)),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function loadUnitRow(id, conn = pool) {
  const [rows] = await conn.query(`${UNIT_SELECT} WHERE u.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function getUnit(id, hrScope) {
  const row = await loadUnitRow(id);
  if (!row) throw ApiError.notFound('That machine does not exist.');
  const viewer = viewerFrom(hrScope);
  const unit = mapUnit(row, viewer);

  if (viewer.role === ROLES.CONTRACTOR) {
    // Contractors only get the full trail for machines they currently hold.
    if (Number(row.current_contractor_id) !== Number(viewer.contractorId)) {
      return { unit, history: [], healthHistory: [], allocations: [], rentals: [] };
    }
  }

  const [hist] = await pool.query(
    `SELECT h.*, u.full_name AS actor_name, fc.name AS from_name, tc.name AS to_name,
            p.name AS project_name, s.name AS site_name, pt.name AS task_name
     FROM tool_unit_history h
     LEFT JOIN users u ON u.id = h.actor_user_id
     LEFT JOIN contractors fc ON fc.id = h.from_contractor_id
     LEFT JOIN contractors tc ON tc.id = h.to_contractor_id
     LEFT JOIN projects p ON p.id = h.project_id
     LEFT JOIN sites s ON s.id = h.site_id
     LEFT JOIN project_tasks pt ON pt.id = h.task_id
     WHERE h.unit_id = ? ORDER BY h.id DESC LIMIT 200`,
    [id]
  );
  const history = hist.map((h) => ({
    id: h.id,
    type: h.event_type,
    fromContractor: h.from_contractor_id ? { id: h.from_contractor_id, name: h.from_name } : null,
    toContractor: h.to_contractor_id ? { id: h.to_contractor_id, name: h.to_name } : null,
    project: h.project_id ? { id: h.project_id, name: h.project_name } : null,
    site: h.site_id ? { id: h.site_id, name: h.site_name } : null,
    task: h.task_id ? { id: h.task_id, name: h.task_name } : null,
    allocationId: h.allocation_id,
    oldValue: h.old_value,
    newValue: h.new_value,
    amount: h.amount != null ? Number(h.amount) : null,
    details: h.details,
    actor: h.actor_user_id ? { id: h.actor_user_id, name: h.actor_name } : null,
    at: h.created_at,
  }));

  const [allocRows] = await pool.query(`${ALLOC_SELECT} WHERE a.unit_id = ? ORDER BY a.id DESC`, [id]);
  const [rentRows] = await pool.query(
    `SELECT r.*, DATE_FORMAT(r.rental_start_date,'%Y-%m-%d') AS start_d, DATE_FORMAT(r.expected_return_date,'%Y-%m-%d') AS expected_d,
            DATE_FORMAT(r.actual_return_date,'%Y-%m-%d') AS actual_d, v.name AS vendor_name
     FROM tool_rentals r LEFT JOIN vendors v ON v.id = r.vendor_id WHERE r.unit_id = ? ORDER BY r.id DESC`,
    [id]
  );

  return {
    unit,
    history,
    healthHistory: history.filter((h) => h.type === 'health_update'),
    allocations: allocRows.map(mapAllocation),
    rentals: rentRows.map(mapRental),
  };
}

function mapRental(r) {
  return {
    id: r.id,
    unitId: r.unit_id,
    vendor: r.vendor_id ? { id: r.vendor_id, name: r.vendor_name } : null,
    ratePerDay: Number(r.rate_per_day || 0),
    startDate: r.start_d,
    expectedReturnDate: r.expected_d,
    actualReturnDate: r.actual_d,
    plannedDays: r.planned_days != null ? Number(r.planned_days) : null,
    plannedCost: Number(r.planned_cost || 0),
    totalCost: r.total_cost != null ? Number(r.total_cost) : null,
    allocatedCost: Number(r.allocated_cost || 0),
    unallocatedCost: r.total_cost != null ? r2(Number(r.total_cost) - Number(r.allocated_cost || 0)) : null,
    status: r.status,
    procurementRequestId: r.procurement_request_id,
  };
}

/** Per-type availability: counts, free serials, and who holds the rest. */
async function availabilityForTool(toolId, conn = pool) {
  const [rows] = await conn.query(`${UNIT_SELECT} WHERE u.tool_id = ? ORDER BY u.serial_number`, [toolId]);
  const units = rows.map((r) => mapUnit(r));
  const available = units.filter((u) => u.availabilityStatus === 'available');
  const allocated = units.filter((u) => u.availabilityStatus === 'allocated');
  return {
    toolId: Number(toolId),
    total: units.filter((u) => u.availabilityStatus !== 'retired').length,
    available: available.length,
    allocated: allocated.length,
    maintenance: units.filter((u) => u.availabilityStatus === 'maintenance').length,
    availableUnits: available.map((u) => ({ id: u.id, serialNumber: u.serialNumber, health: u.health, warehouse: u.warehouse })),
    holders: allocated.map((u) => ({
      unitId: u.id,
      serialNumber: u.serialNumber,
      allocationId: u.activeAllocationId,
      contractor: u.currentContractor,
      project: u.currentProject,
      site: u.currentSite,
      task: u.currentTask,
    })),
  };
}

async function listAllocations(query = {}, hrScope) {
  const where = [];
  const params = [];
  if (query.status && query.status !== 'all') { where.push('a.status = ?'); params.push(query.status); }
  if (query.unitId) { where.push('a.unit_id = ?'); params.push(Number(query.unitId)); }
  if (query.contractorId) { where.push('a.contractor_id = ?'); params.push(Number(query.contractorId)); }
  if (query.projectId) { where.push('a.project_id = ?'); params.push(Number(query.projectId)); }
  if (query.taskId) { where.push('a.task_id = ?'); params.push(Number(query.taskId)); }
  if (hrScope?.role === ROLES.CONTRACTOR) { where.push('a.contractor_id = ?'); params.push(Number(hrScope.contractorId)); }
  if (hrScope?.role === ROLES.PROJECT_MANAGER) {
    const ids = hrScope.pmProjectIds || [];
    where.push(ids.length ? `a.project_id IN (${ids.map(() => '?').join(',')})` : '1 = 0');
    params.push(...ids);
  }
  const [rows] = await pool.query(
    `${ALLOC_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.id DESC LIMIT 300`,
    params
  );
  return { allocations: rows.map(mapAllocation) };
}

// ----------------------------------------------------------------- writes

async function assertContext(conn, { contractorId, projectId, siteId, taskId, subtaskId }) {
  if (contractorId) {
    const [[c]] = await conn.query('SELECT id FROM contractors WHERE id = ?', [contractorId]);
    if (!c) throw ApiError.badRequest('Check the highlighted fields.', { contractor_id: 'That contractor does not exist.' });
  }
  if (projectId) {
    const [[p]] = await conn.query('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!p) throw ApiError.badRequest('Check the highlighted fields.', { project_id: 'That project does not exist.' });
  }
  if (siteId) {
    const [[s]] = await conn.query('SELECT id, project_id FROM sites WHERE id = ?', [siteId]);
    if (!s) throw ApiError.badRequest('Check the highlighted fields.', { site_id: 'That site does not exist.' });
    if (projectId && Number(s.project_id) !== Number(projectId)) {
      throw ApiError.badRequest('Check the highlighted fields.', { site_id: 'That site does not belong to the selected project.' });
    }
  }
  if (taskId) {
    const [[t]] = await conn.query('SELECT id, project_id, site_id FROM project_tasks WHERE id = ?', [taskId]);
    if (!t) throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'That task does not exist.' });
    if (projectId && Number(t.project_id) !== Number(projectId)) {
      throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'That task does not belong to the selected project.' });
    }
    if (siteId && t.site_id && Number(t.site_id) !== Number(siteId)) {
      throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'That task does not belong to the selected site.' });
    }
  }
  if (subtaskId) {
    const [[st]] = await conn.query('SELECT id, task_id FROM task_subtasks WHERE id = ?', [subtaskId]);
    if (!st || !taskId || Number(st.task_id) !== Number(taskId)) {
      throw ApiError.badRequest('Check the highlighted fields.', { subtask_id: 'That subtask does not belong to the selected task.' });
    }
  }
}

function normaliseCharge(spec) {
  const policy = CHARGE_POLICIES.includes(spec.chargePolicy) ? spec.chargePolicy : 'none';
  const unusedPolicy = UNUSED_POLICIES.includes(spec.unusedPolicy) ? spec.unusedPolicy : 'actual_days';
  if (policy === 'per_day_rate') {
    if (!(Number(spec.chargeRate) > 0)) {
      throw ApiError.badRequest('Check the highlighted fields.', { usage_charge_rate: 'Enter the approved daily usage charge.' });
    }
    return { policy, unusedPolicy, rate: Number(spec.chargeRate), total: null, days: null };
  }
  if (policy === 'fixed_total') {
    if (!(Number(spec.chargeTotal) > 0) || !(Number(spec.chargeDays) > 0)) {
      throw ApiError.badRequest('Check the highlighted fields.', { usage_charge_total: 'Enter the approved total charge and the number of days it covers.' });
    }
    return { policy, unusedPolicy, rate: Number(spec.chargeTotal) / Number(spec.chargeDays), total: Number(spec.chargeTotal), days: Number(spec.chargeDays) };
  }
  return { policy: 'none', unusedPolicy, rate: 0, total: null, days: null };
}

/**
 * Core allocation. Locks the unit, refuses anything but a free unit, refuses
 * any date overlap with the unit's earlier allocations, then marks the unit
 * allocated to the given Contractor/Project/Site/Task. Used by Admin
 * allocation, procurement fulfilment, rental registration and reassignment.
 */
async function allocateInTx(conn, spec, actor) {
  const startDate = assertDate(spec.startDate || todayStr(), 'start_date', { required: true });
  const expected = assertDate(spec.expectedReturnDate, 'expected_return_date');
  if (expected && expected < startDate) {
    throw ApiError.badRequest('Check the highlighted fields.', { expected_return_date: 'Expected return cannot be before the start date.' });
  }

  const [[unit]] = await conn.query("SELECT *, DATE_FORMAT(expiry_date, '%Y-%m-%d') AS expiry_d FROM tool_units WHERE id = ? FOR UPDATE", [spec.unitId]);
  if (!unit) throw ApiError.badRequest('Check the highlighted fields.', { unit_id: 'That machine does not exist.' });
  if (unit.availability_status !== 'available') {
    throw ApiError.badRequest(
      unit.availability_status === 'allocated'
        ? `Serial ${unit.serial_number} is already allocated. Return it or reassign it instead.`
        : `Serial ${unit.serial_number} is ${unit.availability_status} and cannot be allocated.`
    );
  }
  if (spec.toolId && Number(unit.tool_id) !== Number(spec.toolId)) {
    throw ApiError.badRequest('Check the highlighted fields.', { unit_id: 'That serial belongs to a different machine type.' });
  }
  if (unit.expiry_d && unit.expiry_d < startDate) {
    throw ApiError.badRequest(`Serial ${unit.serial_number} expired on ${unit.expiry_d} and cannot be allocated.`);
  }

  // Date-level overlap guard (belt and braces beside the unique active key).
  const [[overlap]] = await conn.query(
    `SELECT COUNT(*) AS n FROM tool_allocations
     WHERE unit_id = ? AND status = 'returned' AND returned_date >= ?`,
    [spec.unitId, startDate]
  );
  if (Number(overlap.n) > 0) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      start_date: 'This serial was still with a previous holder on that date. Start the new allocation after their last day.',
    });
  }

  await assertContext(conn, spec);
  const charge = normaliseCharge(spec);

  const [res] = await conn.query(
    `INSERT INTO tool_allocations
       (unit_id, tool_id, contractor_id, project_id, site_id, task_id, subtask_id, requested_by, approved_by,
        procurement_request_id, previous_allocation_id, source_kind, start_date, expected_return_date, status,
        charge_policy, approved_charge_total, approved_charge_days, daily_charge_rate, unused_policy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [
      unit.id, unit.tool_id, spec.contractorId || null, spec.projectId || null, spec.siteId || null, spec.taskId || null,
      spec.taskId ? (spec.subtaskId || null) : null,
      spec.requestedBy || null, actor?.id || null, spec.procurementRequestId || null, spec.previousAllocationId || null,
      unit.ownership_type === 'rented' ? 'rented' : 'owned', startDate, expected,
      charge.policy, charge.total, charge.days, charge.rate, charge.unusedPolicy,
    ]
  );

  await conn.query(
    `UPDATE tool_units SET availability_status = 'allocated', warehouse_id = NULL,
       current_contractor_id = ?, current_project_id = ?, current_site_id = ?, current_task_id = ?
     WHERE id = ?`,
    [spec.contractorId || null, spec.projectId || null, spec.siteId || null, spec.taskId || null, unit.id]
  );
  await logEvent(conn, {
    unitId: unit.id, type: 'allocated', fromContractorId: spec.fromContractorId || null, toContractorId: spec.contractorId || null,
    projectId: spec.projectId, siteId: spec.siteId, taskId: spec.taskId, subtaskId: spec.subtaskId, allocationId: res.insertId,
    newValue: startDate, details: charge.policy !== 'none' ? `Approved charge: ${charge.policy}` : 'No usage charge', actorId: actor?.id,
  });
  return res.insertId;
}

/**
 * Closes an active allocation: counts the actual days, books the usage charge /
 * rental allocation ONCE as a project expense, frees (or maintenance-holds) the
 * unit. Idempotent by status: a returned allocation can never be closed again.
 */
async function closeAllocationInTx(conn, allocationId, opts, actor) {
  const [[a]] = await conn.query(
    `SELECT a.*, DATE_FORMAT(a.start_date,'%Y-%m-%d') AS start_d FROM tool_allocations a WHERE a.id = ? FOR UPDATE`,
    [allocationId]
  );
  if (!a) throw ApiError.notFound('That allocation does not exist.');
  if (a.status !== 'active') throw ApiError.badRequest('This allocation has already been returned.');

  const returnedDate = assertDate(opts.returnedDate || todayStr(), 'returned_date', { required: true });
  if (returnedDate < a.start_d) {
    throw ApiError.badRequest('Check the highlighted fields.', { returned_date: 'Return date cannot be before the start date.' });
  }

  const [[unit]] = await conn.query('SELECT * FROM tool_units WHERE id = ? FOR UPDATE', [a.unit_id]);
  let rentalRate = 0;
  let rental = null;
  if (unit.ownership_type === 'rented') {
    const [[r]] = await conn.query("SELECT * FROM tool_rentals WHERE unit_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1", [unit.id]);
    if (r) { rental = r; rentalRate = Number(r.rate_per_day); }
  }

  const calc = computeUsage({
    startDate: a.start_d,
    returnedDate,
    chargePolicy: a.charge_policy,
    chargeRate: Number(a.daily_charge_rate),
    chargeTotal: a.approved_charge_total != null ? Number(a.approved_charge_total) : null,
    chargeDays: a.approved_charge_days != null ? Number(a.approved_charge_days) : null,
    unusedPolicy: a.unused_policy,
    rentalRatePerDay: rentalRate,
  });

  // One project expense per allocation, never two: the actual rental cost for a
  // rented unit, otherwise the approved usage charge for an owned one. A usage
  // charge raised against the contractor on a rented unit is a RECOVERY and is
  // kept on the allocation, not booked as a second expense.
  let expenseId = null;
  const isRental = unit.ownership_type === 'rented';
  const bookedAmount = isRental ? calc.rentalCostAllocated : calc.usageCharge;
  if (bookedAmount > 0 && a.project_id) {
    const [ex] = await conn.query(
      `INSERT INTO expenses
         (expense_number, project_id, site_id, task_id, subtask_id, contractor_id, category, description, amount, expense_date,
          paid_by, party_name, payment_method, reference, status, notes, created_by, source_type, source_id, tool_unit_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'other', ?, 'approved', ?, ?, ?, ?, ?)`,
      [
        `EXP-TU-${a.id}`, a.project_id, a.site_id, a.task_id, a.subtask_id || null, a.contractor_id,
        isRental ? 'Equipment Rental' : 'Machine / Tool',
        `${isRental ? 'Rental allocation' : 'Usage charge'} - ${unit.serial_number} - ${calc.usageDays} day(s)`.slice(0, 255),
        bookedAmount, returnedDate,
        isRental ? 'Company (rental vendor)' : 'Company (owned machine)', unit.serial_number,
        `TOOL-ALLOC-${a.id}`,
        isRental
          ? `Actual rental ${rentalRate}/day x ${calc.usageDays} day(s)`
          : `Approved usage charge ${calc.dailyChargeRate}/day x ${calc.usageDays} day(s)`,
        actor?.id || null, isRental ? 'tool_rental' : 'tool_usage', a.id, unit.id,
      ]
    );
    expenseId = ex.insertId;
  }

  await conn.query(
    `UPDATE tool_allocations SET status = 'returned', returned_date = ?, usage_days = ?, daily_charge_rate = ?,
       usage_charge = ?, rental_cost_allocated = ?, unbilled_balance = ?, expense_id = ?, return_notes = ?, returned_by = ?
     WHERE id = ?`,
    [returnedDate, calc.usageDays, calc.dailyChargeRate, calc.usageCharge, calc.rentalCostAllocated, calc.unbilledBalance,
      expenseId, opts.notes ? String(opts.notes).slice(0, 255) : null, actor?.id || null, a.id]
  );

  if (rental) {
    await conn.query('UPDATE tool_rentals SET allocated_cost = allocated_cost + ? WHERE id = ?', [calc.rentalCostAllocated, rental.id]);
  }

  const nextStatus = opts.sendToMaintenance ? 'maintenance' : 'available';
  let warehouseId = opts.warehouseId || null;
  if (!warehouseId && !isRental) {
    const { central } = await warehouseModel.findScopes();
    warehouseId = central?.[0]?.id || null;
  }
  await conn.query(
    `UPDATE tool_units SET availability_status = ?, warehouse_id = ?, current_contractor_id = NULL,
       current_project_id = NULL, current_site_id = NULL, current_task_id = NULL WHERE id = ?`,
    [nextStatus, warehouseId, unit.id]
  );
  await logEvent(conn, {
    unitId: unit.id, type: 'returned', fromContractorId: a.contractor_id, projectId: a.project_id, siteId: a.site_id,
    taskId: a.task_id, subtaskId: a.subtask_id || null, allocationId: a.id, oldValue: a.start_d, newValue: returnedDate,
    amount: bookedAmount || calc.usageCharge, actorId: actor?.id,
    details: `${calc.usageDays} day(s) used; ${isRental ? `rental allocated ${calc.rentalCostAllocated}` : `usage charge ${calc.usageCharge}`}${calc.unbilledBalance ? `; unbilled ${calc.unbilledBalance}` : ''}${opts.notes ? `; ${opts.notes}` : ''}`,
  });

  if (opts.health && HEALTH_VALUES.includes(opts.health) && opts.health !== unit.health) {
    await setHealthInTx(conn, unit, opts.health, `Condition recorded on return${opts.notes ? `: ${opts.notes}` : ''}`, actor);
  }
  return { allocation: a, calc, expenseId };
}

async function setHealthInTx(conn, unit, health, notes, actor) {
  await conn.query(
    'UPDATE tool_units SET health = ?, health_updated_at = NOW(), health_updated_by = ? WHERE id = ?',
    [health, actor?.id || null, unit.id]
  );
  await logEvent(conn, {
    unitId: unit.id, type: 'health_update', oldValue: unit.health, newValue: health,
    projectId: unit.current_project_id, siteId: unit.current_site_id, taskId: unit.current_task_id,
    details: notes || null, actorId: actor?.id,
  });
}

// ---- Admin operations

async function registerUnit(payload, actor, conn = null) {
  const toolId = Number(payload.tool_id ?? payload.toolId);
  const serial = String(payload.serial_number ?? payload.serialNumber ?? '').trim().replace(/\s+/g, ' ');
  if (!serial) throw ApiError.badRequest('Check the highlighted fields.', { serial_number: 'A unique serial number is required for every physical machine.' });
  if (serial.length > 80) throw ApiError.badRequest('Check the highlighted fields.', { serial_number: 'Serial number is too long (max 80).' });
  const health = payload.health || 'good';
  if (!HEALTH_VALUES.includes(health)) throw ApiError.badRequest('Check the highlighted fields.', { health: 'Choose Excellent, Good, Average or Poor.' });
  const cost = payload.purchase_cost != null && payload.purchase_cost !== '' ? Number(payload.purchase_cost) : 0;
  if (!(cost >= 0)) throw ApiError.badRequest('Check the highlighted fields.', { purchase_cost: 'Enter a valid purchase cost.' });
  const purchaseDate = assertDate(payload.purchase_date, 'purchase_date');
  const expiryDate = assertDate(payload.expiry_date, 'expiry_date');
  if (purchaseDate && expiryDate && expiryDate < purchaseDate) {
    throw ApiError.badRequest('Check the highlighted fields.', { expiry_date: 'Expiry cannot be before the purchase date.' });
  }
  const ownership = payload.ownership_type === 'rented' ? 'rented' : 'owned';

  return withTx(async (c) => {
    const [[tool]] = await c.query('SELECT id FROM tools WHERE id = ?', [toolId]);
    if (!tool) throw ApiError.badRequest('Check the highlighted fields.', { tool_id: 'Choose a machine type.' });
    const [[dup]] = await c.query('SELECT id FROM tool_units WHERE serial_number = ?', [serial]);
    if (dup) throw ApiError.badRequest('Check the highlighted fields.', { serial_number: 'This serial number is already registered to another machine.' });
    if (payload.vendor_id) {
      const [[v]] = await c.query('SELECT id FROM vendors WHERE id = ?', [Number(payload.vendor_id)]);
      if (!v) throw ApiError.badRequest('Check the highlighted fields.', { vendor_id: 'That vendor does not exist.' });
    }
    let warehouseId = payload.warehouse_id ? Number(payload.warehouse_id) : null;
    if (!warehouseId && ownership === 'owned') {
      const { central } = await warehouseModel.findScopes();
      warehouseId = central?.[0]?.id || null;
    }
    const [res] = await c.query(
      `INSERT INTO tool_units
         (tool_id, serial_number, ownership_type, purchase_date, expiry_date, purchase_cost, vendor_id, health,
          health_updated_at, health_updated_by, warehouse_id, availability_status, procurement_request_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, 'available', ?, ?, ?)`,
      [toolId, serial, ownership, purchaseDate, expiryDate, cost, payload.vendor_id ? Number(payload.vendor_id) : null, health,
        actor?.id || null, warehouseId, payload.procurement_request_id || null,
        payload.notes ? String(payload.notes).slice(0, 255) : null, actor?.id || null]
    );
    await logEvent(c, {
      unitId: res.insertId, type: 'registered', newValue: serial, amount: cost || null,
      details: `${ownership === 'rented' ? 'Rented unit registered' : 'Registered as company asset'}${purchaseDate ? `; purchased ${purchaseDate}` : ''}`,
      actorId: actor?.id,
    });
    await logEvent(c, { unitId: res.insertId, type: 'health_update', newValue: health, details: 'Initial condition', actorId: actor?.id });
    return res.insertId;
  }, conn).then(async (id) => (conn ? id : getUnit(id)));
}

async function updateUnit(id, payload, actor) {
  return withTx(async (c) => {
    const [[unit]] = await c.query('SELECT * FROM tool_units WHERE id = ? FOR UPDATE', [id]);
    if (!unit) throw ApiError.notFound('That machine does not exist.');
    const sets = [];
    const params = [];

    if (payload.serial_number !== undefined) {
      const serial = String(payload.serial_number).trim().replace(/\s+/g, ' ');
      if (!serial) throw ApiError.badRequest('Check the highlighted fields.', { serial_number: 'Serial number cannot be blank.' });
      if (serial !== unit.serial_number) {
        const [[dup]] = await c.query('SELECT id FROM tool_units WHERE serial_number = ? AND id <> ?', [serial, id]);
        if (dup) throw ApiError.badRequest('Check the highlighted fields.', { serial_number: 'This serial number is already registered to another machine.' });
        sets.push('serial_number = ?'); params.push(serial);
        await logEvent(c, { unitId: id, type: 'serial_updated', oldValue: unit.serial_number, newValue: serial, actorId: actor?.id });
      }
    }
    if (payload.purchase_date !== undefined) { sets.push('purchase_date = ?'); params.push(assertDate(payload.purchase_date, 'purchase_date')); }
    if (payload.expiry_date !== undefined) { sets.push('expiry_date = ?'); params.push(assertDate(payload.expiry_date, 'expiry_date')); }
    if (payload.purchase_cost !== undefined) {
      if (!(Number(payload.purchase_cost) >= 0)) throw ApiError.badRequest('Check the highlighted fields.', { purchase_cost: 'Enter a valid purchase cost.' });
      sets.push('purchase_cost = ?'); params.push(Number(payload.purchase_cost));
    }
    if (payload.vendor_id !== undefined) { sets.push('vendor_id = ?'); params.push(payload.vendor_id ? Number(payload.vendor_id) : null); }
    if (payload.notes !== undefined) { sets.push('notes = ?'); params.push(payload.notes ? String(payload.notes).slice(0, 255) : null); }
    if (payload.warehouse_id !== undefined && unit.availability_status === 'available') {
      sets.push('warehouse_id = ?'); params.push(payload.warehouse_id ? Number(payload.warehouse_id) : null);
    }
    if (sets.length) await c.query(`UPDATE tool_units SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    return id;
  }).then((uid) => getUnit(uid));
}

/** Health can be updated by Admin, or by a PM for a machine on one of their projects. */
async function updateHealth(id, payload, actor, hrScope) {
  const health = payload.health;
  if (!HEALTH_VALUES.includes(health)) {
    throw ApiError.badRequest('Check the highlighted fields.', { health: 'Choose Excellent, Good, Average or Poor.' });
  }
  return withTx(async (c) => {
    const [[unit]] = await c.query('SELECT * FROM tool_units WHERE id = ? FOR UPDATE', [id]);
    if (!unit) throw ApiError.notFound('That machine does not exist.');
    if (hrScope?.role === ROLES.PROJECT_MANAGER) {
      const ids = hrScope.pmProjectIds || [];
      if (!unit.current_project_id || !ids.includes(Number(unit.current_project_id))) {
        throw ApiError.forbidden('You can only update the health of machines allocated to your assigned projects.');
      }
    } else if (actor?.role !== ROLES.ADMIN) {
      throw ApiError.forbidden('Only Admin or an authorised Project Manager can update machine health.');
    }
    await setHealthInTx(c, unit, health, payload.notes ? String(payload.notes).slice(0, 480) : null, actor);
    if (health === 'poor' && unit.availability_status === 'available' && payload.send_to_maintenance) {
      await c.query("UPDATE tool_units SET availability_status = 'maintenance' WHERE id = ?", [id]);
      await logEvent(c, { unitId: id, type: 'maintenance', oldValue: 'available', newValue: 'maintenance', details: 'Held after poor health report', actorId: actor?.id });
    }
    return id;
  }).then((uid) => getUnit(uid, hrScope));
}

async function setAvailability(id, payload, actor) {
  const action = payload.action;
  return withTx(async (c) => {
    const [[unit]] = await c.query('SELECT * FROM tool_units WHERE id = ? FOR UPDATE', [id]);
    if (!unit) throw ApiError.notFound('That machine does not exist.');
    let next;
    if (action === 'start_maintenance' && unit.availability_status === 'available') next = 'maintenance';
    else if (action === 'end_maintenance' && unit.availability_status === 'maintenance') next = 'available';
    else if (action === 'retire' && ['available', 'maintenance'].includes(unit.availability_status)) next = 'retired';
    else if (action === 'reinstate' && unit.availability_status === 'retired' && unit.ownership_type === 'owned') next = 'available';
    else throw ApiError.badRequest(`Cannot ${String(action).replace('_', ' ')} a machine that is ${unit.availability_status}.`);
    await c.query('UPDATE tool_units SET availability_status = ? WHERE id = ?', [next, id]);
    await logEvent(c, {
      unitId: id, type: next === 'retired' ? 'status_change' : 'maintenance', oldValue: unit.availability_status, newValue: next,
      details: payload.notes || null, actorId: actor?.id,
    });
    return id;
  }).then((uid) => getUnit(uid));
}

async function allocate(payload, actor) {
  const unitId = Number(payload.unit_id ?? payload.unitId);
  const id = await withTx((c) => allocateInTx(c, {
    unitId,
    contractorId: payload.contractor_id ? Number(payload.contractor_id) : null,
    projectId: payload.project_id ? Number(payload.project_id) : null,
    siteId: payload.site_id ? Number(payload.site_id) : null,
    taskId: payload.task_id ? Number(payload.task_id) : null,
    subtaskId: payload.subtask_id ? Number(payload.subtask_id) : null,
    startDate: payload.start_date,
    expectedReturnDate: payload.expected_return_date,
    chargePolicy: payload.charge_policy,
    chargeRate: payload.usage_charge_rate,
    chargeTotal: payload.usage_charge_total,
    chargeDays: payload.usage_charge_days,
    unusedPolicy: payload.unused_policy,
    requestedBy: payload.requested_by || actor?.id,
    procurementRequestId: payload.procurement_request_id || null,
  }, actor));
  const [rows] = await pool.query(`${ALLOC_SELECT} WHERE a.id = ?`, [id]);
  return mapAllocation(rows[0]);
}

/** Who may return an allocation: Admin, the PM of its project, or the holding contractor. */
function assertCanReturn(allocationRow, actor, hrScope) {
  if (actor?.role === ROLES.ADMIN) return;
  if (hrScope?.role === ROLES.PROJECT_MANAGER) {
    if ((hrScope.pmProjectIds || []).includes(Number(allocationRow.project_id))) return;
    throw ApiError.forbidden('You can only return machines allocated to your assigned projects.');
  }
  if (hrScope?.role === ROLES.CONTRACTOR && Number(allocationRow.contractor_id) === Number(hrScope.contractorId)) return;
  throw ApiError.forbidden('You cannot return this machine.');
}

async function returnAllocation(allocationId, payload, actor, hrScope) {
  const out = await withTx(async (c) => {
    const [[a]] = await c.query('SELECT * FROM tool_allocations WHERE id = ?', [allocationId]);
    if (!a) throw ApiError.notFound('That allocation does not exist.');
    assertCanReturn(a, actor, hrScope);
    // Only Admin/PM may record the condition or hold the unit for maintenance.
    const canJudge = actor?.role === ROLES.ADMIN || hrScope?.role === ROLES.PROJECT_MANAGER;
    const result = await closeAllocationInTx(c, allocationId, {
      returnedDate: payload.returned_date,
      notes: payload.notes,
      health: canJudge ? payload.health : undefined,
      sendToMaintenance: canJudge ? Boolean(payload.send_to_maintenance) : false,
      warehouseId: payload.warehouse_id ? Number(payload.warehouse_id) : null,
    }, actor);
    // Rented units go back to the vendor with their last allocation unless told otherwise.
    if (payload.end_rental && actor?.role === ROLES.ADMIN) {
      await closeRentalInTx(c, a.unit_id, payload.returned_date || todayStr(), actor);
    }
    return result;
  });
  const [rows] = await pool.query(`${ALLOC_SELECT} WHERE a.id = ?`, [allocationId]);
  return mapAllocation(rows[0]);
}

/** Admin-approved change of the usage charge while a machine is out. */
async function setCharge(allocationId, payload, actor) {
  await withTx(async (c) => {
    const [[a]] = await c.query('SELECT * FROM tool_allocations WHERE id = ? FOR UPDATE', [allocationId]);
    if (!a) throw ApiError.notFound('That allocation does not exist.');
    if (a.status !== 'active') throw ApiError.badRequest('The charge can only be changed while the machine is allocated.');
    const charge = normaliseCharge({
      chargePolicy: payload.charge_policy,
      chargeRate: payload.usage_charge_rate,
      chargeTotal: payload.usage_charge_total,
      chargeDays: payload.usage_charge_days,
      unusedPolicy: payload.unused_policy,
    });
    await c.query(
      `UPDATE tool_allocations SET charge_policy = ?, approved_charge_total = ?, approved_charge_days = ?,
         daily_charge_rate = ?, unused_policy = ?, approved_by = ? WHERE id = ?`,
      [charge.policy, charge.total, charge.days, charge.rate, charge.unusedPolicy, actor?.id || null, allocationId]
    );
    await logEvent(c, { unitId: a.unit_id, type: 'charge_updated', allocationId, newValue: charge.policy, amount: charge.total, details: `Approved daily charge ${charge.rate}`, actorId: actor?.id });
  });
  const [rows] = await pool.query(`${ALLOC_SELECT} WHERE a.id = ?`, [allocationId]);
  return mapAllocation(rows[0]);
}

/**
 * Reassignment: the current holder's last day is closed out and the machine goes
 * to the new Contractor/Project/Site/Task in ONE transaction. The new holder's
 * first day must come after the previous holder's last day, so no day is
 * charged to both.
 */
async function transferUnit(unitId, payload, actor, conn = null) {
  const newAllocationId = await withTx(async (c) => {
    const [[unit]] = await c.query('SELECT * FROM tool_units WHERE id = ? FOR UPDATE', [unitId]);
    if (!unit) throw ApiError.notFound('That machine does not exist.');
    const [[current]] = await c.query("SELECT * FROM tool_allocations WHERE unit_id = ? AND status = 'active' LIMIT 1 FOR UPDATE", [unitId]);
    if (!current) throw ApiError.badRequest(`Serial ${unit.serial_number} is not currently allocated, so there is nothing to reassign. Allocate it directly.`);
    if (!payload.contractor_id && !payload.project_id) {
      throw ApiError.badRequest('Check the highlighted fields.', { contractor_id: 'Choose the contractor/project the machine is moving to.' });
    }
    const returnDate = assertDate(payload.return_date || todayStr(), 'return_date', { required: true });
    const newStart = assertDate(payload.start_date || addDays(returnDate, 1), 'start_date', { required: true });
    if (newStart <= returnDate) {
      throw ApiError.badRequest('Check the highlighted fields.', { start_date: 'The new holder must start after the previous holder\'s last day, so no day is charged twice.' });
    }
    const closed = await closeAllocationInTx(c, current.id, {
      returnedDate: returnDate,
      notes: `Reassigned${payload.notes ? `: ${payload.notes}` : ''}`,
      health: payload.health,
      keepOut: true,
    }, actor);
    const nid = await allocateInTx(c, {
      unitId,
      contractorId: payload.contractor_id ? Number(payload.contractor_id) : null,
      projectId: payload.project_id ? Number(payload.project_id) : null,
      siteId: payload.site_id ? Number(payload.site_id) : null,
      taskId: payload.task_id ? Number(payload.task_id) : null,
      subtaskId: payload.subtask_id ? Number(payload.subtask_id) : null,
      startDate: newStart,
      expectedReturnDate: payload.expected_return_date,
      chargePolicy: payload.charge_policy,
      chargeRate: payload.usage_charge_rate,
      chargeTotal: payload.usage_charge_total,
      chargeDays: payload.usage_charge_days,
      unusedPolicy: payload.unused_policy,
      requestedBy: payload.requested_by || null,
      procurementRequestId: payload.procurement_request_id || null,
      previousAllocationId: current.id,
      fromContractorId: current.contractor_id,
    }, actor);
    await logEvent(c, {
      unitId, type: 'transferred', fromContractorId: current.contractor_id, toContractorId: payload.contractor_id || null,
      projectId: payload.project_id || null, siteId: payload.site_id || null, taskId: payload.task_id || null,
      subtaskId: payload.subtask_id || null, allocationId: nid, details: `Previous holder used ${closed.calc.usageDays} day(s), charge ${closed.calc.usageCharge}`, actorId: actor?.id,
    });
    return nid;
  }, conn);
  const [rows] = await pool.query(`${ALLOC_SELECT} WHERE a.id = ?`, [newAllocationId]);
  return conn ? newAllocationId : mapAllocation(rows[0]);
}

// ---- Rentals

async function registerRentalInTx(c, spec, actor) {
  const startDate = assertDate(spec.rentalStartDate, 'rental_start_date', { required: true });
  const expected = assertDate(spec.expectedReturnDate, 'expected_return_date');
  if (expected && expected < startDate) {
    throw ApiError.badRequest('Check the highlighted fields.', { expected_return_date: 'Expected return cannot be before the rental start.' });
  }
  const rate = Number(spec.ratePerDay);
  if (!(rate > 0)) throw ApiError.badRequest('Check the highlighted fields.', { rental_cost: 'Enter the actual rental rate per day.' });
  if (!spec.vendorId) throw ApiError.badRequest('Check the highlighted fields.', { vendor_id: 'Select the rental vendor.' });

  const unitId = await registerUnit({
    tool_id: spec.toolId, serial_number: spec.serialNumber, ownership_type: 'rented', health: spec.health || 'good',
    vendor_id: spec.vendorId, purchase_cost: 0, purchase_date: startDate, procurement_request_id: spec.procurementRequestId || null,
    notes: 'Rented from vendor',
  }, actor, c);

  const plannedDays = expected ? daysInclusive(startDate, expected) : null;
  const plannedCost = plannedDays ? r2(rate * plannedDays) : 0;
  const [res] = await c.query(
    `INSERT INTO tool_rentals
       (unit_id, tool_id, vendor_id, rate_per_day, rental_start_date, expected_return_date, planned_days, planned_cost,
        project_id, site_id, task_id, subtask_id, procurement_request_id, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [unitId, spec.toolId, spec.vendorId, rate, startDate, expected, plannedDays, plannedCost,
      spec.projectId || null, spec.siteId || null, spec.taskId || null, spec.taskId ? (spec.subtaskId || null) : null,
      spec.procurementRequestId || null, actor?.id || null]
  );
  await logEvent(c, {
    unitId, type: 'rental_started', newValue: String(rate), amount: plannedCost || null,
    projectId: spec.projectId, siteId: spec.siteId, taskId: spec.taskId, subtaskId: spec.subtaskId,
    details: `Rate ${rate}/day from ${startDate}${expected ? ` to ${expected} (${plannedDays} day(s), ${plannedCost})` : ''}`, actorId: actor?.id,
  });
  return { unitId, rentalId: res.insertId, plannedCost, plannedDays };
}

async function closeRentalInTx(c, unitId, actualReturnDate, actor) {
  const [[rental]] = await c.query("SELECT * FROM tool_rentals WHERE unit_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1 FOR UPDATE", [unitId]);
  if (!rental) throw ApiError.badRequest('This machine has no active rental to close.');
  const [[unit]] = await c.query('SELECT * FROM tool_units WHERE id = ? FOR UPDATE', [unitId]);
  if (unit.availability_status === 'allocated') {
    throw ApiError.badRequest('Return the machine from its current holder before ending the rental.');
  }
  const ret = assertDate(actualReturnDate || todayStr(), 'actual_return_date', { required: true });
  const [[r]] = await c.query("SELECT DATE_FORMAT(rental_start_date,'%Y-%m-%d') AS s FROM tool_rentals WHERE id = ?", [rental.id]);
  if (ret < r.s) throw ApiError.badRequest('Check the highlighted fields.', { actual_return_date: 'Return cannot be before the rental start.' });
  const rentalDays = daysInclusive(r.s, ret);
  const total = r2(Number(rental.rate_per_day) * rentalDays);
  await c.query(
    "UPDATE tool_rentals SET status = 'returned', actual_return_date = ?, total_cost = ? WHERE id = ?",
    [ret, total, rental.id]
  );
  await c.query(
    `UPDATE tool_units SET availability_status = 'retired', warehouse_id = NULL, current_contractor_id = NULL,
       current_project_id = NULL, current_site_id = NULL, current_task_id = NULL WHERE id = ?`,
    [unitId]
  );
  // Make the vendor payable reflect the ACTUAL rent, not the planned figure.
  if (rental.procurement_request_id) {
    await c.query(
      `UPDATE procurement_requests SET total_amount = ?, rental_days = ?, rental_end_date = ?,
         amount_due = GREATEST(? - COALESCE(amount_paid, 0), 0) WHERE id = ?`,
      [total, rentalDays, ret, total, rental.procurement_request_id]
    );
  }
  const unallocated = r2(total - Number(rental.allocated_cost || 0));
  await logEvent(c, {
    unitId, type: 'rental_returned', oldValue: r.s, newValue: ret, amount: total,
    details: `Rental ${rentalDays} day(s) @ ${rental.rate_per_day} = ${total}; allocated to work ${rental.allocated_cost}; idle/unallocated ${unallocated}`,
    actorId: actor?.id,
  });
  return { total, rentalDays, unallocated };
}

async function returnRental(unitId, payload, actor) {
  const out = await withTx((c) => closeRentalInTx(c, Number(unitId), payload.actual_return_date, actor));
  return { ...out, unit: (await getUnit(unitId)).unit };
}

async function listRentals(query = {}) {
  const where = [];
  const params = [];
  if (query.status && query.status !== 'all') { where.push('r.status = ?'); params.push(query.status); }
  const [rows] = await pool.query(
    `SELECT r.*, DATE_FORMAT(r.rental_start_date,'%Y-%m-%d') AS start_d, DATE_FORMAT(r.expected_return_date,'%Y-%m-%d') AS expected_d,
            DATE_FORMAT(r.actual_return_date,'%Y-%m-%d') AS actual_d, v.name AS vendor_name, u.serial_number, t.name AS tool_name
     FROM tool_rentals r
     JOIN tool_units u ON u.id = r.unit_id
     JOIN tools t ON t.id = r.tool_id
     LEFT JOIN vendors v ON v.id = r.vendor_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.id DESC LIMIT 200`,
    params
  );
  return { rentals: rows.map((r) => ({ ...mapRental(r), serialNumber: r.serial_number, toolName: r.tool_name })) };
}

// ---- Procurement hand-off

/** Tell every Admin a machine was requested while none was free, and who holds them. */
async function notifyUnavailable({ tool, request, availability, requesterName }) {
  const holders = (availability.holders || [])
    .map((h) => `${h.serialNumber} - ${h.contractor?.name || 'unassigned'}${h.project ? ` (${h.project.name}${h.site ? ` / ${h.site.name}` : ''})` : ''}`)
    .join('; ');
  await notificationModel.create({
    role: 'admin',
    title: `Machine unavailable: ${tool.name}`,
    message: `${requesterName || 'A user'} requested ${tool.name} (${request.requestNumber}) but no unit is free (${availability.available} of ${availability.total} available). Currently with: ${holders || 'no registered units'}. Approve, reject, or authorise a reassignment.`,
    type: 'warning',
    category: 'procurement',
    actionUrl: `/admin/procurement/${request.id}`,
  }).catch(() => {});
}

module.exports = {
  HEALTH_VALUES, AVAILABILITY_VALUES, CHARGE_POLICIES, UNUSED_POLICIES,
  computeUsage, daysInclusive, addDays,
  listUnits, getUnit, availabilityForTool, listAllocations, listRentals,
  registerUnit, updateUnit, updateHealth, setAvailability,
  allocate, returnAllocation, setCharge, transferUnit, returnRental,
  // used inside procurement transactions
  withTx, allocateInTx, registerRentalInTx, notifyUnavailable, mapUnit, loadUnitRow,
};
