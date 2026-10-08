'use strict';

const asyncHandler = require('../utils/asyncHandler');
const taskService = require('../services/taskService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const list = asyncHandler(async (req, res) => {
  const result = await taskService.listTasks(req.query, req.hrScope);
  return ok(res, result);
});

const detail = asyncHandler(async (req, res) => {
  const result = await taskService.getTaskDetail(req.params.id, req.hrScope);
  return ok(res, result);
});

const create = asyncHandler(async (req, res) => {
  const result = await taskService.createTask(req.body, req.user?.id, req.hrScope);
  return ok(res, result, 201);
});

const update = asyncHandler(async (req, res) => {
  const result = await taskService.updateTask(req.params.id, req.body, req.user?.id, req.hrScope);
  return ok(res, result);
});

const remove = asyncHandler(async (req, res) => {
  const result = await taskService.deleteTask(req.params.id, req.hrScope);
  return ok(res, result);
});

const logWorker = asyncHandler(async (req, res) => {
  const result = await taskService.logWorker(req.params.id, req.body, req.user?.id, req.hrScope);
  return ok(res, result, 201);
});

const labourSummary = asyncHandler(async (req, res) => {
  const result = await taskService.getLabourSummary(req.params.id, req.hrScope);
  return ok(res, result);
});


const assignments = asyncHandler(async (req, res) => {
  const result = await taskService.getTaskAssignments(req.params.id, req.hrScope);
  return ok(res, result);
});

const assignWorker = asyncHandler(async (req, res) => {
  const result = await taskService.assignWorkerToTask(req.params.id, req.body, req.user?.id, req.hrScope);
  return ok(res, result, 201);
});

const unassignWorker = asyncHandler(async (req, res) => {
  const result = await taskService.unassignWorkerFromTask(req.params.id, req.params.assignmentId, req.user?.id, req.hrScope);
  return ok(res, result);
});

const createWorker = asyncHandler(async (req, res) => {
  const result = await taskService.createQuickWorker(req.body, req.user?.id, req.hrScope);
  return ok(res, result, 201);
});

const plannedMaterials = asyncHandler(async (req, res) => {
  const result = await taskService.getPlannedMaterials(req.params.id, req.hrScope);
  return ok(res, result);
});

const budgetApprovals = asyncHandler(async (req, res) => {
  const result = await taskService.getBudgetApprovals(req.params.id);
  return ok(res, result);
});

module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  logWorker,
  labourSummary,
  assignments,
  assignWorker,
  unassignWorker,
  createWorker,
  plannedMaterials,
  budgetApprovals,
};
