'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const controller = require('../controllers/clientController');

const router = express.Router();
router.use(requireAuth);

const CLIENT_TYPES = ['Individual', 'Company', 'Partnership', 'LLP', 'Government', 'Other'];
const STATUSES = ['active', 'inactive'];

const clientRules = (isCreate) => [
  isCreate
    ? body('name').trim().notEmpty().withMessage('Client name is required.')
    : body('name').optional().trim().notEmpty().withMessage('Client name cannot be blank.'),
  body('client_type').optional({ nullable: true, checkFalsy: true }).trim().isIn(CLIENT_TYPES).withMessage('Select a valid client type.'),
  body('pan')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .toUpperCase()
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .withMessage('Enter a valid 10-character PAN (e.g. ABCDE1234F).'),
  body('gstin')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .toUpperCase()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Enter a valid 15-character GSTIN (e.g. 07AAAAA0000A1Z5).'),
  body('cin').optional({ nullable: true }).trim(),
  body('website').optional({ nullable: true }).trim(),
  body('status').optional({ nullable: true, checkFalsy: true }).trim().isIn(STATUSES).withMessage('Status must be active or inactive.'),
  body('contact_person').optional({ nullable: true }).trim(),
  body('phone').optional({ nullable: true }).trim(),
  body('alternate_phone').optional({ nullable: true }).trim(),
  body('email').optional({ nullable: true, checkFalsy: true }).trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('alternate_email').optional({ nullable: true, checkFalsy: true }).trim().isEmail().withMessage('Enter a valid alternate email address.').normalizeEmail(),
  body('corporate_address').optional({ nullable: true }).trim(),
  body('billing_address').optional({ nullable: true }).trim(),
  body('address').optional({ nullable: true }).trim(),
  body('efy').optional({ nullable: true }).trim(),
  body('adherence').optional({ nullable: true }).trim(),
  body('notes').optional({ nullable: true }).trim(),
];

router.get(
  '/',
  requirePermission('projects', 'view'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('status').optional().isIn([...STATUSES, 'all']),
  ],
  validate,
  controller.list
);

router.get(
  '/:id',
  requirePermission('projects', 'view'),
  [param('id').isInt({ min: 1 })],
  validate,
  controller.detail
);

router.post(
  '/',
  requirePermission('projects', 'create'),
  clientRules(true),
  validate,
  controller.create
);

router.patch(
  '/:id',
  requirePermission('projects', 'edit'),
  [param('id').isInt({ min: 1 }), ...clientRules(false)],
  validate,
  controller.update
);

router.delete(
  '/:id',
  requirePermission('projects', 'edit'),
  [param('id').isInt({ min: 1 })],
  validate,
  controller.remove
);

module.exports = router;
