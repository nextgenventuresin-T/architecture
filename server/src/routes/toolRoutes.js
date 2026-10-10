'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { attachHrScope } = require('../middleware/hrScope');
const { ROLES } = require('../config/roles');
const { requirePermission } = require('../middleware/authorize');
const controller = require('../controllers/toolController');

const router = express.Router();
router.use(requireAuth);
router.use(attachHrScope);

const adminOnly = requireRole(ROLES.ADMIN);
const HEALTH = ['excellent', 'good', 'average', 'poor'];
const CHARGE_POLICIES = ['none', 'per_day_rate', 'fixed_total'];
const idParam = (name) => param(name).isInt({ min: 1 }).toInt();
const optId = (name) => body(name).optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).toInt();
const optDate = (name) => body(name).optional({ nullable: true, checkFalsy: true }).isISO8601();

// ------------------------------------------------------------------------
// Serial-numbered physical machines. Declared BEFORE '/:id' so the literal
// paths are not swallowed by the machine-type id rule.
// ------------------------------------------------------------------------
router.get(
  '/units',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('toolId').optional().isInt({ min: 1 }).toInt(),
    query('status').optional().isIn(['all', 'available', 'allocated', 'maintenance', 'retired']),
    query('health').optional().isIn(['all', ...HEALTH]),
    query('contractorId').optional().isInt({ min: 1 }).toInt(),
    query('search').optional().trim(),
  ],
  validate,
  controller.listUnits
);

router.post(
  '/units',
  adminOnly,
  [
    body('tool_id').isInt({ min: 1 }).withMessage('Choose a machine type.').toInt(),
    body('serial_number').trim().notEmpty().withMessage('A unique serial number is required.').isLength({ max: 80 }),
    optDate('purchase_date'),
    optDate('expiry_date'),
    body('purchase_cost').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
    optId('vendor_id'),
    body('health').optional().isIn(HEALTH),
    optId('warehouse_id'),
  ],
  validate,
  controller.registerUnit
);

router.get('/units/:unitId', [idParam('unitId')], validate, controller.unitDetail);

router.patch(
  '/units/:unitId',
  adminOnly,
  [
    idParam('unitId'),
    body('serial_number').optional().trim().notEmpty().isLength({ max: 80 }),
    optDate('purchase_date'),
    optDate('expiry_date'),
    body('purchase_cost').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  ],
  validate,
  controller.updateUnit
);

// Health: Admin, or a Project Manager for machines on their assigned projects
// (the PM's scope is enforced in the service).
router.patch(
  '/units/:unitId/health',
  requireRole(ROLES.ADMIN, ROLES.PROJECT_MANAGER),
  [
    idParam('unitId'),
    body('health').isIn(HEALTH).withMessage('Choose Excellent, Good, Average or Poor.'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 480 }),
  ],
  validate,
  controller.updateHealth
);

router.post(
  '/units/:unitId/availability',
  adminOnly,
  [idParam('unitId'), body('action').isIn(['start_maintenance', 'end_maintenance', 'retire', 'reinstate'])],
  validate,
  controller.setAvailability
);

router.post(
  '/units/:unitId/allocate',
  adminOnly,
  [
    idParam('unitId'),
    optId('contractor_id'), optId('project_id'), optId('site_id'), optId('task_id'), optId('subtask_id'),
    optDate('start_date'), optDate('expected_return_date'),
    body('charge_policy').optional().isIn(CHARGE_POLICIES),
  ],
  validate,
  controller.allocateUnit
);

// Reassignment: close out the current holder and hand the SAME serial to a new
// Contractor/Project/Site/Task in one step.
router.post(
  '/units/:unitId/transfer',
  adminOnly,
  [
    idParam('unitId'),
    optId('contractor_id'), optId('project_id'), optId('site_id'), optId('task_id'), optId('subtask_id'),
    optDate('return_date'), optDate('start_date'), optDate('expected_return_date'),
    body('charge_policy').optional().isIn(CHARGE_POLICIES),
  ],
  validate,
  controller.transferUnit
);

router.post(
  '/units/:unitId/return-rental',
  adminOnly,
  [idParam('unitId'), optDate('actual_return_date')],
  validate,
  controller.returnRental
);

router.get(
  '/allocations',
  [
    query('status').optional().isIn(['all', 'active', 'returned']),
    query('unitId').optional().isInt({ min: 1 }).toInt(),
    query('contractorId').optional().isInt({ min: 1 }).toInt(),
    query('projectId').optional().isInt({ min: 1 }).toInt(),
    query('taskId').optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.listAllocations
);

router.patch(
  '/allocations/:allocationId/charge',
  adminOnly,
  [idParam('allocationId'), body('charge_policy').isIn(CHARGE_POLICIES)],
  validate,
  controller.setCharge
);

router.get('/rentals', requireRole(ROLES.ADMIN, ROLES.FINANCE), controller.listRentals);

router.get(
  '/',
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
  [param('id').isInt({ min: 1 })],
  validate,
  controller.detail
);

router.get(
  '/:id/availability',
  [
    param('id').isInt({ min: 1 }),
    query('quantity').optional().isFloat({ min: 0.1 }),
  ],
  validate,
  controller.availability
);

router.post(
  '/:id/allocate',
  [
    param('id').isInt({ min: 1 }),
    body('quantity').optional().isFloat({ min: 0.1 }),
    body('task_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('project_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('site_id').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  validate,
  controller.allocate
);

router.post(
  '/allocations/:assignmentId/return',
  requireRole(ROLES.ADMIN, ROLES.PROJECT_MANAGER, ROLES.CONTRACTOR),
  [
    param('assignmentId').isInt({ min: 1 }),
    optDate('returned_date'),
    body('health').optional().isIn(HEALTH),
  ],
  validate,
  controller.returnAllocation
);

router.post(
  '/',
  requirePermission('materials', 'create'),
  [
    body('name').trim().notEmpty().withMessage('Tool name is required.'),
    body('type').trim().notEmpty().withMessage('Tool type is required.'),
    body('description').optional({ nullable: true }).trim(),
    body('status').optional().isIn(['active', 'inactive']),
    body('total_quantity').optional().isInt({ min: 1 }),
    body('ownership_type').optional().isIn(['owned', 'to_be_purchased', 'rented']),
    body('default_charge_rate').optional().isFloat({ min: 0 }),
    body('rental_rate').optional().isFloat({ min: 0 }),
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
    body('total_quantity').optional().isInt({ min: 1 }),
    body('ownership_type').optional().isIn(['owned', 'to_be_purchased', 'rented']),
    body('default_charge_rate').optional().isFloat({ min: 0 }),
    body('rental_rate').optional().isFloat({ min: 0 }),
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
