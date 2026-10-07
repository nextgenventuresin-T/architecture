'use strict';

const asyncHandler = require('../utils/asyncHandler');
const contractorService = require('../services/contractorService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** GET /api/contractors */
const list = asyncHandler(async (req, res) => ok(res, await contractorService.list(req.query)));

/** GET /api/contractors/eligible-users — CONTRACTOR-role accounts available to link. */
const eligibleUsers = asyncHandler(async (req, res) =>
  ok(res, { users: await contractorService.getEligibleUsers(req.query.contractorId) })
);

/** GET /api/contractors/:id */
const detail = asyncHandler(async (req, res) => ok(res, await contractorService.getDetail(req.params.id)));

/** POST /api/contractors */
const create = asyncHandler(async (req, res) => ok(res, { contractor: await contractorService.create(req.body) }, 201));

/** PATCH /api/contractors/:id */
const update = asyncHandler(async (req, res) => ok(res, { contractor: await contractorService.update(req.params.id, req.body) }));

/** POST /api/contractors/:id/assign-project */
const assignProject = asyncHandler(async (req, res) =>
  ok(res, { project: await contractorService.assignToProject(req.params.id, req.body.project_id) })
);

/** POST /api/contractors/:id/assign-site */
const assignSite = asyncHandler(async (req, res) =>
  ok(res, { site: await contractorService.assignToSite(req.params.id, req.body.site_id) })
);

/** POST /api/contractors/:id/documents */
const uploadDocuments = asyncHandler(async (req, res) => {
  const files = req.files || (req.file ? [req.file] : []);
  const docs = await contractorService.addDocuments(req.params.id, files, req.body, req.user?.id);
  ok(res, { documents: docs }, 201);
});

/** GET /api/contractors/:id/documents */
const listDocuments = asyncHandler(async (req, res) => {
  const documents = await contractorService.getDocuments(req.params.id);
  ok(res, { documents });
});

/** GET /api/contractors/:id/documents/:docId/download */
const downloadDocument = asyncHandler(async (req, res) => {
  const doc = await contractorService.getDocumentFile(req.params.id, req.params.docId);
  res.download(doc.file_path, doc.file_name || doc.name);
});

/** DELETE /api/contractors/:id/documents/:docId */
const deleteDocument = asyncHandler(async (req, res) => {
  ok(res, await contractorService.deleteDocument(req.params.id, req.params.docId));
});

module.exports = {
  list,
  detail,
  create,
  update,
  assignProject,
  assignSite,
  eligibleUsers,
  uploadDocuments,
  listDocuments,
  downloadDocument,
  deleteDocument,
};

