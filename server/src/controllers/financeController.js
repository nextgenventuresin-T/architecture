'use strict';

const asyncHandler = require('../utils/asyncHandler');
const financeService = require('../services/financeService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** GET /api/finance/summary */
const summary = asyncHandler(async (req, res) => ok(res, { summary: await financeService.getSummary() }));

/** GET /api/finance/lookups */
const lookups = asyncHandler(async (req, res) => ok(res, await financeService.getLookups(req.hrScope)));

/** GET /api/finance/expenses */
const listExpenses = asyncHandler(async (req, res) => ok(res, await financeService.listExpenses(req.query, req.hrScope)));

/** GET /api/finance/expenses/:id */
const getExpense = asyncHandler(async (req, res) =>
  ok(res, { expense: await financeService.getExpense(req.params.id, req.hrScope) })
);

/** POST /api/finance/expenses */
const createExpense = asyncHandler(async (req, res) =>
  ok(res, { expense: await financeService.createExpense(req.body, req.user.id, req.hrScope, req.file) }, 201)
);

/** PUT /api/finance/expenses/:id */
const updateExpense = asyncHandler(async (req, res) =>
  ok(res, { expense: await financeService.updateExpense(req.params.id, req.body, req.hrScope) })
);

/** PATCH /api/finance/expenses/:id/status */
const updateExpenseStatus = asyncHandler(async (req, res) =>
  ok(res, { expense: await financeService.updateExpenseStatus(req.params.id, req.body.status) })
);

/** POST /api/finance/expenses/:id/bill */
const uploadBill = asyncHandler(async (req, res) =>
  ok(res, { expense: await financeService.attachBill(req.params.id, req.file, req.hrScope, req.user.id) })
);

/** GET /api/finance/expenses/:id/bill */
const downloadBill = asyncHandler(async (req, res) => {
  const { absolutePath, fileName, mimeType } = await financeService.getBillFile(req.params.id, req.hrScope, req.user.id);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  res.sendFile(absolutePath);
});

/** GET /api/finance/contractor-payments */
const contractorPayments = asyncHandler(async (req, res) =>
  ok(res, await financeService.listContractorPayments(req.query))
);

/** GET /api/finance/contractor-payments/:id */
const contractorPaymentDetail = asyncHandler(async (req, res) =>
  ok(res, { payment: await financeService.getContractorPayment(req.params.id) })
);

/** GET /api/finance/procurement */
const procurement = asyncHandler(async (req, res) =>
  ok(res, await financeService.listProcurementFinance(req.query))
);

/** GET /api/finance/projects */
const projectFinancials = asyncHandler(async (req, res) =>
  ok(res, await financeService.listProjectFinancials(req.query))
);

/** GET /api/finance/projects/:id */
const projectFinancialDetail = asyncHandler(async (req, res) =>
  ok(res, { project: await financeService.getProjectFinancials(req.params.id) })
);

/** GET /api/finance/projects/:id/material-consumption */
const projectMaterialConsumption = asyncHandler(async (req, res) =>
  ok(res, await financeService.getProjectMaterialConsumption(req.params.id, req.query))
);

/** GET /api/finance/payments */
const payments = asyncHandler(async (req, res) => ok(res, await financeService.listPayments(req.query)));

/** GET /api/finance/contractor-inventory */
const contractorInventory = asyncHandler(async (req, res) =>
  ok(res, await financeService.getContractorInventory(req.hrScope, req.query.contractorId))
);

/** POST /api/finance/contractor-consumption */
const recordConsumption = asyncHandler(async (req, res) =>
  ok(res, await financeService.recordMaterialConsumption(req.body, req.hrScope, req.user.id), 201)
);

module.exports = {
  summary, lookups,
  listExpenses, getExpense, createExpense, updateExpense, updateExpenseStatus,
  uploadBill, downloadBill,
  contractorPayments, contractorPaymentDetail,
  procurement, projectFinancials, projectFinancialDetail, projectMaterialConsumption, payments,
  contractorInventory, recordConsumption,
};
