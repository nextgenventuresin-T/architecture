'use strict';

const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const contractorPoService = require('../services/contractorPoService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

const list = asyncHandler(async (req, res) => {
  ok(res, await contractorPoService.listPos(req.query, req.hrScope));
});

const detail = asyncHandler(async (req, res) => {
  ok(res, { po: await contractorPoService.getPoById(req.params.id, req.hrScope) });
});

const create = asyncHandler(async (req, res) => {
  const po = await contractorPoService.createPo(req.body, req.user?.id);
  ok(res, { po }, 201);
});

const update = asyncHandler(async (req, res) => {
  const po = await contractorPoService.updatePo(req.params.id, req.body, req.hrScope);
  ok(res, { po });
});

const sendPo = asyncHandler(async (req, res) => {
  const po = await contractorPoService.sendPo(req.params.id, req.hrScope);
  ok(res, { po, message: 'Purchase Order sent to contractor.' });
});

const acceptPo = asyncHandler(async (req, res) => {
  const po = await contractorPoService.acceptPo(req.params.id, req.hrScope);
  ok(res, { po, message: 'Purchase Order accepted.' });
});

const rejectPo = asyncHandler(async (req, res) => {
  const po = await contractorPoService.rejectPo(req.params.id, req.body, req.hrScope);
  ok(res, { po, message: 'Purchase Order rejected.' });
});

const signContractor = asyncHandler(async (req, res) => {
  const payload = {
    signatureData: req.body.signature_data || req.body.signatureData,
    signerName: req.body.signer_name || req.body.signerName,
    signatureFile: req.file,
  };
  const po = await contractorPoService.signContractor(req.params.id, payload, req.hrScope);
  ok(res, { po, message: 'Contractor signature recorded successfully.' });
});

const signCompany = asyncHandler(async (req, res) => {
  const payload = {
    signatureData: req.body.signature_data || req.body.signatureData,
    signerName: req.body.signer_name || req.body.signerName,
    designation: req.body.designation,
    signatureFile: req.file,
  };
  const po = await contractorPoService.signCompany(req.params.id, payload, req.user);
  ok(res, { po, message: 'Company signature sealed. Contract is now fully executed.' });
});

const completeMilestone = asyncHandler(async (req, res) => {
  const po = await contractorPoService.completeMilestone(
    req.params.id,
    req.params.milestoneId,
    req.body,
    req.user
  );
  ok(res, { po, message: 'Milestone marked as completed.' });
});

const downloadPdf = asyncHandler(async (req, res) => {
  const po = await contractorPoService.getPoById(req.params.id, req.hrScope);
  const isSigned = req.query.signed === 'true' || po.status === 'contract_signed';
  const filePath = isSigned && po.signedPdfPath ? po.signedPdfPath : po.pdfPath;

  if (!filePath || !fs.existsSync(filePath)) {
    throw ApiError.notFound('PDF document is not yet generated or available.');
  }

  const downloadName = isSigned
    ? `Contract-${po.poNumber}-${po.contractor?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Signed'}.pdf`
    : `PO-${po.poNumber}.pdf`;

  res.download(filePath, downloadName);
});

const timeline = asyncHandler(async (req, res) => {
  const steps = await contractorPoService.getPoTimeline(req.params.id);
  ok(res, { timeline: steps });
});

const financialDashboard = asyncHandler(async (req, res) => {
  const contractorId = req.params.contractorId || (req.hrScope?.role === 'contractor' ? req.hrScope.contractorId : null);
  if (!contractorId) throw ApiError.badRequest('Contractor ID required.');
  const summary = await contractorPoService.getFinancialDashboard(contractorId);
  ok(res, { summary });
});

const remove = asyncHandler(async (req, res) => {
  ok(res, await contractorPoService.removePo(req.params.id, req.hrScope));
});

module.exports = {
  list,
  detail,
  create,
  update,
  sendPo,
  acceptPo,
  rejectPo,
  signContractor,
  signCompany,
  completeMilestone,
  downloadPdf,
  timeline,
  financialDashboard,
  remove,
};
