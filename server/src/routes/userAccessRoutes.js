'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const controller = require('../controllers/userAccessController');

const router = express.Router();

// Every route below requires a signed-in user.
router.use(requireAuth);

// Managing users is gated on the `users` module permission rather than a
// hardcoded role check, so an admin can delegate this without editing code.
const canView = requirePermission('users', 'view');
const canCreate = requirePermission('users', 'create');
const canEdit = requirePermission('users', 'edit');
const canDeactivate = requirePermission('users', 'delete');

const STATUSES = ['active', 'inactive'];

const userRules = (isCreate) => [
  isCreate
    ? body('full_name').trim().notEmpty().withMessage('Enter a full name.').isLength({ max: 150 })
    : body('full_name').optional().trim().notEmpty().withMessage('Enter a full name.').isLength({ max: 150 }),
  isCreate
    ? body('email').trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail()
    : body('email').optional().trim().isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('username').optional({ nullable: true }).trim().isLength({ max: 60 }),
  body('phone').optional({ nullable: true }).trim().isLength({ max: 30 }),
  body('department').optional({ nullable: true }).trim().isLength({ max: 100 }),
  body('role').optional().trim(),
  body('role_id').optional().isInt({ min: 1 }).toInt(),
  body('status').optional().isIn(STATUSES).withMessage('Choose a valid status.'),
  body('notes').optional({ nullable: true }).trim(),
  body('permissionIds').optional({ nullable: true }).isArray().withMessage('Send permissions as an array.'),
  body('permissionIds.*').optional().isInt({ min: 1 }).toInt(),
];

// ---------------------------------------------------------------------------
// Literal paths before `/:id`, so `/roles` and `/permissions` are not parsed
// as a user id — the ordering procurementRoutes.js established.
// ---------------------------------------------------------------------------

router.get('/lookups', canView, controller.lookups);
router.get('/roles', canView, controller.listRoles);
router.get('/permissions', canView, controller.listPermissions);

router.get('/roles/:id', canView, [param('id').isInt({ min: 1 })], validate, controller.getRole);

router.put(
  '/roles/:id',
  canEdit,
  [
    param('id').isInt({ min: 1 }),
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('description').optional({ nullable: true }).trim().isLength({ max: 255 }),
    body('is_active').optional().isBoolean().toBoolean(),
  ],
  validate,
  controller.updateRole
);

router.put(
  '/roles/:id/permissions',
  canEdit,
  [
    param('id').isInt({ min: 1 }),
    body('permissionIds').isArray().withMessage('Send the permission list as an array.'),
    body('permissionIds.*').isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.updateRolePermissions
);

// Any signed-in user may change their OWN password — no `users` permission
// needed, and the service verifies the current password first.
router.post(
  '/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Enter your current password.'),
    body('password').isString().withMessage('Enter a new password.'),
    body('confirmPassword').optional().isString(),
  ],
  validate,
  controller.changeOwnPassword
);

// ------------------------------------------------------------------ users

router.get(
  '/',
  canView,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('search').optional().trim(),
    query('role').optional().trim(),
    query('status').optional().isIn([...STATUSES, 'all']).withMessage('Choose a valid status filter.'),
    query('projectId').optional().trim(),
    query('siteId').optional().trim(),
  ],
  validate,
  controller.list
);

router.post(
  '/',
  canCreate,
  [...userRules(true), body('password').isString().withMessage('Enter a password.'), body('confirmPassword').optional().isString()],
  validate,
  controller.create
);

router.get('/:id', canView, [param('id').isInt({ min: 1 })], validate, controller.detail);

router.put('/:id', canEdit, [param('id').isInt({ min: 1 }), ...userRules(false)], validate, controller.update);

router.patch(
  '/:id/status',
  canDeactivate,
  [param('id').isInt({ min: 1 }), body('status').isIn(STATUSES).withMessage('Choose a valid status.')],
  validate,
  controller.setStatus
);

router.post(
  '/:id/reset-password',
  canEdit,
  [
    param('id').isInt({ min: 1 }),
    body('password').isString().withMessage('Enter a new password.'),
    body('confirmPassword').optional().isString(),
  ],
  validate,
  controller.resetPassword
);

// ---------------------------------------------------------- project/site access

router.get('/:id/access', canView, [param('id').isInt({ min: 1 })], validate, controller.getAccess);

router.put(
  '/:id/access/projects',
  canEdit,
  [
    param('id').isInt({ min: 1 }),
    body('projectIds').isArray().withMessage('Send the project list as an array.'),
    body('projectIds.*').isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.setProjectAccess
);

router.put(
  '/:id/access/sites',
  canEdit,
  [
    param('id').isInt({ min: 1 }),
    body('siteIds').isArray().withMessage('Send the site list as an array.'),
    body('siteIds.*').isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.setSiteAccess
);

router.put(
  '/:id/permissions',
  canEdit,
  [
    param('id').isInt({ min: 1 }),
    body('permissionIds').optional({ nullable: true }).isArray().withMessage('Send the permission list as an array.'),
    body('permissionIds.*').optional().isInt({ min: 1 }).toInt(),
    body('useCustom').optional().isBoolean().toBoolean(),
  ],
  validate,
  controller.updateUserPermissions
);

module.exports = router;
