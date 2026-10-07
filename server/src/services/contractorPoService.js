'use strict';

const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const contractorPoModel = require('../models/contractorPoModel');
const contractorModel = require('../models/contractorModel');
const projectModel = require('../models/projectModel');
const { savePoPdfFile } = require('../utils/pdfGenerator');
const { saveBase64Signature } = require('../middleware/upload');

function formatMilestone(m) {
  if (!m) return null;
  return {
    id: m.id,
    poId: m.po_id,
    milestoneName: m.milestone_name,
    percentage: Number(m.percentage || 0),
    amount: Number(m.amount || 0),
    conditionTrigger: m.condition_trigger,
    status: m.status || 'pending',
    completedAt: m.completed_at,
    remarks: m.remarks,
    sortOrder: m.sort_order,
    createdAt: m.created_at,
  };
}

function formatPo(row, milestones = []) {
  if (!row) return null;
  return {
    id: row.id,
    poNumber: row.po_number,
    contractorId: row.contractor_id,
    projectId: row.project_id,
    siteId: row.site_id,
    poDate: row.po_date,
    validityDate: row.validity_date,
    workDescription: row.work_description,
    totalAmount: Number(row.total_amount || 0),
    advanceAmount: Number(row.advance_amount || 0),
    materialAmount: Number(row.material_amount || 0),
    labourAmount: Number(row.labour_amount || 0),
    paymentTerms: row.payment_terms,
    termsConditions: row.terms_conditions,
    status: row.status,
    rejectionReason: row.rejection_reason,
    pdfPath: row.pdf_path,
    signedPdfPath: row.signed_pdf_path,

    contractorSignaturePath: row.contractor_signature_path,
    contractorSignedName: row.contractor_signed_name,
    contractorSignedAt: row.contractor_signed_at,

    companySignaturePath: row.company_signature_path,
    companySignedName: row.company_signed_name,
    companySignedDesignation: row.company_signed_designation,
    companySignedAt: row.company_signed_at,

    contractor: {
      id: row.contractor_id,
      name: row.contractor_name,
      contactPerson: row.contractor_contact_person,
      phone: row.contractor_phone,
      email: row.contractor_email,
      address: row.contractor_address,
    },
    project: {
      id: row.project_id,
      name: row.project_name,
      code: row.project_code,
      location: row.project_location,
    },
    site: row.site_id
      ? {
        id: row.site_id,
        name: row.site_name,
        address: row.site_address,
      }
      : null,

    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    milestones: milestones.map(formatMilestone),
  };
}

