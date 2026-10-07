'use strict';

const asyncHandler = require('../utils/asyncHandler');
const procurementService = require('../services/procurementService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** GET /api/procurement */
const list = asyncHandler(async (req, res) => ok(res, await procurementService.listScoped(req.query, req.hrScope, req.user.id)));

/** GET /api/procurement/lookups */
const lookups = asyncHandler(async (req, res) => ok(res, await procurementService.getLookups(req.hrScope, req.user.id)));

/** GET /api/procurement/:id */
const detail = asyncHandler(async (req, res) => ok(res, await procurementService.getDetail(req.params.id, req.hrScope, req.user.id)));

/** POST /api/procurement */
const create = asyncHandler(async (req, res) =>
  ok(res, { request: await procurementService.create(req.body, req.user.id, req.hrScope) }, 201)
);

/** PUT /api/procurement/:id */
const update = asyncHandler(async (req, res) =>
  ok(res, { request: await procurementService.update(req.params.id, req.body, req.hrScope, req.user.id) })
);

/** PATCH /api/procurement/:id/status */
const updateStatus = asyncHandler(async (req, res) =>
  ok(res, { request: await procurementService.updateStatus(req.params.id, req.body.status, req.user.role, req.hrScope, req.user.id) })
);

/** POST /api/procurement/:id/confirm — source contractor accepts a transfer */
const confirmSource = asyncHandler(async (req, res) =>
  ok(res, { request: await procurementService.confirmSource(req.params.id, req.hrScope, req.user.id) })
);

/** POST /api/procurement/:id/order — Approved -> Ordered, stamps PO fields */
const placeOrder = asyncHandler(async (req, res) =>
  ok(res, { request: await procurementService.placeOrder(req.params.id, req.body) })
);

/** POST /api/procurement/:id/receiving */
const receive = asyncHandler(async (req, res) =>
  ok(res, await procurementService.receive(req.params.id, req.body, req.user.id), 201)
);

/** PUT /api/procurement/:id/receiving/:receiptId */
const updateReceipt = asyncHandler(async (req, res) =>
  ok(res, await procurementService.updateReceipt(req.params.id, req.params.receiptId, req.body))
);

/** POST /api/procurement/:id/fulfil — perform the warehouse movement + link it */
const fulfil = asyncHandler(async (req, res) =>
  ok(res, await procurementService.fulfil(req.params.id, req.body, req.user.id))
);

/** POST /api/procurement/:id/bill — attach a real bill/invoice file */
const uploadBill = asyncHandler(async (req, res) =>
  ok(res, await procurementService.attachBill(req.params.id, req.file, req.hrScope, req.user.id))
);

/** GET /api/procurement/:id/bill — stream the attached bill for view/download */
const downloadBill = asyncHandler(async (req, res) => {
  const { absolutePath, fileName, mimeType } = await procurementService.getBillFile(req.params.id, req.hrScope, req.user.id);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  res.sendFile(absolutePath);
});

/** POST /api/procurement/:id/dispatch — send material for an approved request */
const dispatch = asyncHandler(async (req, res) =>
  ok(res, await procurementService.dispatch(req.params.id, req.body, req.hrScope, req.user.id))
);

module.exports = { list, lookups, detail, create, update, updateStatus, confirmSource, placeOrder, receive, updateReceipt, fulfil, dispatch, uploadBill, downloadBill };
