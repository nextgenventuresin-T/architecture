'use strict';

const ApiError = require('../utils/ApiError');
const fs = require('fs');
const { ROLES } = require('../config/roles');
const { pool } = require('../config/db');
const financeModel = require('../models/financeModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');
const contractorModel = require('../models/contractorModel');
const warehouseModel = require('../models/warehouseModel');
const warehouseService = require('./warehouseService');
const materialModel = require('../models/materialModel');
const dailyWorkModel = require('../models/dailyWorkModel');
const { getConsumptionUnitCost } = require('../utils/materialPricing');
const { PROJECT_PHASES_DEF } = require('../config/projectPhases');
const { resolveSubtask, subtaskIdFrom } = require('./subtaskLink');

const EXPENSE_STATUSES = ['pending', 'approved', 'paid', 'rejected', 'cancelled'];

/**
 * Categories offered by the UI. The list is a superset of the values already
 * in the database — existing rows use material/labour/contractor/equipment/
 * overhead/other, and those stay valid so no historical expense is orphaned.
 */
const CONTRACTOR_EXPENSE_CATEGORIES = [
  'Material Consumption',
  'Local Conveyance',
  'Meal / Food',
  'Vehicle Running',
  'Accommodation',
  'Repairs & Maintenance',
  'Site Consumables',
  'Site Expense',
  'Loading',
  'Unloading',
  'Freight',
  'Advance Wages',
  'Printing & Stationery',
  'Invoice Payment',
  'Travelling',
  'Room Rent',
  'Head Office',
  'Site Visit',
  'Safety Items',
  'Labour Room Rent',
  'Notary & Stamp Paper',
  'BOQ Material',
  'Consumable Material',
  'Labour Expense',
  'Labour Conveyance',
];

const LEGACY_EXPENSE_CATEGORIES = [
  'material', 'labour', 'contractor', 'transport', 'equipment',
  'site', 'office', 'overhead', 'other',
];

const EXPENSE_CATEGORIES = [
  ...CONTRACTOR_EXPENSE_CATEGORIES,
  ...LEGACY_EXPENSE_CATEGORIES,
];

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'upi', 'card', 'other'];

const PAYMENT_TYPES = ['expense', 'contractor', 'procurement'];

/**
 * Allowed next statuses. An expense that has been paid is a settled record;
 * moving it onwards would misstate money that has already left the account.
 */
const STATUS_TRANSITIONS = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['paid', 'rejected', 'cancelled'],
  paid: [],
  rejected: [],
  cancelled: [],
};

const today = () => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ shaping

