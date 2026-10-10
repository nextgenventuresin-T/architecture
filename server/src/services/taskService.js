'use strict';

const ApiError = require('../utils/ApiError');
const taskModel = require('../models/taskModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');

async function listTasks(query = {}, hrScope) {
  let contractorId = null;
  if (hrScope?.role === 'contractor') {
    contractorId = Number(hrScope.contractorId);
  } else if (query.contractorId) {
    contractorId = Number(query.contractorId);
  }

  const tasks = await taskModel.findAllTasks({
    projectId: query.projectId,
    siteId: query.siteId,
    contractorId,
    status: query.status,
    search: query.search,
  });

  return { tasks };
}

async function getTaskDetail(taskId, hrScope) {
  const task = await taskModel.findTaskById(taskId);
  if (!task) throw ApiError.notFound('Task not found.');

  if (hrScope?.role === 'contractor') {
    const cId = Number(hrScope.contractorId);
    const isAssigned =
      Number(task.site_contractor_id) === cId ||
      Number(task.project_contractor_id) === cId ||
      (await isContractorAssignedToProjectOrSite(cId, task.projectId, task.siteId));

    if (!isAssigned) {
      throw ApiError.notFound('Task not found or not assigned to your organization.');
    }
  }

  return { task, ...task };
}

async function isContractorAssignedToProjectOrSite(contractorId, projectId, siteId) {
  if (siteId) {
    const site = await siteModel.findById(siteId);
    if (site && Number(site.contractor_id) === Number(contractorId)) return true;
  }
  const project = await projectModel.findById(projectId);
  if (project && Number(project.contractor_id) === Number(contractorId)) return true;
  return false;
}

async function createTask(payload, userId, hrScope) {
  if (hrScope?.role === 'contractor') {
    throw ApiError.forbidden('Contractors are not authorized to create project tasks or budgets. Only Admin can create tasks.');
  }

  if (!payload.name?.trim()) {
    throw ApiError.badRequest('Task name is required.');
  }

  const projectId = Number(payload.project_id);
  if (!projectId) {
    throw ApiError.badRequest('Project ID is required.');
  }

  const project = await projectModel.findById(projectId);
  if (!project) throw ApiError.badRequest('Specified project does not exist.');

  if (payload.site_id) {
    const site = await siteModel.findById(payload.site_id);
    if (!site || Number(site.project_id) !== projectId) {
      throw ApiError.badRequest('Specified site does not belong to this project.');
    }
  }

  const taskId = await taskModel.createTask({
    ...payload,
    created_by: userId,
  });

  return getTaskDetail(taskId, hrScope);
}

async function updateTask(taskId, payload, userId, hrScope) {
  const existing = await taskModel.findTaskById(taskId);
  if (!existing) throw ApiError.notFound('Task not found.');

  if (hrScope?.role === 'contractor') {
    // Contractors cannot modify budgets or planning
    const hasBudgetChanges =
      payload.materials !== undefined ||
      payload.tools !== undefined ||
      payload.labour !== undefined ||
      payload.misc !== undefined ||
      payload.name !== undefined ||
      payload.duration_days !== undefined;

    if (hasBudgetChanges) {
      throw ApiError.forbidden('Contractors cannot modify Admin-created task budgets or planning.');
    }

    // Contractor can only update progress percentage and status
    const allowedPayload = {};
    if (payload.progress !== undefined) allowedPayload.progress = payload.progress;
    if (payload.status !== undefined) allowedPayload.status = payload.status;

    await taskModel.updateTask(taskId, allowedPayload);
    return getTaskDetail(taskId, hrScope);
  }

  // Admin updates
  if (payload.project_id && Number(payload.project_id) !== existing.projectId) {
    const project = await projectModel.findById(payload.project_id);
    if (!project) throw ApiError.badRequest('Specified project does not exist.');
  }

  if (payload.site_id) {
    const site = await siteModel.findById(payload.site_id);
    if (!site) throw ApiError.badRequest('Specified site does not exist.');
  }

  await taskModel.updateTask(taskId, payload);
  return getTaskDetail(taskId, hrScope);
}

