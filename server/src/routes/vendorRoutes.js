'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const { ROLES } = require('../config/roles');
const controller = require('../controllers/vendorController');

const router = express.Router();

router.use(requireAuth);

router.get(
  '/',
  [
    query('search').optional().trim(),
    query('status').optional().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 200 }),
  ],
  validate,
  controller.list
);

router.get(
  '/:id',
  [param('id').isInt({ min: 1 })],
  validate,
  controller.getById
);

router.post(
  '/',
  requireRole(ROLES.ADMIN, ROLES.PROCUREMENT),
  [
    body('name').trim().notEmpty().withMessage('Vendor name is required'),
    body('contact_person').optional().trim(),
    body('phone').optional().trim(),
    body('email').optional().trim(),
    body('gst_number').optional().trim(),
    body('pan_number').optional().trim(),
    body('status').optional().isIn(['active', 'inactive']),
  ],
  validate,
  controller.create
);

router.patch(
  '/:id',
  requireRole(ROLES.ADMIN, ROLES.PROCUREMENT),
  [
    param('id').isInt({ min: 1 }),
    body('name').optional().trim().notEmpty().withMessage('Vendor name cannot be empty'),
  ],
  validate,
  controller.update
);

router.delete(
  '/:id',
  requireRole(ROLES.ADMIN),
  [param('id').isInt({ min: 1 })],
  validate,
  controller.remove
);

module.exports = router;