function toExpense(row) {
  if (!row) return null;
  return {
    id: row.id,
    expenseNumber: row.expense_number,
    project: { id: row.project_id, name: row.project_name, code: row.project_code },
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    contractor: row.contractor_id ? { id: row.contractor_id, name: row.contractor_name } : null,
    task: row.task_id ? { id: row.task_id, name: row.task_name || null } : null,
    subtask: row.subtask_id ? { id: row.subtask_id, name: row.subtask_name || null } : null,
    category: row.category,
    description: row.description,
    amount: Number(row.amount || 0),
    date: row.expense_date,
    paidBy: row.paid_by,
    partyName: row.party_name,
    paymentMethod: row.payment_method,
    reference: row.reference,
    billFile: row.bill_file_path
      ? {
          name: row.bill_file_name,
          type: row.bill_file_type,
          size: row.bill_file_size != null ? Number(row.bill_file_size) : null,
          uploadedAt: row.bill_uploaded_at || null,
        }
      : null,
    status: row.status,
    notes: row.notes,
    requiresProjectHeadApproval: ['Room Rent', 'Labour Room Rent'].includes(row.category),
    createdBy: row.created_by ? { id: row.created_by, name: row.created_by_name } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toContractorPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    contractor: {
      id: row.contractor_id,
      name: row.contractor_name,
      contactPerson: row.contact_person,
      phone: row.contractor_phone,
    },
    project: { id: row.project_id, name: row.project_name, code: row.project_code },
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    paymentReference: row.payment_reference,
    contractValue: Number(row.contract_value || 0),
    paidAmount: Number(row.paid_amount || 0),
    outstanding: Number(row.outstanding || 0),
    paymentDate: row.payment_date,
    status: row.payment_status,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

function toProcurementFinance(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestNumber: row.request_number,
    poNumber: row.po_number,
    project: { id: row.project_id, name: row.project_name, code: row.project_code },
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    material: { id: row.material_id, name: row.material_name, category: row.material_category },
    supplier: row.supplier,
    quantity: Number(row.quantity || 0),
    orderedQuantity: row.ordered_quantity === null ? null : Number(row.ordered_quantity),
    receivedQuantity: Number(row.received_quantity || 0),
    unit: row.unit,
    rate: Number(row.estimated_rate || 0),
    estimatedAmount: Number(row.estimated_amount || 0),
    orderedAmount: Number(row.ordered_amount || 0),
    receivedAmount: Number(row.received_amount || 0),
    status: row.status,
    orderDate: row.order_date,
    requiredDate: row.required_date,
  };
}

function toPaymentRow(row) {
  if (!row) return null;
  return {
    key: row.row_key,
    type: row.payment_type,
    reference: row.reference,
    project: row.project_id ? { id: row.project_id, name: row.project_name } : null,
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    party: row.party,
    detail: row.detail,
    amount: Number(row.amount || 0),
    date: row.payment_date,
    status: row.status,
    notes: row.notes,
  };
}

/**
 * Shared budget arithmetic, so the dashboard, project list and project detail
 * can never produce different answers for the same project.
 *
 *   Total spent      = procurement + contractor payments + labour cost + other expenses
 *   Remaining budget = budget - total spent
 */
function toProjectFinancials(row) {
  const budget = Number(row.budget || 0);
  const procurementCost = Number(row.procurement_cost || 0);
  const materialConsumptionCost = Number(row.material_consumption_cost || 0);
  const contractorPayments = Number(row.contractor_paid || 0);
  const labourCost = Number(row.labour_cost || 0);
  const otherExpenses = Number(row.other_expenses || 0);
  // Formula: Material Cost + Labour Cost + Contractor Payments + Other Expenses = Total Project Spend
  const totalSpent = materialConsumptionCost + labourCost + contractorPayments + otherExpenses;

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    budget,
    procurementCost,
    materialConsumptionCost,
    contractorPayments,
    contractorContractValue: Number(row.contractor_contract_value || 0),
    labourCost,
    otherExpenses,
    allExpenses: Number(row.all_expenses || 0),
    totalSpent,
    remainingBudget: budget - totalSpent,
    // Guarded against a zero budget so the bar never divides by zero.
    utilisation: budget > 0 ? Math.round((totalSpent / budget) * 100) : null,
    isOverBudget: budget > 0 && totalSpent > budget,
  };
}

// ---------------------------------------------------------------- dashboard

async function getSummary() {
  const [{ budgets, expenses, contractors, procurement, labour }, byCategory] = await Promise.all([
    financeModel.findSummary(),
    financeModel.findExpenseByCategory(),
  ]);

  const totalBudget = Number(budgets.total_budget || 0);
  const totalExpenses = Number(expenses.total || 0);
  const contractorPayments = Number(contractors.paid || 0);
  const procurementValue = Number(procurement.committed_value || 0);
  const labourCost = Number(labour.labour_cost || 0);

  // Mirrors findProjectFinancials: material and contractor expense categories
  // are already represented by the procurement and contractor figures, so only
  // the remaining categories are added on top.
  const otherExpenses = byCategory
    .filter((row) => !['material', 'contractor'].includes(row.category))
    .reduce((sum, row) => sum + Number(row.total || 0), 0);

  const totalSpent = procurementValue + contractorPayments + labourCost + otherExpenses;

  return {
    totalProjectBudget: totalBudget,
    totalExpenses,
    contractorPayments,
    contractorContractValue: Number(contractors.contract_value || 0),
    procurementValue,
    procurementReceivedValue: Number(procurement.received_value || 0),
    labourCost,
    paidAmount: Number(expenses.paid || 0) + contractorPayments,
    pendingPayments: Number(expenses.pending || 0),
    outstandingAmount: Number(contractors.outstanding || 0),
    totalSpent,
    remainingBudget: totalBudget - totalSpent,
    counts: {
      projects: Number(budgets.project_count || 0),
      expenses: Number(expenses.count_all || 0),
      pendingExpenses: Number(expenses.pending_count || 0),
      contractorPayments: Number(contractors.count_all || 0),
      procurementRequests: Number(procurement.count_all || 0),
      labourRecords: Number(labour.count_all || 0),
    },
    expensesByCategory: byCategory.map((row) => ({
      category: row.category,
      total: Number(row.total || 0),
      count: Number(row.count_all || 0),
    })),
  };
}

// ----------------------------------------------------------------- expenses

