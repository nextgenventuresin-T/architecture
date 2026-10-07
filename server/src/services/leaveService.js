'use strict';

const ApiError = require('../utils/ApiError');
const leaveModel = require('../models/leaveModel');
const employeeModel = require('../models/employeeModel');

const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid', 'other'];
const TRANSITIONS = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};

function assertTransition(from, to) {
  if (!(TRANSITIONS[from] || []).includes(to)) {
    throw ApiError.badRequest(`Cannot move a leave request from ${from} to ${to}.`);
  }
}

function toLeave(row) {
  if (!row) return null;
  return {
    id: row.id,
    employee: { id: row.employee_id, name: row.employee_name, designation: row.employee_designation, code: row.employee_code },
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    days: Number(row.days || 0),
    reason: row.reason,
    status: row.status,
    appliedOn: row.applied_on,
    decidedBy: row.decided_by,
    decidedOn: row.decided_on,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Resolves which employee_id a query/write is scoped to.
 *  - EMPLOYEE: always their own linked employee record — never a
 *    client-supplied id, so one employee can never read or act on another's
 *    leave.
 *  - ADMIN/HR: whatever employeeId they optionally filtered by (or none).
 */
async function scopeEmployeeId(hrScope, requestedEmployeeId) {
  if (hrScope.role === 'employee') {
    if (!hrScope.employeeId) throw ApiError.forbidden('This account is not linked to an employee profile.');
    return hrScope.employeeId;
  }
  return requestedEmployeeId ? Number(requestedEmployeeId) : undefined;
}

async function list(query, hrScope) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));
  const employeeId = await scopeEmployeeId(hrScope, query.employeeId);

  const { rows, total } = await leaveModel.findAll({ ...query, employeeId, page, pageSize });

  return {
    leaves: rows.map(toLeave),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id, hrScope) {
  const employeeId = hrScope.role === 'employee' ? hrScope.employeeId : null;
  const row = await leaveModel.findById(id, employeeId);
  if (!row) throw ApiError.notFound('That leave request does not exist.');
  return toLeave(row);
}

async function create(payload, hrScope, actorUserId) {
  let employeeId;
  if (hrScope.role === 'employee') {
    if (!hrScope.employeeId) throw ApiError.forbidden('This account is not linked to an employee profile.');
    employeeId = hrScope.employeeId;
  } else {
    employeeId = Number(payload.employeeId ?? payload.employee_id);
    if (!employeeId) throw ApiError.badRequest('Check the highlighted fields.', { employeeId: 'Select an employee.' });
    const employee = await employeeModel.findById(employeeId);
    if (!employee) throw ApiError.notFound('That employee does not exist.');
  }

  const leaveType = payload.leaveType ?? payload.leave_type ?? 'casual';
  if (!LEAVE_TYPES.includes(leaveType)) {
    throw ApiError.badRequest('Check the highlighted fields.', { leaveType: 'Choose a valid leave type.' });
  }

  const startDate = payload.startDate ?? payload.start_date;
  const endDate = payload.endDate ?? payload.end_date;
  if (!startDate || !endDate || new Date(endDate) < new Date(startDate)) {
    throw ApiError.badRequest('Check the highlighted fields.', { endDate: 'End date must be on or after the start date.' });
  }

  const id = await leaveModel.create({
    employee_id: employeeId,
    leave_type: leaveType,
    start_date: startDate,
    end_date: endDate,
    reason: payload.reason ?? null,
    status: 'PENDING',
    applied_on: new Date().toISOString().slice(0, 10),
  });

  return getById(id, hrScope);
}

async function update(id, payload, hrScope) {
  const employeeId = hrScope.role === 'employee' ? hrScope.employeeId : null;
  const row = await leaveModel.findById(id, employeeId);
  if (!row) throw ApiError.notFound('That leave request does not exist.');
  if (row.status !== 'PENDING') {
    throw ApiError.badRequest('Only a pending leave request can be edited.');
  }

  if (payload.leaveType && !LEAVE_TYPES.includes(payload.leaveType)) {
    throw ApiError.badRequest('Check the highlighted fields.', { leaveType: 'Choose a valid leave type.' });
  }

  await leaveModel.update(id, {
    leave_type: payload.leaveType ?? payload.leave_type,
    start_date: payload.startDate ?? payload.start_date,
    end_date: payload.endDate ?? payload.end_date,
    reason: payload.reason,
  });

  return getById(id, hrScope);
}

async function approve(id, { decisionNote } = {}, actorUserId) {
  const row = await leaveModel.findById(id);
  if (!row) throw ApiError.notFound('That leave request does not exist.');
  assertTransition(row.status, 'APPROVED');
  await leaveModel.decide(id, { status: 'APPROVED', decidedBy: actorUserId, decisionNote });
  return getById(id, { role: 'admin' });
}

async function reject(id, { decisionNote } = {}, actorUserId) {
  const row = await leaveModel.findById(id);
  if (!row) throw ApiError.notFound('That leave request does not exist.');
  assertTransition(row.status, 'REJECTED');
  if (!decisionNote) throw ApiError.badRequest('Check the highlighted fields.', { decisionNote: 'Explain why this leave is being rejected.' });
  await leaveModel.decide(id, { status: 'REJECTED', decidedBy: actorUserId, decisionNote });
  return getById(id, { role: 'admin' });
}

async function cancel(id, hrScope) {
  const employeeId = hrScope.role === 'employee' ? hrScope.employeeId : null;
  const row = await leaveModel.findById(id, employeeId);
  if (!row) throw ApiError.notFound('That leave request does not exist.');
  assertTransition(row.status, 'CANCELLED');
  await leaveModel.cancel(id);
  return getById(id, hrScope);
}

module.exports = { list, getById, create, update, approve, reject, cancel, toLeave, LEAVE_TYPES };
