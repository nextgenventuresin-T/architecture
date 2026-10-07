'use strict';

const asyncHandler = require('../utils/asyncHandler');
const hrDashboardService = require('../services/hrDashboardService');
const contractorWorkerService = require('../services/contractorWorkerService');
const labourAssignmentService = require('../services/labourAssignmentService');
const labourRequestService = require('../services/labourRequestService');
const attendanceService = require('../services/attendanceService');
const leaveService = require('../services/leaveService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

// ------------------------------------------------------------- dashboard

const dashboardSummary = asyncHandler(async (req, res) =>
  ok(res, { summary: await hrDashboardService.getSummary(req.hrScope) })
);

const siteWorkforce = asyncHandler(async (req, res) =>
  ok(res, { workforce: await hrDashboardService.getSiteWorkforce(req.params.siteId, req.hrScope) })
);

// ------------------------------------------------------- contractor workers

const listWorkers = asyncHandler(async (req, res) => ok(res, await contractorWorkerService.list(req.query, req.hrScope)));

const workerSkillCategories = asyncHandler(async (req, res) =>
  ok(res, { skillCategories: await contractorWorkerService.getSkillCategories() })
);

const getWorker = asyncHandler(async (req, res) =>
  ok(res, { worker: await contractorWorkerService.getById(req.params.id, req.hrScope) })
);

const createWorker = asyncHandler(async (req, res) =>
  ok(res, { worker: await contractorWorkerService.create(req.body, req.hrScope) }, 201)
);

const updateWorker = asyncHandler(async (req, res) =>
  ok(res, { worker: await contractorWorkerService.update(req.params.id, req.body, req.hrScope) })
);

// ------------------------------------------------------------ assignments

const listAssignments = asyncHandler(async (req, res) => ok(res, await labourAssignmentService.list(req.query, req.hrScope)));

const getAssignment = asyncHandler(async (req, res) =>
  ok(res, { assignment: await labourAssignmentService.getById(req.params.id, req.hrScope) })
);

const createAssignment = asyncHandler(async (req, res) =>
  ok(res, { assignment: await labourAssignmentService.create(req.body, req.user.id) }, 201)
);

const updateAssignment = asyncHandler(async (req, res) =>
  ok(res, { assignment: await labourAssignmentService.update(req.params.id, req.body, req.hrScope) })
);

const endAssignment = asyncHandler(async (req, res) =>
  ok(res, { assignment: await labourAssignmentService.end(req.params.id, req.body, req.hrScope) })
);

// -------------------------------------------------------- labour requests

const listRequests = asyncHandler(async (req, res) => ok(res, await labourRequestService.list(req.query, req.hrScope)));

const getRequest = asyncHandler(async (req, res) => ok(res, await labourRequestService.getDetail(req.params.id, req.hrScope)));

const createRequest = asyncHandler(async (req, res) =>
  ok(res, { request: await labourRequestService.create(req.body, req.hrScope, req.user.id) }, 201)
);

const updateRequest = asyncHandler(async (req, res) =>
  ok(res, { request: await labourRequestService.update(req.params.id, req.body, req.hrScope) })
);

const submitRequest = asyncHandler(async (req, res) =>
  ok(res, { request: await labourRequestService.submit(req.params.id, req.hrScope) })
);

const reviewRequest = asyncHandler(async (req, res) =>
  ok(res, { request: await labourRequestService.review(req.params.id, req.user.id) })
);

const approveRequest = asyncHandler(async (req, res) =>
  ok(res, { request: await labourRequestService.approve(req.params.id, req.body, req.user.id) })
);

const rejectRequest = asyncHandler(async (req, res) =>
  ok(res, { request: await labourRequestService.reject(req.params.id, req.body, req.user.id) })
);

const cancelRequest = asyncHandler(async (req, res) =>
  ok(res, { request: await labourRequestService.cancel(req.params.id, req.hrScope) })
);

const completeRequest = asyncHandler(async (req, res) =>
  ok(res, { request: await labourRequestService.complete(req.params.id, req.user.id) })
);

const assignRequestWorker = asyncHandler(async (req, res) =>
  ok(res, await labourRequestService.assignWorker(req.params.id, req.body, req.user.id))
);

// ------------------------------------------------------------- attendance

const listAttendance = asyncHandler(async (req, res) => ok(res, await attendanceService.list(req.query, req.hrScope)));

const getAttendance = asyncHandler(async (req, res) =>
  ok(res, { attendance: await attendanceService.getById(req.params.id, req.hrScope) })
);

const markAttendance = asyncHandler(async (req, res) =>
  ok(res, { attendance: await attendanceService.mark(req.body, req.hrScope, req.user.id) }, 201)
);

const updateAttendance = asyncHandler(async (req, res) =>
  ok(res, { attendance: await attendanceService.update(req.params.id, req.body, req.hrScope) })
);

// ------------------------------------------------------------------ leave

const listLeave = asyncHandler(async (req, res) => ok(res, await leaveService.list(req.query, req.hrScope)));

const getLeave = asyncHandler(async (req, res) => ok(res, { leave: await leaveService.getById(req.params.id, req.hrScope) }));

const createLeave = asyncHandler(async (req, res) =>
  ok(res, { leave: await leaveService.create(req.body, req.hrScope, req.user.id) }, 201)
);

const updateLeave = asyncHandler(async (req, res) =>
  ok(res, { leave: await leaveService.update(req.params.id, req.body, req.hrScope) })
);

const approveLeave = asyncHandler(async (req, res) =>
  ok(res, { leave: await leaveService.approve(req.params.id, req.body, req.user.id) })
);

const rejectLeave = asyncHandler(async (req, res) =>
  ok(res, { leave: await leaveService.reject(req.params.id, req.body, req.user.id) })
);

const cancelLeave = asyncHandler(async (req, res) =>
  ok(res, { leave: await leaveService.cancel(req.params.id, req.hrScope) })
);

// -------------------------------------------------- labour directory & history
const labourDirectoryModel = require('../models/labourDirectoryModel');

const listLabourDirectory = asyncHandler(async (req, res) => {
  const result = await labourDirectoryModel.getDirectory({
    ...req.query,
    hrScope: req.hrScope,
  });
  ok(res, result);
});

const getWorkerHistory = asyncHandler(async (req, res) => {
  const workerType = req.params.workerType || req.query.workerType || 'labour';
  const data = await labourDirectoryModel.getWorkHistory(req.params.id, workerType);
  if (!data) return res.status(404).json({ success: false, message: 'Worker not found' });
  ok(res, data);
});

const workforceLookup = asyncHandler(async (req, res) => {
  const list = await labourDirectoryModel.getWorkforceLookup({
    hrScope: req.hrScope,
    search: req.query.search,
  });
  ok(res, { workforce: list, workers: list });
});


const diary = asyncHandler(async (req, res) => {
  const result = await labourDirectoryModel.getLabourDiary({
    ...req.query,
    hrScope: req.hrScope,
  });
  return ok(res, result);
});

module.exports = {
  dashboardSummary, siteWorkforce,
  listWorkers, workerSkillCategories, getWorker, createWorker, updateWorker,
  listAssignments, getAssignment, createAssignment, updateAssignment, endAssignment,
  listRequests, getRequest, createRequest, updateRequest, submitRequest, reviewRequest,
  approveRequest, rejectRequest, cancelRequest, completeRequest, assignRequestWorker,
  listAttendance, getAttendance, markAttendance, updateAttendance,
  listLeave, getLeave, createLeave, updateLeave, approveLeave, rejectLeave, cancelLeave,
  listLabourDirectory, getWorkerHistory, workforceLookup, diary,
};