async function listExpenses(query, hrScope) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));

  const contractorId = hrScope?.role === ROLES.CONTRACTOR
    ? Number(hrScope.contractorId)
    : (query.contractorId && query.contractorId !== 'all' ? Number(query.contractorId) : undefined);

  const { rows, total, filteredAmount } = await financeModel.findExpenses({
    ...query,
    contractorId,
    page,
    pageSize,
  });

  return {
    expenses: rows.map(toExpense),
    filteredAmount,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getExpense(id, hrScope) {
  const row = await financeModel.findExpenseById(id);
  if (!row) throw ApiError.notFound('That expense does not exist.');
  if (hrScope?.role === ROLES.CONTRACTOR && Number(row.contractor_id) !== Number(hrScope.contractorId)) {
    throw ApiError.notFound('That expense does not exist.');
  }
  return toExpense(row);
}

async function generateExpenseNumber() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `EXP-${String((await financeModel.nextExpenseNumber()) + attempt).padStart(4, '0')}`;
    if (!(await financeModel.findExpenseByNumber(candidate))) return candidate;
  }
  throw ApiError.badRequest('Could not generate an expense number. Enter one manually.');
}

/** Confirms project/site exist and that the site belongs to the project. */
async function assertRelationships({ project_id, site_id }) {
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

  return project;
}

/** Confirms project and site are assigned to the contractor. */
async function assertContractorProjectSite(contractorId, projectId, siteId) {
  const cId = Number(contractorId);
  const project = await projectModel.findById(projectId);
  if (!project) {
    throw ApiError.badRequest('Check the highlighted fields.', { project_id: 'That project does not exist.' });
  }

  const sites = await projectModel.findRelated(projectId, 'sites');
  const isAssignedProject = Number(project.contractor_id) === cId || sites.some((s) => Number(s.contractor_id) === cId);
  if (!isAssignedProject) {
    throw ApiError.badRequest('Check the highlighted fields.', { project_id: 'You are only allowed to raise expenses for your assigned projects.' });
  }

  if (siteId) {
    const site = sites.find((s) => Number(s.id) === Number(siteId));
    if (!site) {
      throw ApiError.badRequest('Check the highlighted fields.', { site_id: 'That site does not exist under this project.' });
    }
    const isAssignedSite = Number(site.contractor_id) === cId || (!site.contractor_id && Number(project.contractor_id) === cId);
    if (!isAssignedSite) {
      throw ApiError.badRequest('Check the highlighted fields.', { site_id: 'You are only allowed to raise expenses for your assigned sites.' });
    }
  }
}

function assertAmount(amount) {
  const value = Number(amount);
  if (!(value > 0)) {
    throw ApiError.badRequest('Check the highlighted fields.', { amount: 'Enter an amount greater than zero.' });
  }
  return value;
}

async function createExpense(payload, userId, hrScope, file) {
  const isContractor = hrScope?.role === ROLES.CONTRACTOR;
  const contractorId = isContractor
    ? Number(hrScope.contractorId)
    : (payload.contractor_id ? Number(payload.contractor_id) : null);

  if (isContractor) {
    if (!payload.project_id) {
      throw ApiError.badRequest('Check the highlighted fields.', { project_id: 'Select an assigned project.' });
    }
    await assertContractorProjectSite(contractorId, payload.project_id, payload.site_id);
  } else {
    await assertRelationships(payload);
  }

  const amount = assertAmount(payload.amount);
  const description = (payload.description || payload.remarks || payload.category || '').trim();
  if (!description) {
    throw ApiError.badRequest('Check the highlighted fields.', { description: 'Enter a description / remarks.' });
  }

  const category = EXPENSE_CATEGORIES.includes(payload.category) ? payload.category : 'other';

  // Optional Main Task / Subtask the expense is spent on.
  const expenseTaskId = payload.task_id ? Number(payload.task_id) : null;
  if (expenseTaskId) {
    const [[t]] = await pool.query('SELECT id, project_id, site_id FROM project_tasks WHERE id = ?', [expenseTaskId]);
    if (!t || Number(t.project_id) !== Number(payload.project_id)) {
      throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'That task does not belong to the selected project.' });
    }
    if (payload.site_id && t.site_id && Number(t.site_id) !== Number(payload.site_id)) {
      throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'That task does not belong to the selected site.' });
    }
  }
  const expenseSubtask = await resolveSubtask(expenseTaskId, subtaskIdFrom(payload));

  // Invoice Payment requires Party Name
  if (category === 'Invoice Payment') {
    const partyName = (payload.party_name || payload.paid_by || '').trim();
    if (!partyName) {
      throw ApiError.badRequest('Check the highlighted fields.', { party_name: 'Party Name is required for Invoice Payment.' });
    }
  }

  const status = isContractor
    ? 'pending'
    : (payload.status && EXPENSE_STATUSES.includes(payload.status) ? payload.status : 'pending');

  const expenseNumber = payload.expense_number?.trim() || (await generateExpenseNumber());
  if (await financeModel.findExpenseByNumber(expenseNumber)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      expense_number: 'That expense number is already in use.',
    });
  }

  const id = await financeModel.createExpense({
    expense_number: expenseNumber,
    project_id: payload.project_id,
    site_id: payload.site_id ?? null,
    contractor_id: contractorId ?? null,
    category,
    description,
    amount,
    expense_date: payload.expense_date || today(),
    paid_by: payload.paid_by?.trim() || null,
    party_name: payload.party_name?.trim() || null,
    payment_method: PAYMENT_METHODS.includes(payload.payment_method) ? payload.payment_method : null,
    reference: payload.reference?.trim() || null,
    bill_file_path: file ? file.path : null,
    bill_file_name: file ? file.originalname : null,
    bill_file_type: file ? file.mimetype : null,
    bill_file_size: file ? file.size : null,
    bill_uploaded_at: file ? new Date() : null,
    status,
    notes: (payload.remarks || payload.notes || '').trim() || null,
    created_by: userId ?? null,
    task_id: expenseTaskId,
    subtask_id: expenseSubtask ? expenseSubtask.id : null,
  });

  return getExpense(id, hrScope);
}

