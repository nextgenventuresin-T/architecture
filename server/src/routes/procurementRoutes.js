'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const { attachHrScope } = require('../middleware/hrScope');
const { ROLES } = require('../config/roles');
const controller = require('../controllers/procurementController');

const router = express.Router();

// Everything below needs a signed-in user.
router.use(requireAuth);
router.use(attachHrScope);

// --- Bill / invoice file (real upload + secure view/download) ------------
// Defined BEFORE the procurement:view gate so Finance (who has finance:view,
// not procurement:view) can still open a bill. Record-level access is enforced
// in the service by the contractor scope, so a contractor can only reach their
// own request's bill.
const { uploadBill } = require('../middleware/upload');
router.post(
  '/:id/bill',
  requireRole(ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.CONTRACTOR),
  [param('id').isInt({ min: 1 })],
  validate,
  uploadBill,
  controller.uploadBill
);
router.get(
  '/:id/bill',
  requireRole(ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE, ROLES.FINANCE, ROLES.CONTRACTOR),
  [param('id').isInt({ min: 1 })],
  validate,
  controller.downloadBill
);

router.use(requirePermission('procurement', 'view'));

const STATUSES = [
  'draft', 'requested', 'pending_approval', 'approved', 'source_confirmed', 'rejected',
  'ordered', 'partially_received', 'received', 'cancelled',
];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

// Raising and progressing requests is a Procurement/Admin job throughout.
const canManage = requireRole(ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.CONTRACTOR);
const canManageOrders = requireRole(ROLES.ADMIN, ROLES.PROCUREMENT);
// Receiving deliveries is also something Warehouse staff do day to day.
const canReceive = requireRole(ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE);

const KINDS = ['project_site', 'central_purchase', 'contractor_supply', 'internal_transfer'];
const SOURCE_TYPES = ['supplier', 'central_warehouse', 'contractor', 'site'];

