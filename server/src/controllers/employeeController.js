'use strict';

const asyncHandler = require('../utils/asyncHandler');
const employeeService = require('../services/employeeService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** GET /api/employees */
const list = asyncHandler(async (req, res) => ok(res, await employeeService.list(req.query)));

/** GET /api/employees/lookups */
const lookups = asyncHandler(async (req, res) => ok(res, await employeeService.getLookups()));

/** GET /api/employees/:id */
const detail = asyncHandler(async (req, res) => ok(res, await employeeService.getDetail(req.params.id)));

/** POST /api/employees */
const create = asyncHandler(async (req, res) => ok(res, { employee: await employeeService.create(req.body) }, 201));

/** PATCH /api/employees/:id */
const update = asyncHandler(async (req, res) => ok(res, { employee: await employeeService.update(req.params.id, req.body) }));

/** POST /api/employees/:id/assign */
const assign = asyncHandler(async (req, res) => ok(res, await employeeService.assign(req.params.id, req.body), 201));

/** DELETE /api/employees/:id/assignments/:assignmentId */
const endAssignment = asyncHandler(async (req, res) =>
  ok(res, await employeeService.endAssignment(req.params.id, req.params.assignmentId))
);

/** GET /api/employees/hierarchy */
const hierarchy = asyncHandler(async (req, res) => ok(res, await employeeService.getHierarchy()));

/** GET /api/employees/:id/hierarchy */
const employeeHierarchy = asyncHandler(async (req, res) =>
  ok(res, await employeeService.getEmployeeHierarchy(req.params.id))
);

module.exports = { list, lookups, detail, create, update, assign, endAssignment, hierarchy, employeeHierarchy };