async function updateExpense(id, payload, hrScope) {
  const existing = await financeModel.findRawExpenseById(id);
  if (!existing) throw ApiError.notFound('That expense does not exist.');

  if (hrScope?.role === ROLES.CONTRACTOR && Number(existing.contractor_id) !== Number(hrScope.contractorId)) {
    throw ApiError.forbidden('You can only edit your own expenses.');
  }

  // A settled expense is a financial record, not a draft. Editing the amount
  // after payment would misstate what actually left the account.
  if (['paid', 'cancelled'].includes(existing.status)) {
    throw ApiError.badRequest(`An expense that is already ${existing.status} can no longer be edited.`);
  }

  if (payload.project_id || payload.site_id !== undefined) {
    if (hrScope?.role === ROLES.CONTRACTOR) {
      await assertContractorProjectSite(
        hrScope.contractorId,
        payload.project_id ?? existing.project_id,
        payload.site_id !== undefined ? payload.site_id : existing.site_id
      );
    } else {
      await assertRelationships({
        project_id: payload.project_id ?? existing.project_id,
        site_id: payload.site_id !== undefined ? payload.site_id : existing.site_id,
      });
    }
  }

  if (payload.amount !== undefined) assertAmount(payload.amount);

  if (payload.category !== undefined && !EXPENSE_CATEGORIES.includes(payload.category)) {
    throw ApiError.badRequest('Check the highlighted fields.', { category: 'Choose a valid category.' });
  }

  if (payload.category === 'Invoice Payment') {
    const partyName = (payload.party_name || payload.paid_by || existing.party_name || existing.paid_by || '').trim();
    if (!partyName) {
      throw ApiError.badRequest('Check the highlighted fields.', { party_name: 'Party Name is required for Invoice Payment.' });
    }
  }

  if (payload.payment_method !== undefined && payload.payment_method
      && !PAYMENT_METHODS.includes(payload.payment_method)) {
    throw ApiError.badRequest('Check the highlighted fields.', { payment_method: 'Choose a valid payment method.' });
  }

  await financeModel.updateExpense(id, {
    ...(payload.project_id !== undefined && { project_id: payload.project_id }),
    ...(payload.site_id !== undefined && { site_id: payload.site_id ?? null }),
    ...(payload.category !== undefined && { category: payload.category }),
    ...(payload.description !== undefined && { description: payload.description.trim() }),
    ...(payload.amount !== undefined && { amount: payload.amount }),
    ...(payload.expense_date !== undefined && { expense_date: payload.expense_date }),
    ...(payload.paid_by !== undefined && { paid_by: payload.paid_by?.trim() || null }),
    ...(payload.party_name !== undefined && { party_name: payload.party_name?.trim() || null }),
    ...(payload.payment_method !== undefined && { payment_method: payload.payment_method || null }),
    ...(payload.reference !== undefined && { reference: payload.reference?.trim() || null }),
    ...(payload.notes !== undefined && { notes: payload.notes?.trim() || null }),
  });

  return getExpense(id, hrScope);
}

async function updateExpenseStatus(id, nextStatus) {
  if (!EXPENSE_STATUSES.includes(nextStatus)) {
    throw ApiError.badRequest('Check the highlighted fields.', { status: 'Choose a valid status.' });
  }

  const existing = await financeModel.findRawExpenseById(id);
  if (!existing) throw ApiError.notFound('That expense does not exist.');

  // Room Rent requires Project Head approval before payment
  if (['Room Rent', 'Labour Room Rent'].includes(existing.category) && existing.status === 'pending' && nextStatus === 'paid') {
    throw ApiError.badRequest('Room Rent requires Project Head approval before acceptance/payment.');
  }

  const allowed = STATUS_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw ApiError.badRequest(
      `An expense that is ${existing.status} cannot move to ${nextStatus}.`
    );
  }

  await financeModel.updateExpenseStatus(id, nextStatus);
  return getExpense(id);
}

