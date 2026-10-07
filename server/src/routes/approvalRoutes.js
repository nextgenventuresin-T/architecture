'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { requirePermission, attachAccessContext } = require('../middleware/authorize');
const { attachHrScope } = require('../middleware/hrScope');
const { ROLES } = require('../config/roles');
const { MODULE_KEYS } = require('../config/approvalModules');
const controller = require('../controllers/approvalController');

const router = express.Router();
router.use(requireAuth);

// The central approvals layer needs to know the caller's live permissions and
// which contractor/employee record their account is linked to, both resolved
// from the database per request. `attachAccessContext` never blocks; it only
// makes the context available, so the Interface 3 routes below are unaffected.
router.use(attachAccessContext());

/**
 * `attachHrScope` refuses a CONTRACTOR account that is not linked to a
 * contractor record, which is right for the HR module (every one of its
 * contractor endpoints is meaningless without that link) but wrong here:
 * Interface 3's `GET /api/approvals` has always been open to any signed-in
 * user, and this router must not start 403-ing them.
 *
 * The scope is therefore best-effort. A caller who ends up without a
 * contractor id simply falls back to being scoped by their user id, which
 * shows them less, never more.
 */
router.use((req, res, next) => {
  attachHrScope(req, res, (error) => {
    if (error) req.hrScope = { role: req.user?.role, contractorId: null, employeeId: null };
    next();
  });
});

// ===========================================================================
// Interface 12 — central approvals.
//
// Declared BEFORE the Interface 3 `/:id` routes so that `/queue`, `/summary`
// and `/lookups` are not swallowed as ids, and `/:module/:id` (two segments)
// never collides with `/:id` (one segment).
//
// Reading requires `approvals:view`. Deciding is NOT gated by a single
// permission here, because the brief gives different roles authority over
// different approval types — HR over labour, Procurement over procurement,
// Finance over finance. That per-module decision lives in
// approvalService.canDecideOn, which the decision handler consults on every
// call. `canDecideRole` below is only a cheap outer gate that keeps roles
// with no approval authority at all (contractor, employee) from reaching the
// handler; it is not what authorises the decision.
// ===========================================================================

const canView = requirePermission('approvals', 'view');
const canDecideRole = requireRole(ROLES.ADMIN, ROLES.FINANCE, ROLES.HR, ROLES.PROCUREMENT);

const moduleParam = param('module')
  .isIn(MODULE_KEYS)
  .withMessage('Unknown approval module.');

router.get(
  '/queue',
  canView,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('status').optional().isIn(['pending', 'approved', 'rejected', 'all']).withMessage('Choose a valid status filter.'),
    query('module').optional().isIn([...MODULE_KEYS, 'all']).withMessage('Choose a valid module filter.'),
    query('projectId').optional().isInt({ min: 1 }).toInt(),
    query('siteId').optional().isInt({ min: 1 }).toInt(),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent', 'all']).withMessage('Choose a valid priority filter.'),
    query('dateFrom').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid from date.'),
    query('dateTo').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid to date.'),
    query('search').optional().trim(),
    query('includeCancelled').optional().isIn(['true', 'false']),
  ],
  validate,
  controller.queue
);

router.get('/summary', canView, controller.summary);
router.get('/lookups', canView, controller.lookups);

router.get(
  '/:module/:id',
  canView,
  [moduleParam, param('id').isInt({ min: 1 })],
  validate,
  controller.detail
);

router.get(
  '/:module/:id/history',
  canView,
  [moduleParam, param('id').isInt({ min: 1 })],
  validate,
  controller.history
);

router.post(
  '/:module/:id/decision',
  canView,
  canDecideRole,
  [
    moduleParam,
    param('id').isInt({ min: 1 }),
    body('decision').isIn(['approved', 'rejected']).withMessage('Decision must be approve or reject.'),
    // Optional on approval, required on rejection — the "required" half is
    // enforced in the service, where the decision is actually known.
    body('comment').optional({ nullable: true }).trim().isLength({ max: 500 })
      .withMessage('Keep the comment under 500 characters.'),
  ],
  validate,
  controller.decision
);

// ===========================================================================
// Interface 3 — the original generic approval_requests endpoints, unchanged.
// ===========================================================================

router.get(
  '/',
  [query('status').optional().isIn(['pending', 'approved', 'rejected', 'all']), query('projectId').optional().isInt({ min: 1 })],
  validate,
  controller.list
);

// Site teams raise requests; Admin and Finance decide them.
router.post(
  '/',
  [
    body('request_type').isIn(['material-request', 'payment-request', 'purchase-request', 'expense-claim', 'contractor-request'])
      .withMessage('Choose a valid request type.'),
    body('title').trim().notEmpty().withMessage('Enter a title for the request.'),
    body('requested_by').trim().notEmpty().withMessage('Enter who is raising this.'),
    body('amount').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
    body('project_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('site_id').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('details').optional({ nullable: true }).trim(),
  ],
  validate,
  controller.create
);

router.patch(
  '/:id',
  requireRole(ROLES.ADMIN, ROLES.FINANCE),
  [
    param('id').isInt({ min: 1 }),
    body('decision').isIn(['approved', 'rejected']).withMessage('Decision must be approve or reject.'),
    body('note').optional({ nullable: true }).trim().isLength({ max: 255 }),
  ],
  validate,
  controller.decide
);

module.exports = router;
