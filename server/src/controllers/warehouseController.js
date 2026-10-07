'use strict';

const asyncHandler = require('../utils/asyncHandler');
const warehouseService = require('../services/warehouseService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** GET /api/warehouse */
const list = asyncHandler(async (req, res) => ok(res, await warehouseService.list(req.query)));

/** GET /api/warehouse/lookups */
const lookups = asyncHandler(async (req, res) => ok(res, await warehouseService.getLookups()));

/** GET /api/warehouse/summary */
const summary = asyncHandler(async (req, res) => ok(res, { summary: await warehouseService.getSummary() }));

/** GET /api/warehouse/stock */
const stock = asyncHandler(async (req, res) => ok(res, await warehouseService.listStock(req.query)));

/** GET /api/warehouse/stock/project-site */
const projectSiteStock = asyncHandler(async (req, res) =>
  ok(res, await warehouseService.listProjectSiteStock(req.query, req.hrScope))
);

/** GET /api/warehouse/transactions */
const transactions = asyncHandler(async (req, res) => ok(res, await warehouseService.listTransactions(req.query)));

/** GET /api/warehouse/:id */
const detail = asyncHandler(async (req, res) => ok(res, await warehouseService.getDetail(req.params.id, req.query)));

/** POST /api/warehouse */
const create = asyncHandler(async (req, res) =>
  ok(res, { warehouse: await warehouseService.create(req.body) }, 201)
);

/** PUT /api/warehouse/:id */
const update = asyncHandler(async (req, res) =>
  ok(res, { warehouse: await warehouseService.update(req.params.id, req.body) })
);

/** POST /api/warehouse/stock/receipt */
const receive = asyncHandler(async (req, res) =>
  ok(res, { transaction: await warehouseService.receiveStock(req.body, req.user.id) }, 201)
);

/** POST /api/warehouse/stock/issue */
const issue = asyncHandler(async (req, res) =>
  ok(res, { transaction: await warehouseService.issueStock(req.body, req.user.id) }, 201)
);

/** POST /api/warehouse/stock/transfer */
const transfer = asyncHandler(async (req, res) =>
  ok(res, { transaction: await warehouseService.transferStock(req.body, req.user.id) }, 201)
);

/** POST /api/warehouse/stock/adjustment */
const adjust = asyncHandler(async (req, res) =>
  ok(res, { transaction: await warehouseService.adjustStock(req.body, req.user.id) }, 201)
);

/** GET /api/warehouse/scopes */
const scopes = asyncHandler(async (req, res) => ok(res, await warehouseService.getScopes()));

/** GET /api/warehouse/central-overview */
const centralOverview = asyncHandler(async (req, res) =>
  ok(res, await warehouseService.getCentralOverview(req.query))
);

/** GET /api/warehouse/contractor-transactions */
const contractorTransactions = asyncHandler(async (req, res) =>
  ok(res, await warehouseService.listContractorTransactions(req.query))
);

/** GET /api/warehouse/:id/usage-overview */
const usageOverview = asyncHandler(async (req, res) =>
  ok(res, await warehouseService.getWarehouseUsageOverview(req.params.id, req.query, req.hrScope))
);

module.exports = {
  list, lookups, summary, stock, projectSiteStock, transactions, detail,
  create, update, receive, issue, transfer, adjust,
  scopes, centralOverview, contractorTransactions, usageOverview,
};
