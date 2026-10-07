'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { attachHrScope } = require('../middleware/hrScope');
const { ROLES } = require('../config/roles');
const { uploadProjectDocuments } = require('../middleware/upload');
const controller = require('../controllers/projectController');

const router = express.Router();

router.use(requireAuth);
router.use(attachHrScope);
router.use(requirePermission('projects', 'view'));

const STATUSES = ['on-track', 'attention', 'delayed', 'on-hold', 'completed'];
const TYPES = ['residential', 'commercial', 'industrial', 'institutional', 'infrastructure', 'renovation'];
const canCreate = requirePermission('projects', 'create');
const canEdit = requirePermission('projects', 'edit');

const optionalId = (field) =>
  body(field).optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a valid option.').toInt();

const projectRules = (isCreate) => {
  const required = (chain, message) => (isCreate ? chain.notEmpty().withMessage(message) : chain.optional());
  return [
    body('code').optional().trim().isLength({ max: 20 }).withMessage('Keep the code under 20 characters.'),
    required(body('name').trim().isLength({ max: 180 }).withMessage('That name is too long.'), 'Enter a project name.'),
    required(body('location').trim().isLength({ max: 255 }), 'Enter the project location.'),
    required(body('start_date').isISO8601().withMessage('Enter a valid start date.'), 'Enter a start date.'),
    required(body('expected_completion').isISO8601().withMessage('Enter a valid completion date.'), 'Enter the expected completion date.'),
    body('estimated_budget').optional().isFloat({ min: 0 }).withMessage('Budget cannot be negative.').toFloat(),
    body('project_type').optional().isIn(TYPES).withMessage('Choose a valid project type.'),
    body('status').optional().isIn(STATUSES).withMessage('Choose a valid status.'),
    body('description').optional({ nullable: true }).trim(),
    body('current_phase').optional({ nullable: true }).trim(),
    optionalId('client_id'),
    optionalId('project_manager_id'),
    optionalId('architect_id'),
    optionalId('site_engineer_id'),
    optionalId('contractor_id'),
  ];
};

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
  ],
  validate,
  controller.list
);

router.get('/lookups', controller.lookups);

router.get('/:id', [param('id').isInt({ min: 1 })], validate, requireProjectAccess('id'), controller.detail);

router.post('/', canCreate, projectRules(true), validate, controller.create);

router.patch('/:id', canEdit, [param('id').isInt({ min: 1 }), ...projectRules(false)], validate, requireProjectAccess('id'), controller.update);

router.delete('/:id', requireRole(ROLES.ADMIN), [param('id').isInt({ min: 1 })], validate, requireProjectAccess('id'), controller.archive);

router.patch(
  '/:id/team',
  canEdit,
  [param('id').isInt({ min: 1 }), optionalId('project_manager_id'), optionalId('architect_id'), optionalId('site_engineer_id'), optionalId('contractor_id')],
  validate,
  controller.assignTeam
);

router.post(
  '/:id/sites',
  canEdit,
  [
    param('id').isInt({ min: 1 }),
    body('name').trim().notEmpty().withMessage('Enter a site name.'),
    body('address').trim().notEmpty().withMessage('Enter the site address.'),
    optionalId('site_engineer_id'),
    optionalId('contractor_id'),
    body('labour_count').optional().isInt({ min: 0 }).toInt(),
    body('progress').optional().isInt({ min: 0, max: 100 }).toInt(),
    body('safety_status').optional().isIn(['safe', 'caution', 'incident']),
  ],
  validate,
  controller.addSite
);

// Phase budgeting
router.get('/:id/phases', [param('id').isInt({ min: 1 })], validate, requireProjectAccess('id'), controller.getPhases);
router.put('/:id/phases', canEdit, [param('id').isInt({ min: 1 })], validate, requireProjectAccess('id'), controller.updatePhases);

// Material & Labour tracking (Received vs Used vs Balance / Budget vs Worked)
router.get('/:id/materials-tracking', [param('id').isInt({ min: 1 })], validate, requireProjectAccess('id'), controller.materialsTracking);
router.get('/:id/labour-tracking', [param('id').isInt({ min: 1 })], validate, requireProjectAccess('id'), controller.labourTracking);
router.post(
  '/:id/labour',
  canEdit,
  [
    param('id').isInt({ min: 1 }),
    optionalId('site_id'),
    optionalId('contractor_id'),
    body('category').trim().notEmpty().withMessage('Enter category or trade.'),
    body('worker_count').optional().isInt({ min: 1 }).toInt(),
    body('present_count').optional().isInt({ min: 0 }).toInt(),
    body('record_date').isISO8601().withMessage('Enter a valid date.'),
    body('daily_rate').optional().isFloat({ min: 0 }).toFloat(),
    body('payment_status').optional().isIn(['pending', 'verified', 'paid']),
  ],
  validate,
  requireProjectAccess('id'),
  controller.logLabour
);

// Project Documents
router.post(
  '/:id/documents',
  canEdit,
  [param('id').isInt({ min: 1 })],
  validate,
  requireProjectAccess('id'),
  uploadProjectDocuments,
  controller.uploadDocuments
);

router.get(
  '/:id/documents/:docId/download',
  [param('id').isInt({ min: 1 }), param('docId').isInt({ min: 1 })],
  validate,
  requireProjectAccess('id'),
  controller.downloadDocument
);

router.delete(
  '/:id/documents/:docId',
  canEdit,
  [param('id').isInt({ min: 1 }), param('docId').isInt({ min: 1 })],
  validate,
  requireProjectAccess('id'),
  controller.deleteDocument
);

module.exports = router;
