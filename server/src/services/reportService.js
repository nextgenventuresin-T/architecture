'use strict';

const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/roles');

const reportModel = require('../models/reportModel');
const materialModel = require('../models/materialModel');
const procurementModel = require('../models/procurementModel');
const hrDashboardModel = require('../models/hrDashboardModel');

const projectService = require('./projectService');
const contractorService = require('./contractorService');
const employeeService = require('./employeeService');
const materialService = require('./materialService');
const procurementService = require('./procurementService');
const warehouseService = require('./warehouseService');
const financeService = require('./financeService');

/**
 * Reports & Analytics (Interface 13) never owns data. Every number and every
 * drill-down row here is read straight from the module that already owns
 * it — projects, contractors, employees, materials, procurement, warehouse,
 * finance, HR & labour. This file's only job is to decide, per caller,
 * WHICH of those the KPI dashboard may show, and to apply the one piece of
 * scoping none of those modules' plain list endpoints already enforce on
 * their own: a signed-in CONTRACTOR may only ever see their own projects,
 * sites and contractor record, never another contractor's, however a query
 * parameter is manipulated.
 */

const MAX_PAGE_SIZE = 50;

function pageParams(query, defaultSize = 10) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || defaultSize));
  return { page, pageSize };
}

/** Everything a report needs to know about who is asking, resolved server-side. */
function callerFrom(req) {
  return {
    role: req.user?.role,
    isAdmin: req.user?.role === ROLES.ADMIN,
    permissions: req.accessContext?.permissions ?? new Set(),
    contractorId: req.hrScope?.contractorId ?? null,
    employeeId: req.hrScope?.employeeId ?? null,
  };
}

/** True when this caller may see a given module's reports at all. */
function canView(caller, module) {
  if (caller.isAdmin) return true;
  return caller.permissions.has(`${module}:view`);
}

/** The contractor id to scope a query by — a CONTRACTOR's own id, or none. */
function contractorScope(caller) {
  return caller.role === ROLES.CONTRACTOR ? caller.contractorId : null;
}

// ============================================================== dashboard

/**
 * KPI summary. Only sections the caller actually holds `<module>:view` for
 * are computed at all — a HR user never even triggers a finance query, and a
 * CONTRACTOR's project/site/labour figures are pre-scoped to their own work
 * rather than computed org-wide and hidden after the fact.
 */
