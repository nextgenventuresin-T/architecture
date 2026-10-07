'use strict';

const asyncHandler = require('../utils/asyncHandler');
const materialService = require('../services/materialService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** GET /api/materials */
const list = asyncHandler(async (req, res) => ok(res, await materialService.list(req.query)));

/** GET /api/materials/lookups */
const lookups = asyncHandler(async (req, res) => ok(res, await materialService.getLookups()));

/** GET /api/materials/:id */
const detail = asyncHandler(async (req, res) => ok(res, await materialService.getDetail(req.params.id)));

/** POST /api/materials */
const create = asyncHandler(async (req, res) => ok(res, { material: await materialService.create(req.body) }, 201));

/** PATCH /api/materials/:id */
const update = asyncHandler(async (req, res) => ok(res, { material: await materialService.update(req.params.id, req.body) }));

/** POST /api/materials/:id/entries */
const addEntry = asyncHandler(async (req, res) => ok(res, await materialService.addEntry(req.params.id, req.body), 201));

/** PATCH /api/materials/:id/entries/:entryId */
const recordUsage = asyncHandler(async (req, res) =>
  ok(res, await materialService.recordUsage(req.params.id, req.params.entryId, req.body.used_quantity))
);

module.exports = { list, lookups, detail, create, update, addEntry, recordUsage };
