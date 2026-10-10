'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const { ROLES } = require('../config/roles');
const controller = require('../controllers/contractorController');
const poController = require('../controllers/contractorPoController');
const { uploadContractorDocuments, uploadSignature } = require('../middleware/upload');

const router = express.Router();

// Everything below needs a signed-in user.
router.use(requireAuth);
router.use(requirePermission('contractors', 'view'));

const TYPES = ['civil', 'electrical', 'plumbing', 'finishing', 'labour-supply', 'equipment', 'specialized', 'other'];
const STATUSES = ['active', 'inactive', 'blacklisted'];
const canCreate = requirePermission('contractors', 'create');
const canEdit = requirePermission('contractors', 'edit');

const contractorRules = (isCreate) => {
  const required = (chain, message) => (isCreate ? chain.notEmpty().withMessage(message) : chain.optional());
  return [
    required(body('name').trim().isLength({ max: 150 }).withMessage('That name is too long.'), 'Enter the contractor name.'),
    body('contact_person').optional({ nullable: true }).trim().isLength({ max: 120 }),
    body('phone').optional({ nullable: true }).trim().isLength({ max: 30 }),
    body('email').optional({ nullable: true }).isEmail().withMessage('Enter a valid email address.'),
    body('address').optional({ nullable: true }).trim().isLength({ max: 255 }),
    body('type').optional().isIn(TYPES).withMessage('Choose a valid contractor type.'),
    body('status').optional().isIn(STATUSES).withMessage('Choose a valid status.'),
    body('notes').optional({ nullable: true }).trim(),
    body('pan_number').optional({ nullable: true }).trim().isLength({ max: 20 }),
    body('panNumber').optional({ nullable: true }).trim().isLength({ max: 20 }),
    body('aadhaar_number').optional({ nullable: true }).trim().isLength({ max: 20 }),
    body('aadhaarNumber').optional({ nullable: true }).trim().isLength({ max: 20 }),
    body('gst_number').optional({ nullable: true }).trim().isLength({ max: 20 }),
    body('gstNumber').optional({ nullable: true }).trim().isLength({ max: 20 }),
    body('bank_account_holder').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('bankAccountHolder').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('bank_account_number').optional({ nullable: true }).trim().isLength({ max: 50 }),
    body('bankAccountNumber').optional({ nullable: true }).trim().isLength({ max: 50 }),
    body('bank_name').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('bankName').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('bank_ifsc').optional({ nullable: true }).trim().isLength({ max: 20 }),
    body('bankIfsc').optional({ nullable: true }).trim().isLength({ max: 20 }),
    body('bank_branch').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('bankBranch').optional({ nullable: true }).trim().isLength({ max: 150 }),
    // '' / null clears the link; a positive integer sets it. Existence, role,
    // and one-to-one uniqueness are enforced server-side in contractorService,
    // never trusted from this shape check alone.
    body('user_id')
      .optional({ nullable: true })
      .custom((value) => value === null || value === '' || Number.isInteger(Number(value)))
      .withMessage('Select a valid user account.'),
  ];
};

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('search').optional().trim(),
    query('status').optional().trim(),
    query('type').optional().trim(),
  ],
  validate,
  controller.list
);

// Must be registered before '/:id' — otherwise Express matches this path
// against the ':id' route first and the isInt validator rejects it.
router.get(
  '/eligible-users',
  [query('contractorId').optional().isInt({ min: 1 }).toInt()],
  validate,
  controller.eligibleUsers
);

// ---------------------------------------------------- Contractor Purchase Orders
router.get('/pos', poController.list);
router.get('/pos/:id', [param('id').isInt({ min: 1 })], validate, poController.detail);
router.patch('/pos/:id', canEdit, [param('id').isInt({ min: 1 })], validate, poController.update);
router.post('/pos/:id/send', canEdit, [param('id').isInt({ min: 1 })], validate, poController.sendPo);
router.post('/pos/:id/accept', [param('id').isInt({ min: 1 })], validate, poController.acceptPo);
router.post('/pos/:id/reject', [param('id').isInt({ min: 1 })], validate, poController.rejectPo);
router.post('/pos/:id/sign-contractor', uploadSignature, [param('id').isInt({ min: 1 })], validate, poController.signContractor);
router.post('/pos/:id/sign-company', requireRole(ROLES.ADMIN), uploadSignature, [param('id').isInt({ min: 1 })], validate, poController.signCompany);
router.post(
  '/pos/:id/milestones/:milestoneId/complete',
  requireRole(ROLES.ADMIN),
  [param('id').isInt({ min: 1 }), param('milestoneId').isInt({ min: 1 })],
  validate,
  poController.completeMilestone
);
router.get('/pos/:id/download', [param('id').isInt({ min: 1 })], validate, poController.downloadPdf);
router.get('/pos/:id/timeline', [param('id').isInt({ min: 1 })], validate, poController.timeline);
router.delete('/pos/:id', canEdit, [param('id').isInt({ min: 1 })], validate, poController.remove);

// ---------------------------------------------------- Single Contractor Endpoints
router.get('/:id', [param('id').isInt({ min: 1 })], validate, controller.detail);

router.post('/', canCreate, contractorRules(true), validate, controller.create);

router.patch('/:id', canEdit, [param('id').isInt({ min: 1 }), ...contractorRules(false)], validate, controller.update);

// Contractor Documents
router.post('/:id/documents', canEdit, [param('id').isInt({ min: 1 })], uploadContractorDocuments, validate, controller.uploadDocuments);
router.get('/:id/documents', [param('id').isInt({ min: 1 })], validate, controller.listDocuments);
router.get('/:id/documents/:docId/download', [param('id').isInt({ min: 1 }), param('docId').isInt({ min: 1 })], validate, controller.downloadDocument);
router.delete('/:id/documents/:docId', canEdit, [param('id').isInt({ min: 1 }), param('docId').isInt({ min: 1 })], validate, controller.deleteDocument);

// Contractor POs nested under contractor
router.get('/:id/pos', [param('id').isInt({ min: 1 })], validate, (req, res, next) => { req.query.contractorId = req.params.id; next(); }, poController.list);
router.post('/:id/pos', canCreate, [param('id').isInt({ min: 1 })], validate, (req, res, next) => { req.body.contractor_id = Number(req.params.id); next(); }, poController.create);
router.get('/:id/financial-summary', [param('id').isInt({ min: 1 })], validate, (req, res, next) => { req.params.contractorId = req.params.id; next(); }, poController.financialDashboard);

// Assignment changes who is accountable on a project/site — Admin only.
router.post(
  '/:id/assign-project',
  requireRole(ROLES.ADMIN),
  [param('id').isInt({ min: 1 }), body('project_id').isInt({ min: 1 }).withMessage('Select a valid project.').toInt()],
  validate,
  controller.assignProject
);

router.post(
  '/:id/assign-site',
  requireRole(ROLES.ADMIN),
  [param('id').isInt({ min: 1 }), body('site_id').isInt({ min: 1 }).withMessage('Select a valid site.').toInt()],
  validate,
  controller.assignSite
);

module.exports = router;

