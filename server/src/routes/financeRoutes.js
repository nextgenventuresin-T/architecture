'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const { attachHrScope } = require('../middleware/hrScope');
const { uploadBill } = require('../middleware/upload');
const { ROLES } = require('../config/roles');
const controller = require('../controllers/financeController');
const { EXPENSE_CATEGORIES } = require('../services/financeService');

const router = express.Router();

// Everything below needs a signed-in user.
router.use(requireAuth);
router.use(attachHrScope);

// Contractors legitimately need their own daily expenses and lookups, but don't
// hold the broad `finance:view` permission. Admin and Finance reach everything
// via permissions; contractors reach scoped endpoints by role.
function canAccessFinance(req, res, next) {
  if (req.user && req.user.role === ROLES.CONTRACTOR) return next();
  return requirePermission('finance', 'view')(req, res, next);
}
router.use(canAccessFinance);

const STATUSES = ['pending', 'approved', 'paid', 'rejected', 'cancelled'];
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'upi', 'card', 'other'];
const PAYMENT_TYPES = ['expense', 'contractor', 'procurement'];

// Admin/Finance responsibility
const canManage = requireRole(ROLES.ADMIN, ROLES.FINANCE);
const canApprove = requirePermission('finance', 'approve');

function canCreateExpense(req, res, next) {
  if (req.user && req.user.role === ROLES.CONTRACTOR) return next();
  if ([ROLES.ADMIN, ROLES.FINANCE].includes(req.user?.role)) {
    return requirePermission('finance', 'create')(req, res, next);
  }
  return res.status(403).json({ success: false, message: 'Forbidden' });
}

function canEditExpense(req, res, next) {
  if (req.user && req.user.role === ROLES.CONTRACTOR) return next();
  if ([ROLES.ADMIN, ROLES.FINANCE].includes(req.user?.role)) {
    return requirePermission('finance', 'edit')(req, res, next);
  }
  return res.status(403).json({ success: false, message: 'Forbidden' });
}

