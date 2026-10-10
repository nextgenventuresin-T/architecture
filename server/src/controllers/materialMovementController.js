'use strict';

const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/materialMovementService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const list = asyncHandler(async (req, res) => ok(res, { movements: await service.listMovements(req.query, req.hrScope, req.user?.id) }));
const incoming = asyncHandler(async (req, res) => ok(res, { movements: await service.listIncoming(req.hrScope) }));
const stock = asyncHandler(async (req, res) => ok(res, await service.myWarehouseStock(req.hrScope)));
const detail = asyncHandler(async (req, res) => ok(res, { movement: await service.getById(req.params.id, req.hrScope) }));
const send = asyncHandler(async (req, res) => ok(res, { movement: await service.sendMaterial(req.body, req.hrScope, req.user.id) }, 201));
const lookup = asyncHandler(async (req, res) => ok(res, await service.lookupByVehicle(req.query.vehicle_number, req.hrScope)));
const receive = asyncHandler(async (req, res) => ok(res, { movement: await service.receiveMaterial(req.params.id, req.body, req.hrScope, req.user.id) }));

module.exports = { list, incoming, stock, lookup, detail, send, receive };
