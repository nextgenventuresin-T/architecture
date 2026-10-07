const fs = require('fs');

// 1. Update taskService.js
let serviceContent = fs.readFileSync('server/src/services/taskService.js', 'utf8');

const serviceAdditions = `
async function getTaskAssignments(taskId, hrScope) {
  const task = await taskModel.findTaskById(taskId);
  if (!task) throw ApiError.notFound('Task not found.');

  const assignments = await taskModel.getTaskAssignments(taskId);
  return { assignments };
}

async function assignWorkerToTask(taskId, payload, userId, hrScope) {
  const task = await taskModel.findTaskById(taskId);
  if (!task) throw ApiError.notFound('Task not found.');

  let contractorId = payload.contractor_id || payload.contractorId || null;
  if (hrScope?.role === 'contractor') {
    contractorId = Number(hrScope.contractorId);
  }

  const assignmentId = await taskModel.assignWorkerToTask({
    taskId,
    projectId: task.projectId,
    siteId: task.siteId,
    contractorId,
    workerType: payload.worker_type || payload.workerType || 'daily_wage',
    workerId: Number(payload.worker_id || payload.workerId),
    workerName: (payload.worker_name || payload.workerName || '').trim(),
    workerCode: payload.worker_code || payload.workerCode || null,
    phone: payload.phone || null,
    aadhaarNumber: payload.aadhaar_number || payload.aadhaarNumber || null,
    trade: payload.trade || payload.skill_trade || null,
    startDate: payload.start_date || payload.startDate || null,
    endDate: payload.end_date || payload.endDate || null,
    expectedDays: Number(payload.expected_days || payload.expectedDays || 0),
    dailyWage: Number(payload.daily_wage || payload.dailyWage || 0),
    plannedCost: Number(payload.planned_cost || payload.plannedCost || 0),
    remarks: payload.remarks || null,
    assignedBy: userId,
  });

  const assignments = await taskModel.getTaskAssignments(taskId);
  return { id: assignmentId, assignments, message: 'Worker assigned to task successfully.' };
}

async function unassignWorkerFromTask(taskId, assignmentId, userId, hrScope) {
  const task = await taskModel.findTaskById(taskId);
  if (!task) throw ApiError.notFound('Task not found.');

  await taskModel.unassignWorkerFromTask(assignmentId, taskId);
  const assignments = await taskModel.getTaskAssignments(taskId);
  return { assignments, message: 'Worker unassigned from task.' };
}

async function createQuickWorker(payload, userId, hrScope) {
  let contractorId = payload.contractor_id || payload.contractorId || 1;
  if (hrScope?.role === 'contractor') {
    contractorId = Number(hrScope.contractorId);
  }

  const worker = await taskModel.createQuickWorker(payload, contractorId);
  return { worker, message: 'New daily-wage worker created successfully.' };
}
`;

const serviceExportsTarget = `module.exports = {
  listTasks,
  getTaskDetail,
  createTask,
  updateTask,
  deleteTask,
  logWorker,
  getLabourSummary,
};`;

const serviceExportsReplacement = `module.exports = {
  listTasks,
  getTaskDetail,
  createTask,
  updateTask,
  deleteTask,
  logWorker,
  getLabourSummary,
  getTaskAssignments,
  assignWorkerToTask,
  unassignWorkerFromTask,
  createQuickWorker,
};`;

if (!serviceContent.includes('getTaskAssignments,')) {
  serviceContent = serviceContent.replace(serviceExportsTarget, serviceAdditions + '\n' + serviceExportsReplacement);
  fs.writeFileSync('server/src/services/taskService.js', serviceContent, 'utf8');
  console.log('taskService.js updated');
}

// 2. Update taskController.js
let controllerContent = fs.readFileSync('server/src/controllers/taskController.js', 'utf8');

const controllerAdditions = `
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
`;

const controllerExportsTarget = `module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  logWorker,
  labourSummary,
};`;

const controllerExportsReplacement = `module.exports = {
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
};`;

if (!controllerContent.includes('assignments,')) {
  controllerContent = controllerContent.replace(controllerExportsTarget, controllerAdditions + '\n' + controllerExportsReplacement);
  fs.writeFileSync('server/src/controllers/taskController.js', controllerContent, 'utf8');
  console.log('taskController.js updated');
}

// 3. Update taskRoutes.js
let routesContent = fs.readFileSync('server/src/routes/taskRoutes.js', 'utf8');

const routeAdditions = `
router.post('/workers/quick-create', controller.createWorker);

router.get('/:id/assignments', [param('id').isInt({ min: 1 })], validate, controller.assignments);

router.post(
  '/:id/assignments',
  [
    param('id').isInt({ min: 1 }),
    body('worker_name').trim().notEmpty().withMessage('Worker name is required.'),
    body('worker_id').isInt({ min: 1 }).withMessage('Valid worker ID is required.'),
    body('worker_type').isIn(['daily_wage', 'company_employee']).withMessage('Valid worker type is required.'),
  ],
  validate,
  controller.assignWorker
);

router.delete(
  '/:id/assignments/:assignmentId',
  [
    param('id').isInt({ min: 1 }),
    param('assignmentId').isInt({ min: 1 }),
  ],
  validate,
  controller.unassignWorker
);
`;

if (!routesContent.includes('/:id/assignments')) {
  routesContent = routesContent.replace('module.exports = router;', routeAdditions + '\nmodule.exports = router;');
  fs.writeFileSync('server/src/routes/taskRoutes.js', routesContent, 'utf8');
  console.log('taskRoutes.js updated');
}
