'use strict';

const ApiError = require('../utils/ApiError');
const contractorWorkerModel = require('../models/contractorWorkerModel');
const contractorModel = require('../models/contractorModel');

const STATUSES = ['active', 'inactive'];

function toWorker(row) {
  if (!row) return null;
  const isCompany = row.is_company_labour === 1 || row.worker_type === 'company_labour';
  return {
    id: row.id,
    contractorId: row.contractor_id,
    contractorName: isCompany ? 'Company Labour (In-House)' : (row.contractor_name || 'Independent'),
    workerCode: row.worker_code,
    fullName: row.full_name,
    phone: row.phone,
    aadhaarNumber: row.aadhaar_number || null,
    skillCategory: row.skill_category,
    dailyRate: isCompany ? 0 : Number(row.daily_rate || 0),
    status: row.status,
    workerType: isCompany ? 'company_labour' : 'daily_wage',
    isCompanyLabour: isCompany,
    joiningDate: row.joining_date,
    notes: row.notes,
    activeAssignmentCount: Number(row.active_assignment_count || 0),
    projectName: row.project_name || null,
    projectCode: row.project_code || null,
    siteName: row.site_name || null,
    assignedWork: row.work_notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Resolves the contractor_id a query/write should be scoped to.
 *  - CONTRACTOR: always their own id (req.hrScope.contractorId), regardless
 *    of anything supplied in the query string or body. This is what makes
 *    "Contractor A cannot see/touch Contractor B" a server-side guarantee.
 *  - ADMIN/HR: whatever contractorId they optionally filtered by (or none,
 *    for "all contractors").
 */
function scopeContractorId(hrScope, requestedContractorId) {
  if (hrScope.role === 'contractor') return hrScope.contractorId;
  return requestedContractorId ? Number(requestedContractorId) : undefined;
}

async function list(query, hrScope) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));
  const contractorId = scopeContractorId(hrScope, query.contractorId);

  const { rows, total } = await contractorWorkerModel.findAll({ ...query, contractorId, page, pageSize });

  return {
    workers: rows.map(toWorker),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id, hrScope) {
  const contractorId = hrScope.role === 'contractor' ? hrScope.contractorId : null;
  const row = await contractorWorkerModel.findById(id, contractorId);
  // 404, not 403 — matches authorize.js's requireProjectAccess reasoning:
  // confirming existence to someone with no right to see it leaks data shape.
  if (!row) throw ApiError.notFound('That worker does not exist.');
  return toWorker(row);
}

async function create(payload, hrScope) {
  const isCompany = payload.workerType === 'company_labour' || payload.worker_type === 'company_labour' || Boolean(payload.isCompanyLabour || payload.is_company_labour);

  let contractorId;
  if (isCompany) {
    contractorId = null;
  } else if (hrScope.role === 'contractor') {
    contractorId = hrScope.contractorId; // never trust a client-supplied contractor_id
  } else {
    contractorId = Number(payload.contractorId ?? payload.contractor_id);
    if (!contractorId) throw ApiError.badRequest('Check the highlighted fields.', { contractorId: 'Select a contractor.' });
    const contractor = await contractorModel.findById(contractorId);
    if (!contractor) throw ApiError.notFound('That contractor does not exist.');
  }

  let workerCode = payload.workerCode ?? payload.worker_code;
  if (workerCode) {
    const existing = await contractorWorkerModel.findByCode(workerCode);
    if (existing) throw ApiError.badRequest('Check the highlighted fields.', { workerCode: 'That worker ID is already in use.' });
  } else {
    const nextNum = await contractorWorkerModel.nextCodeNumber();
    workerCode = `CW-${String(nextNum).padStart(4, '0')}`;
  }

  const id = await contractorWorkerModel.create({
    contractor_id: contractorId,
    worker_code: workerCode,
    full_name: payload.fullName ?? payload.full_name,
    phone: payload.phone ?? null,
    aadhaar_number: payload.aadhaarNumber ?? payload.aadhaar_number ?? null,
    skill_category: payload.skillCategory ?? payload.skill_category ?? 'general',
    daily_rate: isCompany ? 0 : (payload.dailyRate ?? payload.daily_rate ?? 0),
    status: payload.status ?? 'active',
    joining_date: payload.joiningDate ?? payload.joining_date ?? null,
    notes: payload.notes ?? null,
    is_company_labour: isCompany ? 1 : 0,
    worker_type: isCompany ? 'company_labour' : 'daily_wage',
  });

  return getById(id, hrScope);
}

async function update(id, payload, hrScope) {
  const existing = await getById(id, hrScope); // 404s when missing or out of scope

  if (payload.status && !STATUSES.includes(payload.status)) {
    throw ApiError.badRequest('Check the highlighted fields.', { status: 'Choose a valid status.' });
  }

  let isCompany = existing.isCompanyLabour;
  if (payload.workerType !== undefined || payload.worker_type !== undefined) {
    const wt = payload.workerType ?? payload.worker_type;
    isCompany = (wt === 'company_labour');
  } else if (payload.isCompanyLabour !== undefined || payload.is_company_labour !== undefined) {
    isCompany = Boolean(payload.isCompanyLabour ?? payload.is_company_labour);
  }

  let contractorId = existing.contractorId;
  if (isCompany) {
    contractorId = null;
  } else if (payload.contractorId !== undefined || payload.contractor_id !== undefined) {
    contractorId = payload.contractorId ?? payload.contractor_id;
  }

  await contractorWorkerModel.update(id, {
    full_name: payload.fullName ?? payload.full_name,
    phone: payload.phone,
    aadhaar_number: payload.aadhaarNumber ?? payload.aadhaar_number,
    skill_category: payload.skillCategory ?? payload.skill_category,
    daily_rate: isCompany ? 0 : (payload.dailyRate ?? payload.daily_rate ?? existing.dailyRate),
    status: payload.status,
    joining_date: payload.joiningDate ?? payload.joining_date,
    notes: payload.notes,
    is_company_labour: isCompany ? 1 : 0,
    worker_type: isCompany ? 'company_labour' : 'daily_wage',
    contractor_id: contractorId,
  });

  return getById(id, hrScope);
}

async function remove(id, hrScope) {
  await getById(id, hrScope); // 404s when missing or out of scope
  return contractorWorkerModel.remove(id);
}

async function getSkillCategories() {
  return contractorWorkerModel.findSkillCategories();
}

module.exports = { list, getById, create, update, remove, getSkillCategories, toWorker, scopeContractorId };
