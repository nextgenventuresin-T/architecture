'use strict';

const fs = require('fs');
const ApiError = require('../utils/ApiError');
const contractorModel = require('../models/contractorModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');

/** Converts a DB row into the camelCase shape the client consumes. */
function toContractor(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    address: row.address,
    type: row.type,
    status: row.status,
    notes: row.notes,
    speciality: row.speciality,
    panNumber: row.pan_number || null,
    aadhaarNumber: row.aadhaar_number || null,
    gstNumber: row.gst_number || null,
    bankAccountHolder: row.bank_account_holder || null,
    bankAccountNumber: row.bank_account_number || null,
    bankName: row.bank_name || null,
    bankIfsc: row.bank_ifsc || null,
    bankBranch: row.bank_branch || null,
    // snake_case aliases for direct form binding
    pan_number: row.pan_number || null,
    aadhaar_number: row.aadhaar_number || null,
    gst_number: row.gst_number || null,
    bank_account_holder: row.bank_account_holder || null,
    bank_account_number: row.bank_account_number || null,
    bank_name: row.bank_name || null,
    bank_ifsc: row.bank_ifsc || null,
    bank_branch: row.bank_branch || null,
    rating: row.rating !== null ? Number(row.rating) : null,
    createdAt: row.created_at,
    // The login account this contractor's own-data access resolves to
    // (`attachHrScope` → `contractors.user_id`). Null until an admin links one.
    linkedUser: row.linked_user_id
      ? {
        id: row.linked_user_id,
        fullName: row.linked_user_name,
        email: row.linked_user_email,
        isActive: Boolean(row.linked_user_is_active),
      }
      : null,
    stats: {
      projectCount: Number(row.project_count || 0),
      siteCount: Number(row.site_count || 0),
      labourCount: Number(row.labour_count || 0),
      progress: Math.round(Number(row.progress || 0)),
      contractValue: Number(row.contract_value || 0),
      paidAmount: Number(row.paid_amount || 0),
      outstanding: Number(row.contract_value || 0) - Number(row.paid_amount || 0),
      paymentStatus: row.payment_status || 'cleared',
      pendingApprovals: Number(row.pending_approvals || 0),
    },
  };
}

async function list(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));

  const { rows, total } = await contractorModel.findAll({ ...query, page, pageSize });

  return {
    contractors: rows.map(toContractor),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id) {
  const row = await contractorModel.findById(id);
  if (!row) throw ApiError.notFound('That contractor does not exist.');
  return toContractor(row);
}

const contractorDocumentModel = require('../models/contractorDocumentModel');
const contractorPoService = require('./contractorPoService');
const contractorPoModel = require('../models/contractorPoModel');

/** Full detail payload backing the contractor detail screen. */
async function getDetail(id) {
  const contractor = await getById(id);

  const [projects, sites, payments, labour, approvals, documents, posData, poSummary] = await Promise.all([
    contractorModel.findProjects(id),
    contractorModel.findSites(id),
    contractorModel.findPayments(id),
    contractorModel.findLabour(id),
    contractorModel.findApprovals(contractor.name),
    contractorDocumentModel.findByContractorId(id),
    contractorPoService.listPos({ contractorId: id, pageSize: 50 }),
    contractorPoModel.findFinancialSummary(id),
  ]);

  return {
    contractor,
    projects,
    sites,
    payments,
    labour,
    approvals,
    documents,
    pos: posData.pos,
    poSummary,
  };
}

async function addDocuments(contractorId, files, body, userId) {
  await getById(contractorId);
  const docType = body.document_type || body.documentType || 'other';

  const inserted = [];
  for (const file of files) {
    const doc = await contractorDocumentModel.create({
      contractor_id: contractorId,
      name: body.name || file.originalname,
      document_type: docType,
      file_path: file.path,
      file_name: file.originalname,
      file_size: file.size,
      file_type: file.mimetype,
      uploaded_by: userId,
    });
    inserted.push(doc);
  }
  return inserted;
}

async function getDocuments(contractorId) {
  await getById(contractorId);
  return contractorDocumentModel.findByContractorId(contractorId);
}

async function getDocumentFile(contractorId, docId) {
  const doc = await contractorDocumentModel.findById(docId);
  if (!doc || doc.contractor_id !== Number(contractorId)) {
    throw ApiError.notFound('Contractor document not found.');
  }
  return doc;
}

async function deleteDocument(contractorId, docId) {
  const doc = await getDocumentFile(contractorId, docId);
  await contractorDocumentModel.remove(docId);
  if (doc.file_path && fs.existsSync(doc.file_path)) {
    try {
      fs.unlinkSync(doc.file_path);
    } catch {
      // ignore
    }
  }
  return { success: true };
}


