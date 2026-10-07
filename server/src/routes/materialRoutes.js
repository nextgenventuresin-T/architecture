'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const controller = require('../controllers/materialController');

const router = express.Router();

// Everything below needs a signed-in user.
router.use(requireAuth);
router.use(requirePermission('materials', 'view'));

const STATUSES = ['active', 'inactive', 'discontinued'];
const canCreate = requirePermission('materials', 'create');
const canEdit = requirePermission('materials', 'edit');

const materialRules = (isCreate) => {
  const required = (chain, message) => (isCreate ? chain.notEmpty().withMessage(message) : chain.optional());
  return [
    required(body('name').trim().isLength({ max: 120 }).withMessage('That name is too long.'), 'Enter the material name.'),
    required(body('category').trim().isLength({ max: 80 }).withMessage('Keep the category under 80 characters.'), 'Choose a category.'),
    required(body('unit').trim().isLength({ max: 20 }).withMessage('Keep the unit under 20 characters.'), 'Enter a unit.'),
    // Optional on create — the API generates MAT-#### when left blank.
    body('code').optional({ nullable: true }).trim().isLength({ max: 30 }).withMessage('Keep the code under 30 characters.'),
    body('min_stock').optional().isFloat({ min: 0 }).withMessage('Minimum stock cannot be negative.').toFloat(),
    body('default_rate').optional().isFloat({ min: 0 }).withMessage('Purchase rate cannot be negative.').toFloat(),
    body('default_supplier').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('status').optional().isIn(STATUSES).withMessage('Choose a valid status.'),
    body('notes').optional({ nullable: true }).trim(),
  ];
};

// Declared before `/:id` so the literal path is not swallowed by the id rule.
router.get('/lookups', controller.lookups);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('search').optional().trim(),
    query('category').optional().trim(),
    query('status').optional().trim(),
    query('stockStatus').optional().isIn(['all', 'low', 'out', 'healthy']).withMessage('Choose a valid stock filter.'),
    query('projectId').optional().isInt({ min: 1 }).toInt(),
    query('siteId').optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.list
);

router.get('/:id', [param('id').isInt({ min: 1 })], validate, controller.detail);

router.post('/', canCreate, materialRules(true), validate, controller.create);

router.patch('/:id', canEdit, [param('id').isInt({ min: 1 }), ...materialRules(false)], validate, controller.update);

// Stock entries write to `material_entries`, the Interface 3 table that the
// project and site screens already read.
router.post(
  '/:id/entries',
  [
    param('id').isInt({ min: 1 }),
    body('project_id').isInt({ min: 1 }).withMessage('Select a project.').toInt(),
    body('site_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a valid site.').toInt(),
    body('quantity').isFloat({ gt: 0 }).withMessage('Enter a quantity greater than zero.').toFloat(),
    body('rate').optional().isFloat({ min: 0 }).withMessage('Rate cannot be negative.').toFloat(),
    body('used_quantity').optional().isFloat({ min: 0 }).withMessage('Used quantity cannot be negative.').toFloat(),
    body('supplier').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('received_date').isISO8601().withMessage('Enter a valid received date.'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 255 }),
  ],
  validate,
  controller.addEntry
);

router.patch(
  '/:id/entries/:entryId',
  [
    param('id').isInt({ min: 1 }),
    param('entryId').isInt({ min: 1 }),
    body('used_quantity').isFloat({ min: 0 }).withMessage('Enter a valid used quantity.').toFloat(),
  ],
  validate,
  controller.recordUsage
);

module.exports = router;
