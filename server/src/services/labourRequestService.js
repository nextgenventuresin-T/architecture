'use strict';

const ApiError = require('../utils/ApiError');
const labourRequestModel = require('../models/labourRequestModel');
const labourAssignmentModel = require('../models/labourAssignmentModel');
const contractorWorkerModel = require('../models/contractorWorkerModel');
const employeeModel = require('../models/employeeModel');
const contractorModel = require('../models/contractorModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const STATUSES = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_ASSIGNED',
  'FULLY_ASSIGNED', 'REJECTED', 'CANCELLED', 'COMPLETED',
];

/** Allowed next statuses per current status. Anything not listed here is a
 * dead end — matches the STATUS_TRANSITIONS convention already used by
 * financeService/procurementService for expense and PO status. */
const TRANSITIONS = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['PARTIALLY_ASSIGNED', 'FULLY_ASSIGNED', 'CANCELLED'],
  PARTIALLY_ASSIGNED: ['FULLY_ASSIGNED', 'CANCELLED'],
  FULLY_ASSIGNED: ['COMPLETED'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

function assertTransition(from, to) {
  if (!(TRANSITIONS[from] || []).includes(to)) {
    throw ApiError.badRequest(`Cannot move a request from ${from} to ${to}.`);
  }
}

function toRequest(row) {
  if (!row) return null;
  const quantity = Number(row.quantity || 0);
  const assignedCount = Number(row.assigned_count || 0);
  return {
    id: row.id,
    requestNumber: row.request_number,
    contractor: { id: row.contractor_id, name: row.contractor_name },
    project: { id: row.project_id, name: row.project_name, code: row.project_code },
    site: { id: row.site_id, name: row.site_name },
    skillCategory: row.skill_category,
    quantity,
    requiredDate: row.required_date,
    durationDays: row.duration_days,
    priority: row.priority,
    reason: row.reason,
    status: row.status,
    requestedBy: row.requested_by,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    decisionNote: row.decision_note,
    assignedCount,
    remainingCount: Math.max(0, quantity - assignedCount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function scopeContractorId(hrScope, requestedContractorId) {
  if (hrScope.role === 'contractor') return hrScope.contractorId;
  return requestedContractorId ? Number(requestedContractorId) : undefined;
}

async function list(query, hrScope) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));
  const contractorId = scopeContractorId(hrScope, query.contractorId);

  const { rows, total } = await labourRequestModel.findAll({ ...query, contractorId, page, pageSize });

  return {
    requests: rows.map(toRequest),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id, hrScope) {
  const contractorId = hrScope.role === 'contractor' ? hrScope.contractorId : null;
  const row = await labourRequestModel.findById(id, contractorId);
  if (!row) throw ApiError.notFound('That labour request does not exist.');
  return toRequest(row);
}

async function getDetail(id, hrScope) {
  const request = await getById(id, hrScope);
  const fulfilments = await labourRequestModel.findFulfilments(id);
  return { request, fulfilments };
}

/**
 * A contractor may only request labour for a site they are already assigned
 * to — checked against the same `sites.contractor_id` / `projects.contractor_id`
 * columns Interface 3/4 use for contractor-to-project assignment, so this
 * reuses the existing accountability record rather than inventing a new one.
 */
async function assertContractorOwnsSite(contractorId, projectId, siteId) {
  const site = await siteModel.findById(siteId);
  if (!site || site.project_id !== projectId) throw ApiError.notFound('That site does not exist on this project.');

  const project = await projectModel.findById(projectId);
  const ownsViaSite = site.contractor_id === contractorId;
  const ownsViaProject = project?.contractor_id === contractorId;
  if (!ownsViaSite && !ownsViaProject) {
    throw ApiError.forbidden('You are not assigned to this project/site.');
  }
  return { project, site };
}

async function create(payload, hrScope, actorUserId) {
  let contractorId;
  if (hrScope.role === 'contractor') {
    contractorId = hrScope.contractorId;
  } else {
    contractorId = Number(payload.contractorId ?? payload.contractor_id);
    if (!contractorId) throw ApiError.badRequest('Check the highlighted fields.', { contractorId: 'Select a contractor.' });
    const contractor = await contractorModel.findById(contractorId);
    if (!contractor) throw ApiError.notFound('That contractor does not exist.');
  }

  const projectId = Number(payload.projectId ?? payload.project_id);
  const siteId = Number(payload.siteId ?? payload.site_id);
  await assertContractorOwnsSite(contractorId, projectId, siteId);

  const priority = payload.priority ?? 'medium';
  if (!PRIORITIES.includes(priority)) {
    throw ApiError.badRequest('Check the highlighted fields.', { priority: 'Choose a valid priority.' });
  }

  const nextNum = await labourRequestModel.nextRequestNumber();
  const requestNumber = `LR-${String(nextNum).padStart(4, '0')}`;

  const id = await labourRequestModel.create({
    request_number: requestNumber,
    contractor_id: contractorId,
    project_id: projectId,
    site_id: siteId,
    skill_category: payload.skillCategory ?? payload.skill_category,
    quantity: Number(payload.quantity ?? 1),
    required_date: payload.requiredDate ?? payload.required_date,
    duration_days: Number(payload.durationDays ?? payload.duration_days ?? 1),
    priority,
    reason: payload.reason ?? null,
    status: payload.submit ? 'SUBMITTED' : 'DRAFT',
    requested_by: actorUserId ?? null,
  });

  return getById(id, hrScope);
}

async function update(id, payload, hrScope) {
  const contractorId = hrScope.role === 'contractor' ? hrScope.contractorId : null;
  const row = await labourRequestModel.findById(id, contractorId);
  if (!row) throw ApiError.notFound('That labour request does not exist.');
  if (row.status !== 'DRAFT') {
    throw ApiError.badRequest('Only a draft request can be edited. Submit a new request instead.');
  }

  if (payload.priority && !PRIORITIES.includes(payload.priority)) {
    throw ApiError.badRequest('Check the highlighted fields.', { priority: 'Choose a valid priority.' });
  }

  await labourRequestModel.update(id, {
    project_id: payload.projectId ?? payload.project_id,
    site_id: payload.siteId ?? payload.site_id,
    skill_category: payload.skillCategory ?? payload.skill_category,
    quantity: payload.quantity !== undefined ? Number(payload.quantity) : undefined,
    required_date: payload.requiredDate ?? payload.required_date,
    duration_days: payload.durationDays !== undefined ? Number(payload.durationDays) : undefined,
    priority: payload.priority,
    reason: payload.reason,
  });

  return getById(id, hrScope);
}

async function submit(id, hrScope) {
  const contractorId = hrScope.role === 'contractor' ? hrScope.contractorId : null;
  const row = await labourRequestModel.findById(id, contractorId);
  if (!row) throw ApiError.notFound('That labour request does not exist.');
  assertTransition(row.status, 'SUBMITTED');
  await labourRequestModel.updateStatus(id, 'SUBMITTED');
  return getById(id, hrScope);
}

/** HR/Admin marks a submitted request as under active review. */
async function review(id, actorUserId) {
  const row = await labourRequestModel.findById(id);
  if (!row) throw ApiError.notFound('That labour request does not exist.');
  assertTransition(row.status, 'UNDER_REVIEW');
  await labourRequestModel.updateStatus(id, 'UNDER_REVIEW');
  return getById(id, { role: 'admin' });
}

async function approve(id, { decisionNote } = {}, actorUserId) {
  const row = await labourRequestModel.findById(id);
  if (!row) throw ApiError.notFound('That labour request does not exist.');
  assertTransition(row.status, 'APPROVED');
  await labourRequestModel.decide(id, { status: 'APPROVED', reviewedBy: actorUserId, decisionNote });
  return getById(id, { role: 'admin' });
}

async function reject(id, { decisionNote } = {}, actorUserId) {
  const row = await labourRequestModel.findById(id);
  if (!row) throw ApiError.notFound('That labour request does not exist.');
  assertTransition(row.status, 'REJECTED');
  if (!decisionNote) throw ApiError.badRequest('Check the highlighted fields.', { decisionNote: 'Explain why this request is being rejected.' });
  await labourRequestModel.decide(id, { status: 'REJECTED', reviewedBy: actorUserId, decisionNote });
  return getById(id, { role: 'admin' });
}

async function cancel(id, hrScope) {
  const contractorId = hrScope.role === 'contractor' ? hrScope.contractorId : null;
  const row = await labourRequestModel.findById(id, contractorId);
  if (!row) throw ApiError.notFound('That labour request does not exist.');
  assertTransition(row.status, 'CANCELLED');
  await labourRequestModel.updateStatus(id, 'CANCELLED');
  return getById(id, hrScope);
}

async function complete(id, actorUserId) {
  const row = await labourRequestModel.findById(id);
  if (!row) throw ApiError.notFound('That labour request does not exist.');
  assertTransition(row.status, 'COMPLETED');
  await labourRequestModel.updateStatus(id, 'COMPLETED');
  return getById(id, { role: 'admin' });
}

/**
 * HR/Admin assigns one worker to (partially or fully) fulfil an approved
 * request. Creates a real `labour_assignments` posting for that worker on
 * the request's project/site, then records the link in
 * `labour_request_assignments`. Recomputes the request status from the
 * fulfilled count against the requested quantity — this is what
 * "support partial assignment" means concretely.
 */
async function assignWorker(id, payload, actorUserId) {
  const row = await labourRequestModel.findById(id);
  if (!row) throw ApiError.notFound('That labour request does not exist.');
  if (!['APPROVED', 'PARTIALLY_ASSIGNED'].includes(row.status)) {
    throw ApiError.badRequest('Only an approved request can have workers assigned.');
  }

  const alreadyAssigned = await labourRequestModel.countFulfilments(id);
  if (alreadyAssigned >= row.quantity) {
    throw ApiError.badRequest('This request is already fully assigned.');
  }

  const labourType = payload.labourType ?? payload.labour_type ?? 'contractor';
  let employeeId = null;
  let contractorWorkerId = null;

  if (labourType === 'contractor') {
    contractorWorkerId = Number(payload.contractorWorkerId ?? payload.contractor_worker_id);
    const worker = await contractorWorkerModel.findById(contractorWorkerId);
    if (!worker) throw ApiError.notFound('That worker does not exist.');
    if (worker.contractor_id !== row.contractor_id) {
      throw ApiError.badRequest('That worker does not belong to the requesting contractor.');
    }
  } else {
    employeeId = Number(payload.employeeId ?? payload.employee_id);
    const employee = await employeeModel.findById(employeeId);
    if (!employee) throw ApiError.notFound('That employee does not exist.');
  }

  const assignmentId = await labourAssignmentModel.create({
    labour_type: labourType,
    employee_id: employeeId,
    contractor_worker_id: contractorWorkerId,
    contractor_id: labourType === 'contractor' ? row.contractor_id : null,
    project_id: row.project_id,
    site_id: row.site_id,
    start_date: payload.startDate ?? payload.start_date ?? row.required_date,
    end_date: payload.endDate ?? payload.end_date ?? null,
    status: 'active',
    assigned_by: actorUserId ?? null,
    notes: payload.notes ?? `Fulfils labour request ${row.request_number}`,
  });

  await labourRequestModel.createFulfilment({
    labour_request_id: id,
    labour_assignment_id: assignmentId,
    labour_type: labourType,
    employee_id: employeeId,
    contractor_worker_id: contractorWorkerId,
    assigned_by: actorUserId,
    assigned_on: new Date().toISOString().slice(0, 10),
    notes: payload.notes ?? null,
  });

  const totalAssigned = await labourRequestModel.countFulfilments(id);
  const nextStatus = totalAssigned >= row.quantity ? 'FULLY_ASSIGNED' : 'PARTIALLY_ASSIGNED';
  await labourRequestModel.updateStatus(id, nextStatus);

  return getDetail(id, { role: 'admin' });
}

module.exports = {
  list, getById, getDetail, create, update, submit, review, approve, reject,
  cancel, complete, assignWorker, toRequest, PRIORITIES, STATUSES,
};
