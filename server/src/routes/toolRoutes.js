'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const controller = require('../controllers/toolController');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  requirePermission('materials', 'view'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('type').optional().trim(),
    query('status').optional().isIn(['all', 'active', 'inactive']),
  ],
  validate,
  controller.list
);

router.get(
  '/:id',
  requirePermission('materials', 'view'),
  [param('id').isInt({ min: 1 })],
  validate,
  controller.detail
);

router.post(
  '/',
  requirePermission('materials', 'create'),
  [
    body('name').trim().notEmpty().withMessage('Tool name is required.'),
    body('type').trim().notEmpty().withMessage('Tool type is required.'),
    body('description').optional({ nullable: true }).trim(),
    body('status').optional().isIn(['active', 'inactive']),
  ],
  validate,
  controller.create
);

router.patch(
  '/:id',
  requirePermission('materials', 'edit'),
  [
    param('id').isInt({ min: 1 }),
    body('name').optional().trim().notEmpty().withMessage('Tool name cannot be blank.'),
    body('type').optional().trim().notEmpty().withMessage('Tool type cannot be blank.'),
    body('description').optional({ nullable: true }).trim(),
    body('status').optional().isIn(['active', 'inactive']),
  ],
  validate,
  controller.update
);

router.delete(
  '/:id',
  requirePermission('materials', 'edit'),
  [param('id').isInt({ min: 1 })],
  validate,
  controller.remove
);

module.exports = router;
