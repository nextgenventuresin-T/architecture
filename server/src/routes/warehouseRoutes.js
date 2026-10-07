'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const { attachHrScope } = require('../middleware/hrScope');
const { ROLES } = require('../config/roles');
const controller = require('../controllers/warehouseController');

const router = express.Router();

// Everything below needs a signed-in user, exactly like every other module.
router.use(requireAuth);
router.use(attachHrScope);

function canAccessWarehouse(req, res, next) {
  if (req.user && req.user.role === ROLES.CONTRACTOR) return next();
  return requirePermission('warehouse', 'view')(req, res, next);
}
router.use(canAccessWarehouse);

const STATUSES = ['active', 'inactive'];
const TRANSACTION_TYPES = ['receipt', 'issue', 'transfer', 'adjustment'];
const ADJUSTMENT_TYPES = ['increase', 'decrease'];
const STOCK_STATUSES = ['in_stock', 'low', 'out'];

// Creating and editing warehouses is an Admin/Warehouse responsibility.
const canManage = requireRole(ROLES.ADMIN, ROLES.WAREHOUSE);
// Moving stock is the same group plus Procurement, who receive deliveries.
const canMoveStock = requireRole(ROLES.ADMIN, ROLES.WAREHOUSE, ROLES.PROCUREMENT);
const canCreate = requirePermission('warehouse', 'create');
const canEdit = requirePermission('warehouse', 'edit');

/** Shared rules for the fields every stock movement carries. */
const movementRules = () => [
  body('material_id').isInt({ min: 1 }).withMessage('Select a material.').toInt(),
  body('warehouse_id').isInt({ min: 1 }).withMessage('Select a warehouse.').toInt(),
  body('project_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a valid project.').toInt(),
  body('site_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a valid site.').toInt(),
  body('quantity').isFloat({ gt: 0 }).withMessage('Enter a quantity greater than zero.').toFloat(),
  body('unit').optional({ nullable: true }).trim().isLength({ max: 20 }),
  body('reference').optional({ nullable: true }).trim().isLength({ max: 150 }),
  body('transaction_date').optional({ nullable: true }).isISO8601().withMessage('Enter a valid date.'),
  body('notes').optional({ nullable: true }).trim(),
];

const warehouseRules = (isCreate) => [
  isCreate
    ? body('name').trim().notEmpty().withMessage('Enter a warehouse name.').isLength({ max: 150 })
    : body('name').optional().trim().notEmpty().withMessage('Enter a warehouse name.').isLength({ max: 150 }),
  isCreate
    ? body('location').trim().notEmpty().withMessage('Enter a location.').isLength({ max: 255 })
    : body('location').optional().trim().notEmpty().withMessage('Enter a location.').isLength({ max: 255 }),
  body('code').optional({ nullable: true }).trim().isLength({ max: 30 }).withMessage('Warehouse code is too long.'),
  body('description').optional({ nullable: true }).trim(),
  body('status').optional().isIn(STATUSES).withMessage('Choose a valid status.'),
];

// ---------------------------------------------------------------------------
// Literal paths are declared before `/:id` so they are not swallowed by the
// id rule — the same ordering procurementRoutes.js uses for `/lookups`.
// ---------------------------------------------------------------------------

router.get('/lookups', controller.lookups);

router.get('/scopes', controller.scopes);

router.get(
  '/central-overview',
  [
    query('warehouseId').optional().trim(),
    query('search').optional().trim(),
    query('stockStatus').optional().isIn([...STOCK_STATUSES, 'all']).withMessage('Choose a valid stock status.'),
  ],
  validate,
  controller.centralOverview
);

router.get(
  '/contractor-transactions',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('search').optional().trim(),
    query('type').optional().isIn([...TRANSACTION_TYPES, 'all']).withMessage('Choose a valid transaction type.'),
    query('contractorId').optional().trim(),
    query('materialId').optional().trim(),
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
    query('fromWarehouseId').optional().trim(),
    query('toWarehouseId').optional().trim(),
    query('location').optional().trim(),
    query('dateFrom').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid start date.'),
    query('dateTo').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid end date.'),
  ],
  validate,
  controller.contractorTransactions
);

router.get('/summary', controller.summary);

router.get(
  '/stock',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('warehouseId').optional().trim(),
    query('materialId').optional().trim(),
    query('category').optional().trim(),
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
    query('stockStatus').optional().isIn([...STOCK_STATUSES, 'all']).withMessage('Choose a valid stock status.'),
  ],
  validate,
  controller.stock
);

router.get(
  '/stock/project-site',
  [query('projectId').optional().trim(), query('siteId').optional().trim()],
  validate,
  controller.projectSiteStock
);

router.get(
  '/transactions',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('search').optional().trim(),
    query('type').optional().isIn([...TRANSACTION_TYPES, 'all']).withMessage('Choose a valid transaction type.'),
    query('warehouseId').optional().trim(),
    query('materialId').optional().trim(),
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
    query('dateFrom').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid start date.'),
    query('dateTo').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid end date.'),
  ],
  validate,
  controller.transactions
);

// ------------------------------------------------------------ stock movements

// Receiving. `procurement_receipt_id` links the movement to an Interface 7
// delivery; the column is UNIQUE so the same receipt cannot be posted twice.
router.post(
  '/stock/receipt',
  canMoveStock,
  canCreate,
  [
    ...movementRules(),
    body('procurement_receipt_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('procurement_request_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('received_by').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.receive
);

router.post(
  '/stock/issue',
  canMoveStock,
  canCreate,
  [...movementRules(), body('issued_by').optional({ nullable: true }).isInt({ min: 1 }).toInt()],
  validate,
  controller.issue
);

router.post(
  '/stock/transfer',
  canMoveStock,
  canCreate,
  [
    ...movementRules(),
    body('destination_warehouse_id')
      .isInt({ min: 1 })
      .withMessage('Select a destination warehouse.')
      .toInt(),
    body('performed_by').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.transfer
);

router.post(
  '/stock/adjustment',
  canMoveStock,
  canCreate,
  [
    ...movementRules(),
    body('adjustment_type').isIn(ADJUSTMENT_TYPES).withMessage('Choose whether this increases or decreases stock.'),
    body('reason').trim().notEmpty().withMessage('Give a reason for this adjustment.').isLength({ max: 255 }),
    body('performed_by').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.adjust
);

// --------------------------------------------------------------- warehouses

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('search').optional().trim(),
    query('status').optional().isIn([...STATUSES, 'all']).withMessage('Choose a valid status filter.'),
    query('location').optional().trim(),
  ],
  validate,
  controller.list
);

router.get(
  '/:id/usage-overview',
  [
    param('id').isInt({ min: 1 }),
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
    query('dateFrom').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid start date.'),
    query('dateTo').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid end date.'),
  ],
  validate,
  controller.usageOverview
);

router.get('/:id', [param('id').isInt({ min: 1 })], validate, controller.detail);

router.post('/', canManage, canCreate, warehouseRules(true), validate, controller.create);

router.put('/:id', canManage, canEdit, [param('id').isInt({ min: 1 }), ...warehouseRules(false)], validate, controller.update);

module.exports = router;
