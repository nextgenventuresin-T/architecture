'use strict';

const asyncHandler = require('../utils/asyncHandler');
const reportService = require('../services/reportService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** GET /api/reports/dashboard */
const dashboard = asyncHandler(async (req, res) =>
  ok(res, await reportService.getDashboard(reportService.callerFrom(req)))
);

/** GET /api/reports/projects */
const projects = asyncHandler(async (req, res) =>
  ok(res, await reportService.listProjects(req.query, reportService.callerFrom(req)))
);

/** GET /api/reports/sites */
const sites = asyncHandler(async (req, res) =>
  ok(res, await reportService.listSites(req.query, reportService.callerFrom(req)))
);

/** GET /api/reports/contractors */
const contractors = asyncHandler(async (req, res) =>
  ok(res, await reportService.listContractors(req.query, reportService.callerFrom(req)))
);

/** GET /api/reports/contractors/:id */
const contractorDetail = asyncHandler(async (req, res) =>
  ok(res, await reportService.getContractorReport(req.params.id, reportService.callerFrom(req)))
);

/** GET /api/reports/employees */
const employees = asyncHandler(async (req, res) =>
  ok(res, await reportService.listEmployees(req.query, reportService.callerFrom(req)))
);

/** GET /api/reports/materials */
const materials = asyncHandler(async (req, res) =>
  ok(res, await reportService.listMaterials(req.query, reportService.callerFrom(req)))
);

/** GET /api/reports/procurement */
const procurement = asyncHandler(async (req, res) =>
  ok(res, await reportService.listProcurement(req.query, reportService.callerFrom(req)))
);

/** GET /api/reports/warehouse/stock */
const warehouseStock = asyncHandler(async (req, res) =>
  ok(res, await reportService.listWarehouseStock(req.query, reportService.callerFrom(req)))
);

/** GET /api/reports/warehouse/transactions */
const warehouseTransactions = asyncHandler(async (req, res) =>
  ok(res, await reportService.listWarehouseTransactions(req.query, reportService.callerFrom(req)))
);

/** GET /api/reports/finance/expenses */
const expenses = asyncHandler(async (req, res) =>
  ok(res, await reportService.listExpenses(req.query, reportService.callerFrom(req)))
);

/** GET /api/reports/finance/contractor-payments */
const contractorPayments = asyncHandler(async (req, res) =>
  ok(res, await reportService.listContractorPayments(req.query, reportService.callerFrom(req)))
);

/** GET /api/reports/finance/projects */
const projectFinancials = asyncHandler(async (req, res) =>
  ok(res, await reportService.listProjectFinancials(req.query, reportService.callerFrom(req)))
);

module.exports = {
  dashboard,
  projects,
  sites,
  contractors,
  contractorDetail,
  employees,
  materials,
  procurement,
  warehouseStock,
  warehouseTransactions,
  expenses,
  contractorPayments,
  projectFinancials,
};
