'use strict';

const asyncHandler = require('../utils/asyncHandler');
const toolService = require('../services/toolService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const list = asyncHandler(async (req, res) => ok(res, await toolService.list(req.query)));
const detail = asyncHandler(async (req, res) => ok(res, { tool: await toolService.getById(req.params.id) }));
const create = asyncHandler(async (req, res) => ok(res, { tool: await toolService.create(req.body) }, 201));
const update = asyncHandler(async (req, res) => ok(res, { tool: await toolService.update(req.params.id, req.body) }));
const remove = asyncHandler(async (req, res) => ok(res, await toolService.remove(req.params.id)));

module.exports = { list, detail, create, update, remove };