const requestRules = (isCreate) => {
  const required = (chain, message) => (isCreate ? chain.notEmpty().withMessage(message) : chain.optional());
  return [
    // project_id is no longer universally required — a central-warehouse or
    // contractor request has no project. The service validates per kind.
    body('project_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a valid project.').toInt(),
    body('site_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a valid site.').toInt(),
    body('task_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a valid task.').toInt(),
    required(body('material_id').isInt({ min: 1 }).withMessage('Select a material.'), 'Select a material.').toInt(),
    body('supplier').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('supplier_contact').optional({ nullable: true }).trim().isLength({ max: 150 }),
    required(body('quantity').isFloat({ gt: 0 }).withMessage('Enter a quantity greater than zero.'), 'Enter a quantity.').toFloat(),
    body('unit').optional({ nullable: true }).trim().isLength({ max: 20 }),
    body('estimated_rate').optional().isFloat({ min: 0 }).withMessage('Rate cannot be negative.').toFloat(),
    body('required_date').optional({ nullable: true }).isISO8601().withMessage('Enter a valid required date.'),
    body('priority').optional().isIn(PRIORITIES).withMessage('Choose a valid priority.'),
    body('requested_by').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('notes').optional({ nullable: true }).trim(),
    body('reason').optional({ nullable: true }).trim().isLength({ max: 255 }),
    body('excess_reason').optional({ nullable: true }).trim(),
    body('request_number').optional({ nullable: true }).trim().isLength({ max: 30 }),
    body('status').optional().isIn(['draft', 'requested', 'pending_approval']).withMessage('Choose a valid status.'),
    // Flow fields
    body('procurement_kind').optional().isIn(KINDS).withMessage('Choose a valid procurement type.'),
    body('source_type').optional({ nullable: true }).isIn(SOURCE_TYPES).withMessage('Choose a valid source.'),
    body('source_contractor_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('destination_contractor_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('source_site_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('destination_site_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    // External purchase / bill fields
    body('purchase_rate').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('total_amount').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('purchase_date').optional({ nullable: true }).isISO8601().withMessage('Enter a valid purchase date.'),
    body('bill_reference').optional({ nullable: true }).trim().isLength({ max: 255 }),
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
    query('status').optional().isIn([...STATUSES, 'all']).withMessage('Choose a valid status filter.'),
    query('projectId').optional().isInt({ min: 1 }).toInt(),
    query('siteId').optional().isInt({ min: 1 }).toInt(),
    query('materialId').optional().isInt({ min: 1 }).toInt(),
    query('supplier').optional().trim(),
    query('priority').optional().isIn([...PRIORITIES, 'all']).withMessage('Choose a valid priority filter.'),
    query('kind').optional().isIn([...KINDS, 'all']).withMessage('Choose a valid type filter.'),
  ],
  validate,
  controller.list
);

router.get('/:id', [param('id').isInt({ min: 1 })], validate, controller.detail);

router.post('/', canManage, requestRules(true), validate, controller.create);

router.put('/:id', canManage, [param('id').isInt({ min: 1 }), ...requestRules(false)], validate, controller.update);

router.patch(
  '/:id/status',
  canManage,
  [param('id').isInt({ min: 1 }), body('status').isIn(STATUSES).withMessage('Choose a valid status.')],
  validate,
  controller.updateStatus
);

// Source contractor confirms an approved contractor-to-contractor transfer.
// CONTRACTOR-only at the route; the service additionally verifies the caller
// IS the source contractor of this specific request.
router.post(
  '/:id/confirm',
  requireRole(ROLES.CONTRACTOR),
  [param('id').isInt({ min: 1 })],
  validate,
  controller.confirmSource
);

// Approved -> Ordered, stamping the purchase-order fields.
router.post(
  '/:id/order',
  canManageOrders,
  [
    param('id').isInt({ min: 1 }),
    body('po_number').optional({ nullable: true }).trim().isLength({ max: 30 }),
    body('ordered_quantity').optional().isFloat({ gt: 0 }).withMessage('Enter a quantity greater than zero.').toFloat(),
    body('order_date').optional({ nullable: true }).isISO8601().withMessage('Enter a valid order date.'),
    body('expected_delivery_date').optional({ nullable: true }).isISO8601().withMessage('Enter a valid delivery date.'),
  ],
  validate,
  controller.placeOrder
);

// Material receiving — also writes into the Interface 6 material_entries ledger.
router.post(
  '/:id/receiving',
  canReceive,
  [
    param('id').isInt({ min: 1 }),
    body('received_quantity').isFloat({ gt: 0 }).withMessage('Enter a quantity greater than zero.').toFloat(),
    body('receiving_date').isISO8601().withMessage('Enter a valid receiving date.'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 255 }),
  ],
  validate,
  controller.receive
);

router.put(
  '/:id/receiving/:receiptId',
  canReceive,
  [
    param('id').isInt({ min: 1 }),
    param('receiptId').isInt({ min: 1 }),
    body('received_quantity').optional().isFloat({ gt: 0 }).withMessage('Enter a quantity greater than zero.').toFloat(),
    body('receiving_date').optional().isISO8601().withMessage('Enter a valid receiving date.'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 255 }),
  ],
  validate,
  controller.updateReceipt
);

// Fulfil an approved request: performs the single warehouse movement (receipt
// or transfer) and links it. Admin/Procurement/Warehouse only — a contractor
// can raise a request but cannot move company/other-contractor stock.
router.post(
  '/:id/fulfil',
  canReceive,
  [
    param('id').isInt({ min: 1 }),
    body('transaction_date').optional({ nullable: true }).isISO8601().withMessage('Enter a valid date.'),
    body('bill_reference').optional({ nullable: true }).trim().isLength({ max: 255 }),
    body('total_amount').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('purchase_rate').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('purchase_date').optional({ nullable: true }).isISO8601(),
  ],
  validate,
  controller.fulfil
);

// SEND MATERIAL — Admin/Procurement/Warehouse for a Central -> Contractor
// supply, or the SOURCE contractor for a contractor-to-contractor transfer
// (which must already be source_confirmed). Both are enforced in the service:
// this role list is only the outer gate.

router.post(
  '/:id/dispatch',
  requireRole(ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.WAREHOUSE, ROLES.CONTRACTOR),
  [
    param('id').isInt({ min: 1 }),
    body('sent_quantity').optional({ nullable: true }).isFloat({ gt: 0 }).toFloat(),
    body('vehicle_number').optional({ nullable: true }).trim().isLength({ max: 40 }),
    body('driver_name').optional({ nullable: true }).trim().isLength({ max: 120 }),
    body('driver_phone').optional({ nullable: true }).trim().isLength({ max: 40 }),
    body('transport_cost').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('other_expenses').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('remarks').optional({ nullable: true }).trim().isLength({ max: 255 }),
  ],
  validate,
  controller.dispatch
);

module.exports = router;