async function attachBill(id, file, hrScope, userId) {
  if (!file) throw ApiError.badRequest('Select a bill file to upload.');
  const row = await financeModel.findRawExpenseById(id);
  if (!row) throw ApiError.notFound('That expense does not exist.');
  if (hrScope?.role === ROLES.CONTRACTOR && Number(row.contractor_id) !== Number(hrScope.contractorId)) {
    throw ApiError.forbidden('You can only attach bills to your own expenses.');
  }
  await financeModel.updateExpense(id, {
    bill_file_path: file.path,
    bill_file_name: file.originalname,
    bill_file_type: file.mimetype,
    bill_file_size: file.size,
    bill_uploaded_at: new Date(),
  });
  return getExpense(id, hrScope);
}

async function getBillFile(id, hrScope, userId) {
  const row = await financeModel.findRawExpenseById(id);
  if (!row || !row.bill_file_path) throw ApiError.notFound('No bill file attached to this expense.');
  if (hrScope?.role === ROLES.CONTRACTOR && Number(row.contractor_id) !== Number(hrScope.contractorId)) {
    throw ApiError.forbidden('You can only view bills for your own expenses.');
  }
  if (!fs.existsSync(row.bill_file_path)) {
    throw ApiError.notFound('Bill file not found on disk.');
  }
  return {
    absolutePath: row.bill_file_path,
    fileName: row.bill_file_name || 'bill',
    mimeType: row.bill_file_type || 'application/octet-stream',
  };
}

// ------------------------------------------------------ contractor payments

