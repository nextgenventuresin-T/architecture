'use strict';

const asyncHandler = require('../utils/asyncHandler');
const clientService = require('../services/clientService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const list = asyncHandler(async (req, res) => ok(res, await clientService.list(req.query)));
const detail = asyncHandler(async (req, res) => ok(res, { client: await clientService.getById(req.params.id) }));
const create = asyncHandler(async (req, res) => ok(res, { client: await clientService.create(req.body) }, 201));
const update = asyncHandler(async (req, res) => ok(res, { client: await clientService.update(req.params.id, req.body) }));
const remove = asyncHandler(async (req, res) => ok(res, await clientService.remove(req.params.id)));
const projects = asyncHandler(async (req, res) => ok(res, { projects: await clientService.getClientProjects(req.params.id) }));

module.exports = { list, detail, create, update, remove, projects };