async function deleteTask(taskId, hrScope) {
  if (hrScope?.role === 'contractor') {
    throw ApiError.forbidden('Contractors cannot delete tasks.');
  }

  const deleted = await taskModel.deleteTask(taskId);
  if (!deleted) throw ApiError.notFound('Task not found.');
  return { success: true };
}

async function logWorker(taskId, payload, userId, hrScope) {
  const task = await taskModel.findTaskById(taskId);
  if (!task) throw ApiError.notFound('Task not found.');

  let contractorId = payload.contractor_id ? Number(payload.contractor_id) : null;
  if (hrScope?.role === 'contractor') {
    contractorId = Number(hrScope.contractorId);
  }

  if (!payload.worker_name?.trim()) {
    throw ApiError.badRequest('Worker name is required.');
  }

  if (!payload.labour_type?.trim()) {
    throw ApiError.badRequest('Labour type / skill category is required.');
  }

  const workDate = payload.work_date || new Date().toISOString().slice(0, 10);

  const isCompany = (payload.worker_type === 'company_labour' || payload.worker_type === 'company_employee' || payload.workerType === 'company_labour' || payload.workerType === 'company_employee' || String(payload.labour_type || '').toLowerCase().includes('company'));
  const workerType = isCompany ? 'company_labour' : (payload.worker_type || payload.workerType || 'daily_wage');
  const dailyWage = isCompany ? 0.0 : Number(payload.daily_wage || payload.dailyWage || 0.0);

  const logId = await taskModel.addWorkerLog({
    task_id: taskId,
    project_id: task.projectId,
    site_id: task.siteId,
    contractor_id: contractorId,
    daily_work_id: payload.daily_work_id || null,
    worker_id: payload.worker_id || payload.workerId || null,
    worker_type: workerType,
    worker_name: payload.worker_name.trim(),
    worker_code: payload.worker_code || payload.workerCode || null,
    labour_type: (payload.labour_type || (isEmployee ? 'Company Employee' : 'Labour')).trim(),
    work_date: workDate,
    hours_worked: Number(payload.hours_worked || payload.hoursWorked || 8.0),
    daily_wage: dailyWage,
    work_performed: payload.work_performed ? payload.work_performed.trim() : null,
    created_by: userId,
  });

  return { id: logId, message: 'Worker log recorded against task.' };
}

async function getLabourSummary(taskId, hrScope) {
  const task = await taskModel.findTaskById(taskId);
  if (!task) throw ApiError.notFound('Task not found.');

  const summary = await taskModel.getTaskLabourSummary(taskId);
  return { summary };
}


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

async function getPlannedMaterials(taskId, hrScope) {
  const task = await taskModel.findTaskById(taskId);
  if (!task) throw ApiError.notFound('Task not found.');

  if (hrScope?.role === 'contractor') {
    const cId = Number(hrScope.contractorId);
    const isAssigned =
      Number(task.site_contractor_id) === cId ||
      Number(task.project_contractor_id) === cId ||
      (await isContractorAssignedToProjectOrSite(cId, task.projectId, task.siteId));

    if (!isAssigned) {
      throw ApiError.notFound('Task not found or not assigned to your organization.');
    }
  }

  const materials = await taskModel.findPlannedMaterials(taskId);
  return { materials };
}

/**
 * Machines & tools planned for the task with their estimated cost from the task budget.
 * Whether the machine is rented or purchased is Admin's decision, so a contractor gets
 * the plan and its estimate but not the rent / purchase mode.
 */
async function getPlannedTools(taskId, hrScope) {
  await getPlannedMaterials(taskId, hrScope); // same existence + contractor assignment check
  const tools = await taskModel.findPlannedTools(taskId);
  if (hrScope?.role === 'contractor') return { tools: tools.map(({ rentalType, ...t }) => t) };
  return { tools };
}

async function getBudgetApprovals(taskId) {
  const approvals = await taskModel.getTaskBudgetApprovals(taskId);
  return { approvals };
}

module.exports = {
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
  getPlannedMaterials,
  getPlannedTools,
  getBudgetApprovals,
};