const expenseRules = (isCreate) => {
  const required = (chain) => (isCreate ? chain : chain.optional());
  return [
    required(body('project_id').isInt({ min: 1 }).withMessage('Select a project.')).toInt(),
    body('site_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a valid site.').toInt(),
    body('task_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).withMessage('Select a valid task.').toInt(),
    body('subtask_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).withMessage('Select a valid subtask.').toInt(),
    required(body('category').isIn(EXPENSE_CATEGORIES).withMessage('Choose a valid category.')),
    body('description').optional({ nullable: true }).trim().isLength({ max: 255 }),
    body('remarks').optional({ nullable: true }).trim(),
    required(body('amount').isFloat({ gt: 0 }).withMessage('Enter an amount greater than zero.')).toFloat(),
    required(body('expense_date').isISO8601().withMessage('Enter a valid expense date.')),
    body('paid_by').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('party_name').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('payment_method')
      .optional({ nullable: true, checkFalsy: true })
      .isIn(PAYMENT_METHODS)
      .withMessage('Choose a valid payment method.'),
    body('reference').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('notes').optional({ nullable: true }).trim(),
    body('expense_number').optional({ nullable: true }).trim().isLength({ max: 30 }),
    body('status').optional().isIn(STATUSES).withMessage('Choose a valid status.'),
  ];
};

/** Filters shared by most finance list endpoints. */
const filterRules = () => [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('search').optional().trim(),
  query('projectId').optional().trim(),
  query('siteId').optional().trim(),
  query('contractorId').optional().trim(),
  query('dateFrom').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid start date.'),
  query('dateTo').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid end date.'),
];

// ---------------------------------------------------------------------------
// Literal paths first, so `/expenses/:id` cannot swallow `/summary` etc.
// ---------------------------------------------------------------------------

router.get('/summary', canManage, controller.summary);
router.get('/lookups', controller.lookups);

// -------------------------------------------------------------- contractor inventory & consumption
router.get('/contractor-inventory', controller.contractorInventory);

router.post(
  '/contractor-consumption',
  canCreateExpense,
  [
    body('project_id').isInt({ min: 1 }).withMessage('Select a project.').toInt(),
    body('site_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).withMessage('Select a valid site.').toInt(),
    body('phase_number').isInt({ min: 1, max: 8 }).withMessage('Select a valid phase (1-8).').toInt(),
    body('subcategory').trim().notEmpty().withMessage('Select a subcategory.'),
    body('material_id').isInt({ min: 1 }).withMessage('Select a material or tool.').toInt(),
    body('quantity_used').isFloat({ gt: 0 }).withMessage('Enter quantity used greater than zero.').toFloat(),
    body('expense_date').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid date.'),
    body('remarks').optional({ nullable: true }).trim(),
    body('contractor_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.recordConsumption
);

// -------------------------------------------------------------- expenses

router.get(
  '/expenses',
  [
    ...filterRules(),
    query('category').optional().trim(),
    query('status').optional().isIn([...STATUSES, 'all']).withMessage('Choose a valid status filter.'),
  ],
  validate,
  controller.listExpenses
);

router.post('/expenses', canCreateExpense, uploadBill, expenseRules(true), validate, controller.createExpense);

router.get('/expenses/:id', [param('id').isInt({ min: 1 })], validate, controller.getExpense);

router.post(
  '/expenses/:id/bill',
  [param('id').isInt({ min: 1 })],
  uploadBill,
  validate,
  controller.uploadBill
);

router.get(
  '/expenses/:id/bill',
  [param('id').isInt({ min: 1 })],
  validate,
  controller.downloadBill
);

router.put(
  '/expenses/:id',
  canEditExpense,
  [param('id').isInt({ min: 1 }), ...expenseRules(false)],
  validate,
  controller.updateExpense
);

router.patch(
  '/expenses/:id/status',
  canManage,
  canApprove,
  [param('id').isInt({ min: 1 }), body('status').isIn(STATUSES).withMessage('Choose a valid status.')],
  validate,
  controller.updateExpenseStatus
);

// --------------------------------------------------- contractor payments

router.get(
  '/contractor-payments',
  [
    ...filterRules(),
    query('contractorId').optional().trim(),
    query('status').optional().trim(),
  ],
  validate,
  controller.contractorPayments
);

router.get(
  '/contractor-payments/:id',
  [param('id').isInt({ min: 1 })],
  validate,
  controller.contractorPaymentDetail
);

// ---------------------------------------------------- procurement finance

router.get(
  '/procurement',
  [...filterRules(), query('supplier').optional().trim(), query('status').optional().trim()],
  validate,
  controller.procurement
);

// ------------------------------------------------------ project financials

router.get(
  '/projects',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('search').optional().trim(),
    query('projectId').optional().trim(),
  ],
  validate,
  controller.projectFinancials
);

router.get('/projects/:id', [param('id').isInt({ min: 1 })], validate, controller.projectFinancialDetail);
router.get('/projects/:id/material-consumption', [param('id').isInt({ min: 1 })], validate, controller.projectMaterialConsumption);

// -------------------------------------------------------- payment tracking

router.get(
  '/payments',
  [
    ...filterRules(),
    query('type').optional().isIn([...PAYMENT_TYPES, 'all']).withMessage('Choose a valid payment type.'),
    query('status').optional().trim(),
  ],
  validate,
  controller.payments
);

// Admin/Finance only: these expose company-wide cost, receivable and profit figures.
// -------------------------------------------------------- Restructured Finance Tabs
router.get('/project-costs', canManage, controller.projectCosts);
router.get('/actual-expenses', canManage, controller.actualExpenses);
router.get('/budget-vs-actual', canManage, controller.budgetVsActual);
router.get('/procurement-ledger', canManage, controller.procurementLedger);
// Click-through: one ledger entry down to its source transaction.
router.get('/ledger-entry', canManage, [query('type').trim().notEmpty(), query('id').isInt({ min: 1 })], validate, controller.ledgerEntry);
router.get('/vendor-payables', canManage, controller.vendorPayables);
router.post('/vendor-payments', canManage, controller.recordVendorPayment);
router.get('/vendor-payments/:id', canManage, controller.vendorPaymentsHistory);
router.get('/client-payments', canManage, controller.clientPaymentsSummary);
router.post('/client-payments', canManage, controller.recordClientPayment);
router.get('/client-payments/history', canManage, controller.clientPaymentsHistory);
router.get('/profitability', canManage, controller.profitabilitySummary);
router.get('/drilldown', canManage, controller.drilldownDetails);

module.exports = router;