async function getDashboard(caller) {
  const scopeContractorId = contractorScope(caller);
  const tasks = {};

  if (canView(caller, 'projects')) {
    tasks.projects = reportModel.findProjectCounts({ contractorId: scopeContractorId });
    tasks.sites = reportModel.findSiteCount({ contractorId: scopeContractorId });
  }

  if (canView(caller, 'contractors') && !scopeContractorId) {
    // Org-wide contractor headcount is oversight information; a CONTRACTOR
    // sees their own record through the "contractors" drill-down instead,
    // not a count of every contractor in the company.
    tasks.contractors = reportModel.findContractorCounts();
  }

  if (canView(caller, 'employees')) {
    tasks.employees = reportModel.findEmployeeCounts();
  }

  if (canView(caller, 'hr')) {
    tasks.labour = hrDashboardModel.findSummary({ contractorId: scopeContractorId });
  }

  if (canView(caller, 'materials') && !scopeContractorId) {
    tasks.materials = materialModel.findStockSummary();
  }

  if (canView(caller, 'procurement') && !scopeContractorId) {
    tasks.procurement = procurementModel.findSummary();
  }

  if (canView(caller, 'warehouse') && !scopeContractorId) {
    tasks.warehouse = warehouseService.getSummary();
  }

  if (canView(caller, 'finance') && !scopeContractorId) {
    tasks.finance = financeService.getSummary();
  }

  const keys = Object.keys(tasks);
  const settled = await Promise.all(Object.values(tasks));
  const raw = Object.fromEntries(keys.map((key, index) => [key, settled[index]]));

  const kpis = {};

  if (raw.projects) {
    kpis.totalProjects = Number(raw.projects.total || 0);
    kpis.activeProjects = Number(raw.projects.active || 0);
    kpis.completedProjects = Number(raw.projects.completed || 0);
    kpis.totalSites = Number(raw.sites.total || 0);
  }

  if (raw.contractors) {
    kpis.totalContractors = Number(raw.contractors.total || 0);
    kpis.activeContractors = Number(raw.contractors.active || 0);
  }

  if (raw.employees) {
    kpis.totalEmployees = Number(raw.employees.total || 0);
    kpis.activeEmployees = Number(raw.employees.active || 0);
  }

  if (raw.labour) {
    kpis.companyLabour = raw.labour.companyLabourCount;
    kpis.contractorLabour = raw.labour.contractorLabourCount;
    kpis.totalWorkforce = raw.labour.totalWorkforce;
    kpis.pendingLabourRequests = raw.labour.requests.pendingReview;
    kpis.attendanceToday = raw.labour.today;
  }

  if (raw.materials) {
    kpis.materialStockValue = Number(raw.materials.stock_value || 0);
    kpis.lowStockMaterials = Number(raw.materials.low_stock || 0);
    kpis.outOfStockMaterials = Number(raw.materials.out_of_stock || 0);
  }

  if (raw.procurement) {
    kpis.procurementRequests = Number(raw.procurement.total || 0);
    kpis.pendingProcurement =
      Number(raw.procurement.requested || 0) + Number(raw.procurement.pending_approval || 0);
  }

  if (raw.warehouse) {
    kpis.warehouseStockQuantity = raw.warehouse.totalStockQuantity;
    kpis.warehouseStockValue = raw.warehouse.stockValue;
  }

  if (raw.finance) {
    kpis.projectExpenses = raw.finance.totalExpenses;
    kpis.contractorPayments = raw.finance.contractorPayments;
    kpis.outstandingPayments = raw.finance.outstandingAmount;
    kpis.remainingBudget = raw.finance.remainingBudget;
  }

  // "Pending Approvals" reuses Interface 12's own dashboard summary
  // (GET /api/approvals/summary) directly from the client — that endpoint
  // already resolves the exact same per-role/per-contractor visibility rules
  // this module would otherwise have to duplicate.

  return {
    role: caller.role,
    scopedToContractor: Boolean(scopeContractorId),
    kpis,
  };
}

// =============================================================== projects

/** Project drill-down, scoped to a CONTRACTOR's own projects when applicable. */
async function listProjects(query, caller) {
  if (!canView(caller, 'projects')) throw ApiError.forbidden('You do not have access to this area.');
  const scopeContractorId = contractorScope(caller);
  const effectiveQuery = scopeContractorId
    ? { ...query, contractorId: String(scopeContractorId) }
    : query;
  return projectService.list(effectiveQuery);
}

// ================================================================== sites

