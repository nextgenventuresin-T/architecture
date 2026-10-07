'use strict';

const express = require('express');
const { query, param } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const { attachHrScope } = require('../middleware/hrScope');
const controller = require('../controllers/reportController');

const router = express.Router();

// Everything below needs a signed-in user. `attachHrScope` resolves whether
// the caller is a CONTRACTOR/EMPLOYEE linked to their own record, which is
// what every drill-down below scopes contractor-owned data by — never a
// query parameter. `reports:view` is the base gate for the whole module;
// individual reports additionally require their own module's `:view`
// permission (checked in reportService), exactly like every other
// cross-module read in this ERP.
router.use(requireAuth);
router.use(attachHrScope);
router.use(requirePermission('reports', 'view'));

const paginationRules = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('search').optional().trim(),
  query('dateFrom').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid start date.'),
  query('dateTo').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid end date.'),
];

router.get('/dashboard', controller.dashboard);

router.get(
  '/projects',
  [
    ...paginationRules,
    query('status').optional().trim(),
    query('contractorId').optional().trim(),
    query('clientId').optional().trim(),
  ],
  validate,
  controller.projects
);

router.get(
  '/sites',
  [
    ...paginationRules,
    query('status').optional().trim(),
    query('safetyStatus').optional().trim(),
    query('projectId').optional().trim(),
  ],
  validate,
  controller.sites
);

router.get(
  '/contractors',
  [...paginationRules, query('status').optional().trim(), query('type').optional().trim()],
  validate,
  controller.contractors
);

router.get('/contractors/:id', [param('id').isInt({ min: 1 })], validate, controller.contractorDetail);

router.get(
  '/employees',
  [
    ...paginationRules,
    query('status').optional().trim(),
    query('type').optional().trim(),
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
  ],
  validate,
  controller.employees
);

router.get(
  '/materials',
  [
    ...paginationRules,
    query('category').optional().trim(),
    query('status').optional().trim(),
    query('stockStatus').optional().isIn(['out', 'low', 'healthy', 'all']),
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
  ],
  validate,
  controller.materials
);

router.get(
  '/procurement',
  [
    ...paginationRules,
    query('status').optional().trim(),
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
    query('materialId').optional().trim(),
    query('supplier').optional().trim(),
    query('priority').optional().trim(),
  ],
  validate,
  controller.procurement
);

router.get(
  '/warehouse/stock',
  [
    ...paginationRules,
    query('warehouseId').optional().trim(),
    query('materialId').optional().trim(),
    query('category').optional().trim(),
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
    query('stockStatus').optional().trim(),
  ],
  validate,
  controller.warehouseStock
);

router.get(
  '/warehouse/transactions',
  [
    ...paginationRules,
    query('type').optional().trim(),
    query('warehouseId').optional().trim(),
    query('materialId').optional().trim(),
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
  ],
  validate,
  controller.warehouseTransactions
);

router.get(
  '/finance/expenses',
  [
    ...paginationRules,
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
    query('category').optional().trim(),
    query('status').optional().trim(),
  ],
  validate,
  controller.expenses
);

router.get(
  '/finance/contractor-payments',
  [
    ...paginationRules,
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
    query('contractorId').optional().trim(),
    query('status').optional().trim(),
  ],
  validate,
  controller.contractorPayments
);

router.get(
  '/finance/projects',
  [...paginationRules, query('projectId').optional().trim()],
  validate,
  controller.projectFinancials
);

module.exports = router;