async function listContractorPayments(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));

  const { rows, total } = await financeModel.findContractorPayments({ ...query, page, pageSize });

  const payments = rows.map(toContractorPayment);

  return {
    payments,
    totals: {
      contractValue: payments.reduce((sum, p) => sum + p.contractValue, 0),
      paidAmount: payments.reduce((sum, p) => sum + p.paidAmount, 0),
      outstanding: payments.reduce((sum, p) => sum + p.outstanding, 0),
    },
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getContractorPayment(id) {
  const row = await financeModel.findContractorPaymentById(id);
  if (!row) throw ApiError.notFound('That contractor payment does not exist.');
  return toContractorPayment(row);
}

// ----------------------------------------------------- procurement finance

async function listProcurementFinance(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));

  const { rows, total } = await financeModel.findProcurementFinance({ ...query, page, pageSize });
  const items = rows.map(toProcurementFinance);

  return {
    procurement: items,
    totals: {
      estimated: items.reduce((sum, i) => sum + i.estimatedAmount, 0),
      ordered: items.reduce((sum, i) => sum + i.orderedAmount, 0),
      received: items.reduce((sum, i) => sum + i.receivedAmount, 0),
    },
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

// ------------------------------------------------------- project financials

async function listProjectFinancials(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));

  const { rows, total } = await financeModel.findProjectFinancials({ ...query, page, pageSize });

  return {
    projects: rows.map(toProjectFinancials),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getProjectFinancials(projectId) {
  const { rows } = await financeModel.findProjectFinancials({ projectId, page: 1, pageSize: 1 });
  if (rows.length === 0) throw ApiError.notFound('That project does not exist.');
  return toProjectFinancials(rows[0]);
}

/** Itemized material consumption history for a project. */
async function getProjectMaterialConsumption(projectId, query = {}) {
  const pId = Number(projectId);
  if (!pId) throw ApiError.badRequest('Valid project ID is required.');

  const where = ['e.project_id = ?', "e.category = 'Material Consumption'", "e.status NOT IN ('rejected', 'cancelled')"];
  const params = [pId];

  if (query.siteId && query.siteId !== 'all') {
    where.push('e.site_id = ?');
    params.push(Number(query.siteId));
  }
  if (query.contractorId && query.contractorId !== 'all') {
    where.push('e.contractor_id = ?');
    params.push(Number(query.contractorId));
  }
  if (query.dateFrom) {
    where.push('e.expense_date >= ?');
    params.push(query.dateFrom);
  }
  if (query.dateTo) {
    where.push('e.expense_date <= ?');
    params.push(query.dateTo);
  }

  const [rows] = await pool.query(
    `SELECT e.id AS expense_id, e.expense_number, e.amount AS material_cost, e.expense_date,
            e.reference, e.notes, e.paid_by, e.status,
            m.id AS material_id, COALESCE(m.name, e.party_name) AS material_name, m.code AS material_code,
            m.category AS material_category, m.unit AS material_unit, m.default_rate,
            dwu.id AS work_update_id, dwu.quantity_used, dwu.phase_number, dwu.phase_title, dwu.subcategory,
            s.id AS site_id, s.name AS site_name,
            p.id AS project_id, p.name AS project_name, p.code AS project_code,
            c.id AS contractor_id, c.name AS contractor_name,
            wt.transaction_number, wt.id AS transaction_id
     FROM expenses e
     LEFT JOIN daily_work_updates dwu ON dwu.expense_id = e.id
     LEFT JOIN materials m ON (m.id = dwu.material_id OR m.name = e.party_name)
     LEFT JOIN sites s ON s.id = e.site_id
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN contractors c ON c.id = e.contractor_id
     LEFT JOIN warehouse_transactions wt ON (wt.transaction_number = e.reference OR wt.id = dwu.warehouse_transaction_id)
     WHERE ${where.join(' AND ')}
     ORDER BY e.expense_date DESC, e.id DESC`,
    params
  );

  const totalCost = rows.reduce((sum, r) => sum + Number(r.material_cost || 0), 0);

  return {
    projectId: pId,
    totalCost,
    items: rows.map((r) => {
      const unitRate = Number(r.default_rate || 0);
      const qty = r.quantity_used != null ? Number(r.quantity_used) : (unitRate > 0 ? Number((Number(r.material_cost) / unitRate).toFixed(2)) : 1);
      return {
        expenseId: r.expense_id,
        expenseNumber: r.expense_number,
        materialId: r.material_id,
        materialName: r.material_name,
        materialCode: r.material_code,
        category: r.material_category,
        quantityUsed: qty,
        unit: r.material_unit || 'unit',
        unitRate: unitRate || (qty > 0 ? Number((Number(r.material_cost) / qty).toFixed(2)) : Number(r.material_cost)),
        materialCost: Number(r.material_cost || 0),
        date: r.expense_date,
        projectId: r.project_id,
        projectName: r.project_name,
        siteId: r.site_id,
        siteName: r.site_name,
        phaseNumber: r.phase_number,
        phaseTitle: r.phase_title,
        subcategory: r.subcategory,
        contractorId: r.contractor_id,
        contractorName: r.contractor_name,
        reference: r.reference || r.transaction_number,
        transactionNumber: r.transaction_number || r.reference,
        status: r.status,
        notes: r.notes,
      };
    }),
  };
}

// -------------------------------------------------------- payment tracking

async function listPayments(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 15));

  const { rows, total, totalAmount } = await financeModel.findPaymentTracking({ ...query, page, pageSize });

  return {
    payments: rows.map(toPaymentRow),
    totalAmount,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

// ------------------------------------------------ contractor inventory & consumption

/** Fetches available stock in the contractor's warehouse. */
async function getContractorInventory(hrScope, queryContractorId) {
  let cId = null;
  if (typeof hrScope === 'number' || (typeof hrScope === 'string' && !isNaN(hrScope))) {
    cId = Number(hrScope);
  } else if (hrScope?.role === ROLES.CONTRACTOR) {
    cId = Number(hrScope.contractorId);
  }
  if (!cId && queryContractorId) {
    if (typeof queryContractorId === 'object') {
      cId = Number(queryContractorId.contractorId);
    } else {
      cId = Number(queryContractorId);
    }
  }
  if (!cId) throw ApiError.badRequest('Contractor must be specified.');

  await warehouseModel.ensureContractorWarehouses();
  const { contractors } = await warehouseModel.findScopes();
  const warehouse = contractors.find((c) => Number(c.contractor_id) === cId);
  if (!warehouse) return { warehouse: null, inventory: [] };

  const [rows] = await pool.query(
    `SELECT ws.material_id, m.id, m.code, m.name, m.category, m.unit, m.default_rate,
            SUM(ws.quantity) AS available_stock
     FROM warehouse_stock ws
     JOIN materials m ON m.id = ws.material_id
     WHERE ws.warehouse_id = ?
     GROUP BY ws.material_id, m.id, m.code, m.name, m.category, m.unit, m.default_rate
     HAVING available_stock > 0
     ORDER BY m.name ASC`,
    [warehouse.id]
  );

  return {
    warehouse: { id: warehouse.id, name: warehouse.name, code: warehouse.code },
    inventory: rows.map((r) => ({
      material_id: r.material_id,
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category,
      unit: r.unit,
      defaultRate: Number(r.default_rate || 0),
      availableStock: Number(r.available_stock || 0),
    })),
  };
}

/**
 * Records consumption of material/tool from contractor's warehouse inventory.
 * Automatically deducts stock via warehouseService.issueStock,
 * records a daily work update, and logs a daily expense under 'Material Consumption'.
 */
async function recordMaterialConsumption(payload, hrScope, userId) {
  let cId = hrScope?.role === ROLES.CONTRACTOR ? Number(hrScope.contractorId) : null;
  if (!cId && payload.contractor_id) cId = Number(payload.contractor_id);
  if (!cId) throw ApiError.badRequest('Contractor must be specified.');

  const projectId = Number(payload.project_id);
  const siteId = payload.site_id ? Number(payload.site_id) : null;
  const taskId = payload.task_id ? Number(payload.task_id) : (payload.taskId ? Number(payload.taskId) : null);
  let taskName = null;
  if (taskId) {
    const [tRows] = await pool.query('SELECT name FROM project_tasks WHERE id = ?', [taskId]);
    if (tRows.length > 0) taskName = tRows[0].name;
  }

  const phaseNumber = Number(payload.phase_number) || 1;
  const subcategory = (payload.subcategory || taskName || 'General Work').trim();
  const materialId = Number(payload.material_id);
  const quantityUsed = Number(payload.quantity_used);
  const expenseDate = payload.expense_date || today();
  const remarks = (payload.remarks || '').trim();

  if (!projectId) throw ApiError.badRequest('Check the highlighted fields.', { project_id: 'Select an assigned project.' });
  if (!materialId) throw ApiError.badRequest('Check the highlighted fields.', { material_id: 'Select a material/tool.' });
  if (!(quantityUsed > 0)) {
    throw ApiError.badRequest('Check the highlighted fields.', { quantity_used: 'Enter a quantity greater than zero.' });
  }

  // Task-wise only: material is used against the task it was procured for.
  if (!taskId) throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'Select the task - material is used task-wise.' });
  const consumptionSubtask = await resolveSubtask(taskId, subtaskIdFrom(payload));
  const consumptionSubtaskId = consumptionSubtask ? consumptionSubtask.id : null;
  const scopeLabel = consumptionSubtask ? `subtask "${consumptionSubtask.name}"` : 'this task';
  const taskLines = await require('./dailyWorkService').getTaskMaterials(taskId, cId, consumptionSubtaskId);
  const taskLine = taskLines.find((x) => Number(x.material_id) === materialId);
  if (!taskLine) throw ApiError.badRequest('Check the highlighted fields.', { material_id: `That material was not procured for ${scopeLabel}.` });
  if (quantityUsed > taskLine.taskAvailable + 1e-9) {
    throw ApiError.badRequest('Check the highlighted fields.', { quantity_used: `Only ${taskLine.taskAvailable} ${taskLine.unit} procured for ${scopeLabel} is still unused.` });
  }

  // 1. Resolve contractor warehouse
  await warehouseModel.ensureContractorWarehouses();
  const { contractors } = await warehouseModel.findScopes();
  const warehouse = contractors.find((c) => Number(c.contractor_id) === cId);
  if (!warehouse) throw ApiError.badRequest('That contractor has no warehouse configured.');

  // 2. Resolve material & check available stock
  const material = await materialModel.findById(materialId);
  if (!material) throw ApiError.badRequest('Check the highlighted fields.', { material_id: 'Selected material does not exist.' });

  const available = await warehouseModel.totalForMaterial(warehouse.id, materialId);
  if (quantityUsed > Number(available || 0)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      quantity_used: `Only ${Number(available || 0)} ${material.unit} available in your inventory. Cannot exceed stock.`,
    });
  }

  // 3. Issue stock from warehouse (deducts from inventory & records warehouse transaction)
  const issueTx = await warehouseService.issueStock({
    material_id: materialId,
    warehouse_id: warehouse.id,
    project_id: projectId,
    site_id: siteId,
    quantity: quantityUsed,
    unit: material.unit,
    reference: `CONSUMPTION-${expenseDate}`,
    notes: taskName ? `Task: ${taskName} (${subcategory}): ${remarks || 'Site consumption'}` : `Work (${subcategory}): ${remarks || 'Site consumption'}`,
    transaction_date: expenseDate,
  }, userId);

  // 4. Record Daily Expense first so we have expenseId
  const phaseDef = PROJECT_PHASES_DEF.find((p) => p.phase_number === phaseNumber);
  const phaseTitle = taskName ? `Task: ${taskName}` : (phaseDef?.title || `Phase ${phaseNumber}`);
  // Actual cost of the stock consumed (linked to where it came from), not the catalogue default.
  const unitRate = await getConsumptionUnitCost({ warehouseId: warehouse.id, materialId, issueTx });
  const totalAmount = Number((quantityUsed * unitRate).toFixed(2));
  const expenseNumber = await generateExpenseNumber();

  const expenseId = await financeModel.createExpense({
    expense_number: expenseNumber,
    project_id: projectId,
    site_id: siteId,
    contractor_id: cId,
    task_id: taskId || null,
    subtask_id: consumptionSubtaskId,
    source_type: 'daily_work_material',
    category: 'Material Consumption',
    description: `Consumed ${quantityUsed} ${material.unit} of ${material.name} (${phaseTitle}${subcategory ? ` · ${subcategory}` : ''})`,
    amount: totalAmount,
    expense_date: expenseDate,
    paid_by: 'Contractor Inventory',
    party_name: material.name,
    payment_method: 'other',
    reference: issueTx.transactionNumber || issueTx.transaction_number,
    status: 'approved',
    notes: remarks ? `${phaseTitle}: ${remarks}` : `${phaseTitle}`,
    created_by: userId,
  });

  // 5. Record Daily Work Update with material tracking link
  let workUpdateId = null;
  try {
    workUpdateId = await dailyWorkModel.createUpdate({
      project_id: projectId,
      site_id: siteId,
      contractor_id: cId,
      task_id: taskId,
      subtask_id: consumptionSubtaskId,
      phase_number: phaseNumber,
      phase_title: phaseTitle,
      subcategory,
      material_id: materialId,
      quantity_used: quantityUsed,
      unit: material.unit,
      warehouse_transaction_id: issueTx.id,
      expense_id: expenseId,
      unit_cost: unitRate,
      material_cost: totalAmount,
      work_date: expenseDate,
      work_done: `Material Used: ${quantityUsed} ${material.unit} of ${material.name}${taskName ? ` for Task: ${taskName}` : ''}`,
      work_status: 'in-progress',
      progress_percentage: 0,
      remarks: remarks || `Consumed ${quantityUsed} ${material.unit} from warehouse inventory`,
      created_by: userId,
    });
    if (workUpdateId) await pool.query('UPDATE expenses SET source_id = ? WHERE id = ?', [workUpdateId, expenseId]);
  } catch (err) {
    console.error('Error creating daily work update for consumption:', err);
  }

  const createdExpense = await getExpense(expenseId, hrScope);
  return {
    expense: createdExpense,
    workUpdateId,
    issueTransactionNumber: issueTx.transactionNumber || issueTx.transaction_number,
    consumed: {
      materialName: material.name,
      quantity: quantityUsed,
      unit: material.unit,
      remainingStock: Number(available || 0) - quantityUsed,
    },
  };
}

