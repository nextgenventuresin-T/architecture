'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const { attachHrScope } = require('../middleware/hrScope');
const { ROLES } = require('../config/roles');
const controller = require('../controllers/materialMovementController');

const router = express.Router();

router.use(requireAuth);
router.use(attachHrScope);
// Contractors legitimately need their own incoming/outgoing shipments and the
// receive action, but they don't hold the broad `warehouse:view` permission.
// Admin / Warehouse / Procurement reach these via that permission; contractors
// reach them via role — and in BOTH cases the service scopes a contractor to
// only the movements they are the source or destination of, so this does not
// widen data access.
function canAccessMovements(req, res, next) {
  if (req.user && req.user.role === ROLES.CONTRACTOR) return next();
  return requirePermission('warehouse', 'view')(req, res, next);
}
router.use(canAccessMovements);

// Sending / receiving is done by the contractors themselves, or by Admin/Warehouse.
const canMove = requireRole(ROLES.ADMIN, ROLES.WAREHOUSE, ROLES.CONTRACTOR);

router.get('/incoming', controller.incoming);
router.get('/stock', controller.stock);

router.get(
  '/',
  [
    query('status').optional().isIn(['in_transit', 'received', 'completed', 'cancelled', 'all']),
    query('materialId').optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.list
);

router.get('/:id', [param('id').isInt({ min: 1 })], validate, controller.detail);

// SEND MATERIAL — issues source stock now, creates an in-transit shipment.
router.post(
  '/send',
  canMove,
  [
    body('material_id').isInt({ min: 1 }).withMessage('Select a material.').toInt(),
    body('destination_contractor_id').isInt({ min: 1 }).withMessage('Select the destination contractor.').toInt(),
    body('source_contractor_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('source_warehouse_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('sent_quantity').isFloat({ gt: 0 }).withMessage('Enter a quantity greater than zero.').toFloat(),
    body('requested_quantity').optional({ nullable: true }).isFloat({ gt: 0 }).toFloat(),
    body('project_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('site_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('vehicle_number').optional({ nullable: true }).trim().isLength({ max: 40 }),
    body('driver_name').optional({ nullable: true }).trim().isLength({ max: 120 }),
    body('driver_phone').optional({ nullable: true }).trim().isLength({ max: 40 }),
    body('transport_cost').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('other_expenses').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('reference').optional({ nullable: true }).trim().isLength({ max: 60 }),
    body('remarks').optional({ nullable: true }).trim().isLength({ max: 255 }),
    body('procurement_request_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.send
);

// RECEIVE MATERIAL — increases destination stock now, completes the shipment.
router.post(
  '/:id/receive',
  canMove,
  [
    param('id').isInt({ min: 1 }),
    body('received_quantity').optional({ nullable: true }).isFloat({ gt: 0 }).toFloat(),
    body('receiving_date').optional({ nullable: true }).isISO8601(),
    body('vehicle_number').optional({ nullable: true }).trim().isLength({ max: 40 }),
    body('remarks').optional({ nullable: true }).trim().isLength({ max: 255 }),
  ],
  validate,
  controller.receive
);

module.exports = router;
