'use strict';

const ApiError = require('../utils/ApiError');
const labourAssignmentModel = require('../models/labourAssignmentModel');
const employeeModel = require('../models/employeeModel');
const contractorWorkerModel = require('../models/contractorWorkerModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');

const LABOUR_TYPES = ['company', 'contractor'];
const STATUSES = ['active', 'completed', 'cancelled'];

function toAssignment(row) {
  if (!row) return null;
  return {
    id: row.id,
    labourType: row.labour_type,
    worker: row.labour_type === 'company'
      ? { kind: 'employee', id: row.employee_id, name: row.employee_name, designation: row.employee_designation }
      : { kind: 'contractor_worker', id: row.contractor_worker_id, name: row.worker_name, skillCategory: row.worker_skill },
    contractor: row.contractor_id ? { id: row.contractor_id, name: row.contractor_name } : null,
    project: { id: row.project_id, name: row.project_name, code: row.project_code },
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    notes: row.notes,
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

  const { rows, total } = await labourAssignmentModel.findAll({ ...query, contractorId, page, pageSize });

  return {
    assignments: rows.map(toAssignment),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id, hrScope) {
  const contractorId = hrScope.role === 'contractor' ? hrScope.contractorId : null;
  const row = await labourAssignmentModel.findById(id, contractorId);
  if (!row) throw ApiError.notFound('That assignment does not exist.');
  return toAssignment(row);
}

/**
 * Posts one worker (company employee or contractor worker) to a
 * project/site. Restricted to ADMIN/HR at the route layer — deciding who
 * covers a site is an HR/Admin call, mirroring how Interface 4 gates
 * contractor-to-project assignment to Admin only.
 */
async function create(payload, actorUserId) {
  const labourType = payload.labourType ?? payload.labour_type;
  if (!LABOUR_TYPES.includes(labourType)) {
    throw ApiError.badRequest('Check the highlighted fields.', { labourType: 'Choose company or contractor.' });
  }

  const projectId = Number(payload.projectId ?? payload.project_id);
  const project = await projectModel.findById(projectId);
  if (!project) throw ApiError.notFound('That project does not exist.');

  let siteId = payload.siteId ?? payload.site_id;
  if (siteId) {
    siteId = Number(siteId);
    const site = await siteModel.findById(siteId);
    if (!site || site.project_id !== projectId) throw ApiError.notFound('That site does not exist on this project.');
  } else {
    siteId = null;
  }

  const record = {
    labour_type: labourType,
    project_id: projectId,
    site_id: siteId,
    start_date: payload.startDate ?? payload.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: payload.endDate ?? payload.end_date ?? null,
    status: 'active',
    assigned_by: actorUserId ?? null,
    notes: payload.notes ?? null,
  };

  if (labourType === 'company') {
    const employeeId = Number(payload.employeeId ?? payload.employee_id);
    const employee = await employeeModel.findById(employeeId);
    if (!employee) throw ApiError.notFound('That employee does not exist.');
    record.employee_id = employeeId;
    record.contractor_worker_id = null;
    record.contractor_id = null;
  } else {
    const workerId = Number(payload.contractorWorkerId ?? payload.contractor_worker_id);
    const worker = await contractorWorkerModel.findById(workerId);
    if (!worker) throw ApiError.notFound('That worker does not exist.');
    record.employee_id = null;
    record.contractor_worker_id = workerId;
    record.contractor_id = worker.contractor_id;
  }

  const id = await labourAssignmentModel.create(record);
  return getById(id, { role: 'admin' });
}

async function update(id, payload, hrScope) {
  await getById(id, hrScope);

  if (payload.status && !STATUSES.includes(payload.status)) {
    throw ApiError.badRequest('Check the highlighted fields.', { status: 'Choose a valid status.' });
  }

  await labourAssignmentModel.update(id, {
    start_date: payload.startDate ?? payload.start_date,
    end_date: payload.endDate ?? payload.end_date,
    status: payload.status,
    notes: payload.notes,
  });

  return getById(id, hrScope);
}

async function end(id, payload, hrScope) {
  await getById(id, hrScope);
  await labourAssignmentModel.endAssignment(id, payload.endDate ?? payload.end_date ?? null, 'completed');
  return getById(id, hrScope);
}

module.exports = { list, getById, create, update, end, toAssignment };
