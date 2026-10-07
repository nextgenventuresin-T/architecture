'use strict';

const asyncHandler = require('../utils/asyncHandler');
const projectService = require('../services/projectService');
const phaseBudgetService = require('../services/phaseBudgetService');
const lookupModel = require('../models/lookupModel');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/** GET /api/projects */
const list = asyncHandler(async (req, res) => ok(res, await projectService.list(req.query, req.hrScope)));

/** GET /api/projects/lookups */
const lookups = asyncHandler(async (req, res) => ok(res, await lookupModel.findAll()));

/** GET /api/projects/:id */
const detail = asyncHandler(async (req, res) => ok(res, await projectService.getDetail(req.params.id, req.hrScope)));

/** POST /api/projects */
const create = asyncHandler(async (req, res) => ok(res, { project: await projectService.create(req.body) }, 201));

/** PATCH /api/projects/:id */
const update = asyncHandler(async (req, res) => ok(res, { project: await projectService.update(req.params.id, req.body) }));

/** DELETE /api/projects/:id — archives rather than destroys */
const archive = asyncHandler(async (req, res) => {
  await projectService.archive(req.params.id);
  ok(res, { message: 'Project archived.' });
});

/** PATCH /api/projects/:id/team */
const assignTeam = asyncHandler(async (req, res) => ok(res, { project: await projectService.assignTeam(req.params.id, req.body) }));

/** POST /api/projects/:id/sites */
const addSite = asyncHandler(async (req, res) => ok(res, { site: await projectService.addSite(req.params.id, req.body) }, 201));

/** POST /api/projects/:id/documents */
const uploadDocuments = asyncHandler(async (req, res) => {
  const files = req.files || (req.file ? [req.file] : []);
  const docs = await projectService.addDocuments(req.params.id, files, req.body);
  ok(res, { documents: docs }, 201);
});

/** GET /api/projects/:id/documents/:docId/download */
const downloadDocument = asyncHandler(async (req, res) => {
  const doc = await projectService.getDocumentFile(req.params.id, req.params.docId);
  res.download(doc.file_path, doc.file_name || doc.name);
});

/** DELETE /api/projects/:id/documents/:docId */
const deleteDocument = asyncHandler(async (req, res) => {
  ok(res, await projectService.deleteDocument(req.params.id, req.params.docId));
});

/** GET /api/projects/:id/phases */
const getPhases = asyncHandler(async (req, res) => {
  ok(res, { phases: await phaseBudgetService.getPhases(req.params.id) });
});

/** PUT /api/projects/:id/phases */
const updatePhases = asyncHandler(async (req, res) => {
  const phases = req.body.phases || req.body;
  ok(res, { phases: await phaseBudgetService.updatePhases(req.params.id, phases) });
});

/** GET /api/projects/:id/materials-tracking */
const materialsTracking = asyncHandler(async (req, res) =>
  ok(res, await projectService.getMaterialTracking(req.params.id, req.query))
);

/** GET /api/projects/:id/labour-tracking */
const labourTracking = asyncHandler(async (req, res) =>
  ok(res, await projectService.getLabourTracking(req.params.id, req.query))
);

/** POST /api/projects/:id/labour */
const logLabour = asyncHandler(async (req, res) =>
  ok(res, { record: await projectService.logLabour(req.params.id, req.body) }, 201)
);

module.exports = {
  list,
  lookups,
  detail,
  create,
  update,
  archive,
  assignTeam,
  addSite,
  uploadDocuments,
  downloadDocument,
  deleteDocument,
  getPhases,
  updatePhases,
  materialsTracking,
  labourTracking,
  logLabour,
};