// ------------------------------------------------------------------ lookups

async function getLookups(hrScope) {
  const isContractor = hrScope?.role === ROLES.CONTRACTOR;
  const [projects, contractors, categories, suppliers, summary] = await Promise.all([
    projectModel.findAll({ page: 1, pageSize: 100, ...(isContractor ? { contractorId: hrScope.contractorId } : {}) }),
    contractorModel.findAll({ page: 1, pageSize: 100 }),
    financeModel.findExpenseCategories(),
    financeModel.findSuppliers(),
    getSummary(),
  ]);

  return {
    projects: (projects.rows || []).map((p) => ({ id: p.id, code: p.code, name: p.name })),
    contractors: (contractors.rows || []).map((c) => ({ id: c.id, name: c.name })),
    // Union of the canonical list and anything already stored, so a legacy
    // category still appears in the filter instead of silently vanishing.
    categories: [...new Set([...EXPENSE_CATEGORIES, ...categories])],
    contractorCategories: CONTRACTOR_EXPENSE_CATEGORIES,
    suppliers,
    statuses: EXPENSE_STATUSES,
    paymentMethods: PAYMENT_METHODS,
    paymentTypes: PAYMENT_TYPES,
    summary,
  };
}

module.exports = {
  EXPENSE_STATUSES, EXPENSE_CATEGORIES, CONTRACTOR_EXPENSE_CATEGORIES,
  PAYMENT_METHODS, PAYMENT_TYPES, STATUS_TRANSITIONS,
  getSummary,
  listExpenses, getExpense, createExpense, updateExpense, updateExpenseStatus,
  attachBill, getBillFile,
  listContractorPayments, getContractorPayment,
  listProcurementFinance,
  listProjectFinancials, getProjectFinancials, getProjectMaterialConsumption,
  listPayments, getLookups,
  getContractorInventory, recordMaterialConsumption,
  toExpense, toContractorPayment, toProjectFinancials,
};
