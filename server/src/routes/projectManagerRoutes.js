'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const asyncHandler = require('../utils/asyncHandler');
const projectManagerService = require('../services/projectManagerService');

/**
 * /api/project-managers - Project Managers module (list / detail / create / edit).
 * Project Managers are employee records, so the employees permissions govern it.
 */
const router = express.Router();

router.use(requireAuth);
router.use(requirePermission('employees', 'view'));

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('status').optional().trim(),
  ],
  validate,
  asyncHandler(async (req, res) => ok(res, await projectManagerService.list(req.query)))
);

// Employees who can be made a Project Manager. Declared before '/:id'.
router.get('/candidates', asyncHandler(async (req, res) => ok(res, { employees: await projectManagerService.candidates() })));

router.get(
  '/:id',
  [param('id').isInt({ min: 1 })],
  validate,
  asyncHandler(async (req, res) => ok(res, await projectManagerService.getDetail(req.params.id)))
);

// Make an existing employee a Project Manager (details stay on the employee record).
router.post(
  '/',
  requirePermission('employees', 'edit'),
  [
    body('employee_id').isInt({ min: 1 }).withMessage('Select an employee.').toInt(),
    body('createUserAccess').optional({ nullable: true }).isObject(),
  ],
  validate,
  asyncHandler(async (req, res) => ok(res, await projectManagerService.assign(req.body.employee_id, req.body, req.user?.id), 201))
);

module.exports = router;