async function listPos(query = {}, hrScope = null) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

  const filter = { ...query, page, pageSize };
  if (hrScope && hrScope.role === 'contractor') {
    filter.contractorId = hrScope.contractorId;
  }

  const { rows, total } = await contractorPoModel.findAll(filter);
  const poIds = rows.map((r) => r.id);
  const milestonesByPoId = await contractorPoModel.findMilestonesForPoIds(poIds);

  return {
    pos: rows.map((r) => formatPo(r, milestonesByPoId[r.id] || [])),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getPoById(id, hrScope = null) {
  const row = await contractorPoModel.findById(id);
  if (!row) throw ApiError.notFound('Purchase Order not found.');

  // Contractor Scoping (Requirement 16)
  if (hrScope && hrScope.role === 'contractor') {
    if (row.contractor_id !== hrScope.contractorId) {
      throw ApiError.forbidden('You do not have permission to view this Purchase Order.');
    }
    // Auto transition to "viewed" if status is "sent"
    if (row.status === 'sent') {
      await contractorPoModel.updateStatus(id, 'viewed');
      row.status = 'viewed';
    }
  }

  const milestones = await contractorPoModel.findMilestones(id);
  return formatPo(row, milestones);
}

/** Automatically calculates milestone amount from percentage against PO total */
function sanitizeMilestones(milestones = [], totalAmount = 0) {
  return milestones.map((m, idx) => {
    const pct = Number(m.percentage || 0);
    let amount = Number(m.amount || 0);
    if ((!amount || amount === 0) && pct > 0 && totalAmount > 0) {
      amount = Math.round((pct / 100) * totalAmount * 100) / 100;
    }
    return {
      name: m.milestone_name || m.name || `Milestone ${idx + 1}`,
      percentage: pct,
      amount,
      trigger: m.condition_trigger || m.trigger || null,
      status: m.status || 'pending',
      remarks: m.remarks || null,
    };
  });
}

async function createPo(payload, userId) {
  const contractorId = payload.contractor_id ?? payload.contractorId;
  const projectId = payload.project_id ?? payload.projectId;
  const siteId = payload.site_id ?? payload.siteId ?? null;
  const poDate = payload.po_date ?? payload.poDate ?? new Date().toISOString().slice(0, 10);
  const validityDate = payload.validity_date ?? payload.validityDate ?? null;
  const workDescription = payload.work_description ?? payload.workDescription ?? null;
  const totalAmount = Number(payload.total_amount ?? payload.totalAmount ?? 0);
  const advanceAmount = Number(payload.advance_amount ?? payload.advanceAmount ?? 0);
  const materialAmount = Number(payload.material_amount ?? payload.materialAmount ?? 0);
  const labourAmount = Number(payload.labour_amount ?? payload.labourAmount ?? 0);
  const paymentTerms = payload.payment_terms ?? payload.paymentTerms ?? null;
  const termsConditions = payload.terms_conditions ?? payload.termsConditions ?? null;

  const contractor = await contractorModel.findById(contractorId);
  if (!contractor) throw ApiError.badRequest('Select a valid contractor.');

  const project = await projectModel.findById(projectId);
  if (!project) throw ApiError.badRequest('Select a valid project.');

  const milestones = sanitizeMilestones(payload.milestones || [], totalAmount);

  const poId = await contractorPoModel.create(
    {
      contractor_id: contractorId,
      project_id: projectId,
      site_id: siteId,
      po_date: poDate,
      validity_date: validityDate,
      work_description: workDescription,
      total_amount: totalAmount,
      advance_amount: advanceAmount,
      material_amount: materialAmount,
      labour_amount: labourAmount,
      payment_terms: paymentTerms,
      terms_conditions: termsConditions,
      created_by: userId,
    },
    milestones
  );

  const created = await contractorPoModel.findById(poId);
  const createdMilestones = await contractorPoModel.findMilestones(poId);

  // Generate initial digital PO PDF
  try {
    const pdfPath = savePoPdfFile({ ...created, milestones: createdMilestones });
    await contractorPoModel.updateStatus(poId, created.status, { pdf_path: pdfPath });
  } catch (err) {
    console.error('Error generating initial PO PDF:', err.message);
  }

  return getPoById(poId);
}

async function updatePo(id, payload, hrScope = null) {
  const existing = await contractorPoModel.findById(id);
  if (!existing) throw ApiError.notFound('Purchase Order not found.');

  // Contractor cannot edit PO (Requirement 16)
  if (hrScope && hrScope.role === 'contractor') {
    throw ApiError.forbidden('Contractors cannot modify Purchase Orders.');
  }

  // Only draft or rejected POs can be edited
  if (!['draft', 'rejected'].includes(existing.status)) {
    throw ApiError.badRequest(`Cannot edit a PO in "${existing.status}" status. Only draft or rejected orders can be modified.`);
  }

  const normalized = {};
  if (payload.projectId !== undefined || payload.project_id !== undefined) normalized.project_id = payload.project_id ?? payload.projectId;
  if (payload.siteId !== undefined || payload.site_id !== undefined) normalized.site_id = payload.site_id ?? payload.siteId;
  if (payload.poDate !== undefined || payload.po_date !== undefined) normalized.po_date = payload.po_date ?? payload.poDate;
  if (payload.validityDate !== undefined || payload.validity_date !== undefined) normalized.validity_date = payload.validity_date ?? payload.validityDate;
  if (payload.workDescription !== undefined || payload.work_description !== undefined) normalized.work_description = payload.work_description ?? payload.workDescription;
  if (payload.totalAmount !== undefined || payload.total_amount !== undefined) normalized.total_amount = Number(payload.total_amount ?? payload.totalAmount);
  if (payload.advanceAmount !== undefined || payload.advance_amount !== undefined) normalized.advance_amount = Number(payload.advance_amount ?? payload.advanceAmount);
  if (payload.materialAmount !== undefined || payload.material_amount !== undefined) normalized.material_amount = Number(payload.material_amount ?? payload.materialAmount);
  if (payload.labourAmount !== undefined || payload.labour_amount !== undefined) normalized.labour_amount = Number(payload.labour_amount ?? payload.labourAmount);
  if (payload.paymentTerms !== undefined || payload.payment_terms !== undefined) normalized.payment_terms = payload.payment_terms ?? payload.paymentTerms;
  if (payload.termsConditions !== undefined || payload.terms_conditions !== undefined) normalized.terms_conditions = payload.terms_conditions ?? payload.termsConditions;

  const totalAmount = Number(normalized.total_amount !== undefined ? normalized.total_amount : existing.total_amount);
  const milestones = payload.milestones ? sanitizeMilestones(payload.milestones, totalAmount) : null;

  await contractorPoModel.update(id, normalized, milestones);

  // Re-generate digital PO PDF
  try {
    const updated = await contractorPoModel.findById(id);
    const updatedMilestones = await contractorPoModel.findMilestones(id);
    const pdfPath = savePoPdfFile({ ...updated, milestones: updatedMilestones });
    await contractorPoModel.updateStatus(id, updated.status, { pdf_path: pdfPath });
  } catch (err) {
    console.error('Error re-generating PO PDF on update:', err.message);
  }

  return getPoById(id);
}

async function sendPo(id, hrScope = null) {
  const existing = await contractorPoModel.findById(id);
  if (!existing) throw ApiError.notFound('Purchase Order not found.');

  if (hrScope && hrScope.role === 'contractor') {
    throw ApiError.forbidden('Only administrators can send Purchase Orders.');
  }

  if (!['draft', 'rejected', 'viewed'].includes(existing.status)) {
    throw ApiError.badRequest(`Cannot send a PO with current status "${existing.status}".`);
  }

  const milestones = await contractorPoModel.findMilestones(id);
  const pdfPath = savePoPdfFile({ ...existing, status: 'sent', milestones });

  await contractorPoModel.updateStatus(id, 'sent', { pdf_path: pdfPath });
  return getPoById(id);
}

async function acceptPo(id, hrScope) {
  const existing = await contractorPoModel.findById(id);
  if (!existing) throw ApiError.notFound('Purchase Order not found.');

  // Must be the assigned contractor
  if (hrScope?.role === 'contractor' && existing.contractor_id !== hrScope.contractorId) {
    throw ApiError.forbidden('You can only accept Purchase Orders assigned to you.');
  }

  if (!['sent', 'viewed'].includes(existing.status)) {
    throw ApiError.badRequest(`Cannot accept PO with status "${existing.status}". Must be "sent" or "viewed".`);
  }

  await contractorPoModel.updateStatus(id, 'accepted');
  return getPoById(id);
}

async function rejectPo(id, { reason }, hrScope) {
  const existing = await contractorPoModel.findById(id);
  if (!existing) throw ApiError.notFound('Purchase Order not found.');

  if (hrScope?.role === 'contractor' && existing.contractor_id !== hrScope.contractorId) {
    throw ApiError.forbidden('You can only reject Purchase Orders assigned to you.');
  }

  if (!['sent', 'viewed'].includes(existing.status)) {
    throw ApiError.badRequest(`Cannot reject PO with status "${existing.status}".`);
  }

  if (!reason || !reason.trim()) {
    throw ApiError.badRequest('Please provide a reason for rejecting the Purchase Order.');
  }

  await contractorPoModel.updateStatus(id, 'rejected', { rejection_reason: reason.trim() });
  return getPoById(id);
}

async function signContractor(id, { signatureData, signerName, signatureFile }, hrScope) {
  const existing = await contractorPoModel.findById(id);
  if (!existing) throw ApiError.notFound('Purchase Order not found.');

  if (hrScope?.role === 'contractor' && existing.contractor_id !== hrScope.contractorId) {
    throw ApiError.forbidden('You can only sign Purchase Orders assigned to you.');
  }

  if (existing.status !== 'accepted') {
    throw ApiError.badRequest('The PO must be explicitly accepted before providing signature.');
  }

  let sigPath = null;
  if (signatureFile && signatureFile.path) {
    sigPath = signatureFile.path;
  } else if (signatureData) {
    sigPath = saveBase64Signature(signatureData, `contractor-sig-${id}`);
  }

  if (!sigPath) {
    throw ApiError.badRequest('Please draw or upload a signature.');
  }

  const name = (signerName || hrScope?.contractorName || existing.contractor_name || 'Authorized Signatory').trim();
  await contractorPoModel.saveContractorSignature(id, {
    signaturePath: sigPath,
    signerName: name,
    signedAt: new Date(),
  });

  return getPoById(id);
}

async function signCompany(id, { signatureData, signerName, designation, signatureFile }, user) {
  const existing = await contractorPoModel.findById(id);
  if (!existing) throw ApiError.notFound('Purchase Order not found.');

  if (user?.role === 'contractor') {
    throw ApiError.forbidden('Contractors cannot execute company signatures.');
  }

  if (existing.status !== 'contractor_signed') {
    throw ApiError.badRequest('Contractor must sign the agreement before company countersignature.');
  }

  let sigPath = null;
  if (signatureFile && signatureFile.path) {
    sigPath = signatureFile.path;
  } else if (signatureData) {
    sigPath = saveBase64Signature(signatureData, `company-sig-${id}`);
  }

  if (!sigPath) {
    throw ApiError.badRequest('Please draw or upload a company signature.');
  }

  const name = (signerName || user?.name || user?.fullName || 'Authorized Representative').trim();
  const desig = (designation || 'Project Director').trim();
  const signedAt = new Date();

  // Generate Final Signed Contract PDF
  const milestones = await contractorPoModel.findMilestones(id);
  const poForPdf = {
    ...existing,
    contractor_signed_name: existing.contractor_signed_name,
    contractor_signed_at: existing.contractor_signed_at,
    company_signature_path: sigPath,
    company_signed_name: name,
    company_signed_designation: desig,
    company_signed_at: signedAt,
    status: 'contract_signed',
    milestones,
  };

  const signedPdfPath = savePoPdfFile(poForPdf, { isSignedContract: true });

  await contractorPoModel.saveCompanySignature(id, {
    signaturePath: sigPath,
    signerName: name,
    designation: desig,
    signedAt,
    signedPdfPath,
  });

  return getPoById(id);
}

async function completeMilestone(poId, milestoneId, { remarks }, user) {
  if (user?.role === 'contractor') {
    throw ApiError.forbidden('Only authorized officers can certify completed milestones.');
  }

  const existing = await contractorPoModel.findById(poId);
  if (!existing) throw ApiError.notFound('Purchase Order not found.');

  await contractorPoModel.updateMilestoneStatus(milestoneId, 'completed', {
    completedAt: new Date(),
    remarks: remarks?.trim() || null,
  });

  return getPoById(poId);
}

async function removePo(id, hrScope = null) {
  const existing = await contractorPoModel.findById(id);
  if (!existing) throw ApiError.notFound('Purchase Order not found.');

  if (hrScope?.role === 'contractor') {
    throw ApiError.forbidden('Contractors cannot delete Purchase Orders.');
  }

  if (existing.status !== 'draft') {
    throw ApiError.badRequest(`Cannot delete a PO with status "${existing.status}". Only draft POs can be removed.`);
  }

  await contractorPoModel.remove(id);
  return { success: true };
}

/**
 * Builds structured timeline of the complete PO and contract lifecycle (Requirement 13)
 */
async function getPoTimeline(poId) {
  const po = await contractorPoModel.findById(poId);
  if (!po) throw ApiError.notFound('Purchase Order not found.');

  const milestones = await contractorPoModel.findMilestones(poId);

  const steps = [
    {
      id: 'created',
      title: 'PO Created',
      description: `Draft PO ${po.po_number} generated by ${po.created_by_name || 'Admin'}`,
      timestamp: po.created_at,
      status: 'completed',
    },
    {
      id: 'sent',
      title: 'PO Sent to Contractor',
      description: `Transmitted to ${po.contractor_name} for review & acceptance`,
      timestamp: po.status !== 'draft' ? po.updated_at : null,
      status: po.status === 'draft' ? 'pending' : 'completed',
    },
    {
      id: 'acceptance',
      title: po.status === 'rejected' ? 'PO Rejected' : 'PO Accepted',
      description: po.status === 'rejected'
        ? `Rejected by contractor: "${po.rejection_reason || 'No reason specified'}"`
        : ['accepted', 'contractor_signed', 'contract_signed', 'completed'].includes(po.status)
          ? 'Contract terms & milestone schedule accepted by contractor'
          : 'Awaiting contractor acceptance',
      timestamp: ['accepted', 'contractor_signed', 'contract_signed', 'completed', 'rejected'].includes(po.status) ? po.updated_at : null,
      status: po.status === 'rejected'
        ? 'rejected'
        : ['accepted', 'contractor_signed', 'contract_signed', 'completed'].includes(po.status)
          ? 'completed'
          : 'pending',
    },
    {
      id: 'contractor_signature',
      title: 'Contractor Signed',
      description: po.contractor_signed_at
        ? `Digitally signed by ${po.contractor_signed_name || po.contractor_name}`
        : 'Awaiting digital signature from contractor',
      timestamp: po.contractor_signed_at,
      status: po.contractor_signed_at ? 'completed' : 'pending',
    },
    {
      id: 'company_signature',
      title: 'Company Countersigned',
      description: po.company_signed_at
        ? `Approved & sealed by ${po.company_signed_name} (${po.company_signed_designation || 'Project Director'})`
        : 'Awaiting company executive signature',
      timestamp: po.company_signed_at,
      status: po.company_signed_at ? 'completed' : 'pending',
    },
    {
      id: 'contract_signed',
      title: 'Contract Fully Executed & Sealed',
      description: po.status === 'contract_signed' || po.signed_pdf_path
        ? 'Digital contract legally executed and sealed permanently'
        : 'Final contract document locking',
      timestamp: po.company_signed_at || po.updated_at,
      status: (po.status === 'contract_signed' || po.status === 'completed') ? 'completed' : 'pending',
    },
    {
      id: 'milestones_execution',
      title: 'Milestone Execution & Payments',
      description: `${milestones.filter((m) => m.status === 'completed').length} of ${milestones.length} milestones certified`,
      timestamp: null,
      status: milestones.length > 0 && milestones.every((m) => m.status === 'completed') ? 'completed' : 'in_progress',
    },
  ];

  return steps;
}

module.exports = {
  listPos,
  getPoById,
  createPo,
  updatePo,
  sendPo,
  acceptPo,
  rejectPo,
  signContractor,
  signCompany,
  completeMilestone,
  removePo,
  getPoTimeline,
  getFinancialDashboard: contractorPoModel.findFinancialSummary,
};
