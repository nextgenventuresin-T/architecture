'use strict';

const ApiError = require('../utils/ApiError');
const attendanceModel = require('../models/attendanceModel');
const employeeModel = require('../models/employeeModel');
const contractorWorkerModel = require('../models/contractorWorkerModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');

const LABOUR_TYPES = ['company', 'contractor'];
const STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'];

function toAttendance(row) {
  if (!row) return null;
  return {
    id: row.id,
    date: row.attendance_date,
    labourType: row.labour_type,
    worker: row.labour_type === 'company'
      ? { kind: 'employee', id: row.employee_id, name: row.employee_name, designation: row.employee_designation }
      : { kind: 'contractor_worker', id: row.contractor_worker_id, name: row.worker_name, skillCategory: row.worker_skill },
    contractor: row.contractor_id ? { id: row.contractor_id, name: row.contractor_name } : null,
    project: row.project_id ? { id: row.project_id, name: row.project_name } : null,
    site: row.site_id ? { id: row.site_id, name: row.site_name } : null,
    status: row.status,
    checkIn: row.check_in,
    checkOut: row.check_out,
    remarks: row.remarks,
    recordedBy: row.recorded_by,
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
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const contractorId = scopeContractorId(hrScope, query.contractorId);

  // An EMPLOYEE may only ever see their own attendance history — never
  // another employee's, and never contractor labour's, regardless of any
  // employeeId supplied in the query string.
  let employeeId = query.employeeId;
  if (hrScope.role === 'employee') {
    if (!hrScope.employeeId) throw ApiError.forbidden('This account is not linked to an employee profile.');
    employeeId = hrScope.employeeId;
  }

  const { rows, total } = await attendanceModel.findAll({ ...query, contractorId, employeeId, page, pageSize });

  return {
    records: rows.map(toAttendance),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id, hrScope) {
  const contractorId = hrScope.role === 'contractor' ? hrScope.contractorId : null;
  const row = await attendanceModel.findById(id, contractorId);
  if (!row) throw ApiError.notFound('That attendance record does not exist.');
  if (hrScope.role === 'employee' && row.employee_id !== hrScope.employeeId) {
    throw ApiError.notFound('That attendance record does not exist.');
  }
  return toAttendance(row);
}

/**
 * Marks (or updates, if a record for this worker+date already exists — an
 * upsert rather than a duplicate) one worker's attendance for a day.
 * A CONTRACTOR may only mark attendance for their own contractor_worker;
 * enforced here, not just by hiding the picker on the frontend.
 */
async function mark(payload, hrScope, actorUserId) {
  if (hrScope.role === 'employee') {
    // Attendance is recorded by HR (for company labour) or by the
    // contractor (for their own workers) — an employee views their own
    // history but does not self-mark it.
    throw ApiError.forbidden('Employees cannot record attendance.');
  }

  const labourType = payload.labourType ?? payload.labour_type;
  if (!LABOUR_TYPES.includes(labourType)) {
    throw ApiError.badRequest('Check the highlighted fields.', { labourType: 'Choose company or contractor.' });
  }

  const status = payload.status ?? 'PRESENT';
  if (!STATUSES.includes(status)) {
    throw ApiError.badRequest('Check the highlighted fields.', { status: 'Choose a valid attendance status.' });
  }

  const attendanceDate = payload.date ?? payload.attendance_date ?? new Date().toISOString().slice(0, 10);

  let employeeId = null;
  let contractorWorkerId = null;
  let contractorId = null;

  if (labourType === 'company') {
    if (hrScope.role === 'contractor') {
      throw ApiError.forbidden('Contractors can only record attendance for their own workers.');
    }
    employeeId = Number(payload.employeeId ?? payload.employee_id);
    const employee = await employeeModel.findById(employeeId);
    if (!employee) throw ApiError.notFound('That employee does not exist.');
  } else {
    contractorWorkerId = Number(payload.contractorWorkerId ?? payload.contractor_worker_id);
    const worker = await contractorWorkerModel.findById(
      contractorWorkerId,
      hrScope.role === 'contractor' ? hrScope.contractorId : null
    );
    if (!worker) throw ApiError.notFound('That worker does not exist.');
    contractorId = worker.contractor_id;
  }

  const rawProjectId = payload.projectId ?? payload.project_id;
  const projectId = rawProjectId ? Number(rawProjectId) : null;
  if (projectId) {
    const project = await projectModel.findById(projectId);
    if (!project) throw ApiError.notFound('That project does not exist.');
  }

  const rawSiteId = payload.siteId ?? payload.site_id;
  const siteId = rawSiteId ? Number(rawSiteId) : null;
  if (siteId) {
    const site = await siteModel.findById(siteId);
    if (!site || (projectId && site.project_id !== projectId)) {
      throw ApiError.notFound('That site does not exist on this project.');
    }
  }

  const existing = await attendanceModel.findExisting({ attendanceDate, employeeId, contractorWorkerId });

  const record = {
    attendance_date: attendanceDate,
    labour_type: labourType,
    employee_id: employeeId,
    contractor_worker_id: contractorWorkerId,
    contractor_id: contractorId,
    project_id: projectId,
    site_id: siteId,
    status,
    check_in: payload.checkIn ?? payload.check_in ?? null,
    check_out: payload.checkOut ?? payload.check_out ?? null,
    remarks: payload.remarks ?? null,
    recorded_by: actorUserId ?? null,
  };

  const id = existing
    ? existing.id
    : await attendanceModel.create(record);

  if (existing) {
    await attendanceModel.update(id, {
      status: record.status,
      check_in: record.check_in,
      check_out: record.check_out,
      remarks: record.remarks,
    });
  }

  return getById(id, hrScope);
}

async function update(id, payload, hrScope) {
  await getById(id, hrScope);

  if (payload.status && !STATUSES.includes(payload.status)) {
    throw ApiError.badRequest('Check the highlighted fields.', { status: 'Choose a valid attendance status.' });
  }

  await attendanceModel.update(id, {
    status: payload.status,
    check_in: payload.checkIn ?? payload.check_in,
    check_out: payload.checkOut ?? payload.check_out,
    remarks: payload.remarks,
  });

  return getById(id, hrScope);
}

module.exports = { list, getById, mark, update, toAttendance };