async function listSites(query, caller) {
  if (!canView(caller, 'projects')) throw ApiError.forbidden('You do not have access to this area.');
  const { page, pageSize } = pageParams(query, 10);
  const scopeContractorId = contractorScope(caller);

  const { rows, total } = await reportModel.findSites({
    ...query,
    contractorId: scopeContractorId || undefined,
    page,
    pageSize,
  });

  return {
    sites: rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      labourCount: Number(row.labour_count || 0),
      progress: Number(row.progress || 0),
      status: row.status,
      safetyStatus: row.safety_status,
      openIssues: Number(row.open_issues || 0),
      project: { id: row.project_id, name: row.project_name, code: row.project_code },
      siteEngineer: row.site_engineer_id
        ? { id: row.site_engineer_id, name: row.site_engineer_name }
        : null,
      contractor: row.contractor_id ? { id: row.contractor_id, name: row.contractor_name } : null,
      updatedAt: row.updated_at,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

// ============================================================= contractors

/**
 * Contractor drill-down. A signed-in CONTRACTOR sees only their own record —
 * the query is never allowed to ask for anyone else's, and a direct detail
 * request for another contractor's id 404s rather than confirming it exists.
 */
async function listContractors(query, caller) {
  const scopeContractorId = contractorScope(caller);
  if (!scopeContractorId && !canView(caller, 'contractors')) {
    throw ApiError.forbidden('You do not have access to this area.');
  }
  if (scopeContractorId) {
    const detail = await contractorService.getDetail(scopeContractorId);
    return {
      contractors: [detail.contractor],
      pagination: { page: 1, pageSize: 1, total: 1, totalPages: 1 },
    };
  }
  return contractorService.list(query);
}

async function getContractorReport(contractorId, caller) {
  const scopeContractorId = contractorScope(caller);
  if (!scopeContractorId && !canView(caller, 'contractors')) {
    throw ApiError.forbidden('You do not have access to this area.');
  }
  if (scopeContractorId && Number(contractorId) !== Number(scopeContractorId)) {
    // 404, not 403 — matches authorize.js's requireProjectAccess reasoning:
    // confirming another contractor's record exists leaks data shape to
    // someone with no right to see it.
    throw ApiError.notFound('That contractor does not exist.');
  }
  return contractorService.getDetail(contractorId);
}

// =============================================================== employees

const FORBIDDEN = () => ApiError.forbidden('You do not have access to this area.');

async function listEmployees(query, caller) {
  // No org-wide employee visibility for a CONTRACTOR — the "Employees /
  // Company Labour" report is Admin/HR territory; a contractor's own
  // workforce is reported through HR & Labour's contractor-worker endpoints.
  if (caller.role === ROLES.CONTRACTOR || !canView(caller, 'employees')) throw FORBIDDEN();
  return employeeService.list(query);
}

// ================================================================ materials

async function listMaterials(query, caller) {
  if (caller.role === ROLES.CONTRACTOR || !canView(caller, 'materials')) throw FORBIDDEN();
  return materialService.list(query);
}

// ============================================================= procurement

async function listProcurement(query, caller) {
  if (caller.role === ROLES.CONTRACTOR || !canView(caller, 'procurement')) throw FORBIDDEN();
  return procurementService.list(query);
}

// =============================================================== warehouse

async function listWarehouseStock(query, caller) {
  if (caller.role === ROLES.CONTRACTOR || !canView(caller, 'warehouse')) throw FORBIDDEN();
  return warehouseService.listStock(query);
}

async function listWarehouseTransactions(query, caller) {
  if (caller.role === ROLES.CONTRACTOR || !canView(caller, 'warehouse')) throw FORBIDDEN();
  return warehouseService.listTransactions(query);
}

// ================================================================= finance

async function listExpenses(query, caller) {
  if (caller.role === ROLES.CONTRACTOR || !canView(caller, 'finance')) throw FORBIDDEN();
  return financeService.listExpenses(query);
}

/**
 * A signed-in CONTRACTOR may see their own payment history — it is money
 * owed to them — even though they hold no general `finance:view`
 * permission. Everyone else needs `finance:view` like any other finance
 * report. Either way the contractor filter is the caller's own id, never a
 * client-supplied one.
 */
async function listContractorPayments(query, caller) {
  const scopeContractorId = contractorScope(caller);
  if (scopeContractorId) {
    return financeService.listContractorPayments({ ...query, contractorId: String(scopeContractorId) });
  }
  if (!canView(caller, 'finance')) throw FORBIDDEN();
  return financeService.listContractorPayments(query);
}

async function listProjectFinancials(query, caller) {
  if (caller.role === ROLES.CONTRACTOR || !canView(caller, 'finance')) throw FORBIDDEN();
  return financeService.listProjectFinancials(query);
}

module.exports = {
  callerFrom,
  canView,
  contractorScope,
  getDashboard,
  listProjects,
  listSites,
  listContractors,
  getContractorReport,
  listEmployees,
  listMaterials,
  listProcurement,
  listWarehouseStock,
  listWarehouseTransactions,
  listExpenses,
  listContractorPayments,
  listProjectFinancials,
};