/**
 * Validates a `user_id` an admin is trying to link to a contractor, before
 * anything is written. Enforces:
 *  - the user account actually exists
 *  - it holds the CONTRACTOR role (the RBAC role this scope is meant for —
 *    see hrScope.js, which only ever resolves a contractor for that role)
 *  - the one-user-one-contractor rule, both directions
 * Returns nothing; throws ApiError.badRequest on any violation.
 */
async function assertUserLinkable(userId, { excludeContractorId } = {}) {
  const user = await contractorModel.findUserForLink(userId);
  if (!user) {
    throw ApiError.badRequest('Check the highlighted fields.', { user_id: 'That user account does not exist.' });
  }
  if (user.role !== 'contractor') {
    throw ApiError.badRequest('Check the highlighted fields.', {
      user_id: 'Only accounts with the Contractor role can be linked to a contractor profile.',
    });
  }

  const linkedElsewhere = await contractorModel.findLinkedContractorForUser(userId, excludeContractorId);
  if (linkedElsewhere) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      user_id: `That account is already linked to ${linkedElsewhere.name}.`,
    });
  }
}

/**
 * Normalises the `user_id` field on an incoming create/update payload:
 * '', undefined-string, and null all mean "no change" or "unlink" depending
 * on caller intent, which is decided by whether the key is present at all.
 */
function normalizeUserId(rawValue) {
  if (rawValue === null || rawValue === '' || rawValue === undefined) return null;
  const numeric = Number(rawValue);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : NaN;
}

async function create(payload) {
  if (await contractorModel.findByName(payload.name)) {
    throw ApiError.badRequest('Check the highlighted fields.', { name: 'A contractor with this name already exists.' });
  }

  const insertPayload = {
    ...payload,
    is_active: (payload.status ?? 'active') === 'active' ? 1 : 0,
  };

  if (payload.user_id !== undefined) {
    const userId = normalizeUserId(payload.user_id);
    if (Number.isNaN(userId)) {
      throw ApiError.badRequest('Check the highlighted fields.', { user_id: 'Select a valid user account.' });
    }
    if (userId) await assertUserLinkable(userId);
    insertPayload.user_id = userId; // null clears/omits the link, a positive id sets it
  }

  const id = await contractorModel.create(insertPayload);
  return getById(id);
}

async function update(id, payload) {
  await getById(id); // 404s when missing

  if (payload.name) {
    const existing = await contractorModel.findByName(payload.name);
    if (existing && existing.id !== Number(id)) {
      throw ApiError.badRequest('Check the highlighted fields.', { name: 'A contractor with this name already exists.' });
    }
  }

  const patch = { ...payload };
  if (payload.status !== undefined) {
    patch.is_active = payload.status === 'active' ? 1 : 0;
  }

  if (payload.user_id !== undefined) {
    const userId = normalizeUserId(payload.user_id);
    if (Number.isNaN(userId)) {
      throw ApiError.badRequest('Check the highlighted fields.', { user_id: 'Select a valid user account.' });
    }
    if (userId) await assertUserLinkable(userId, { excludeContractorId: Number(id) });
    patch.user_id = userId; // null explicitly unlinks
  }

  await contractorModel.update(id, patch);
  return getById(id);
}

/** Users an admin can pick in the "Linked User Account" selector — CONTRACTOR-role
 * accounts not already linked elsewhere, plus whoever is currently linked (if editing). */
async function getEligibleUsers(contractorId) {
  const rows = await contractorModel.findEligibleUsers(contractorId ? Number(contractorId) : undefined);
  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    isActive: Boolean(row.is_active),
    // True when this user is already the link for `contractorId` itself —
    // lets the frontend preselect the current value rather than guess.
    isCurrentLink: contractorId ? row.linked_contractor_id === Number(contractorId) : false,
  }));
}

/** Assigns this contractor as a project's contractor without disturbing the rest of its team. */
async function assignToProject(id, projectId) {
  await getById(id);
  const project = await projectModel.findById(projectId);
  if (!project) throw ApiError.notFound('That project does not exist.');

  await projectModel.updateTeam(projectId, {
    project_manager_id: project.project_manager_id,
    architect_id: project.architect_id,
    site_engineer_id: project.site_engineer_id,
    contractor_id: id,
  });

  return projectModel.findById(projectId);
}

/** Assigns this contractor to a single site. */
async function assignToSite(id, siteId) {
  await getById(id);
  const site = await siteModel.findById(siteId);
  if (!site) throw ApiError.notFound('That site does not exist.');

  await siteModel.update(siteId, { contractor_id: id });
  return siteModel.findById(siteId);
}

module.exports = {
  list, getById, getDetail, create, update, assignToProject, assignToSite, toContractor, getEligibleUsers,
  addDocuments, getDocuments, getDocumentFile, deleteDocument,
};

