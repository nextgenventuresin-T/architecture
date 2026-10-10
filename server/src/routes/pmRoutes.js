'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { ROLES } = require('../config/roles');
const { attachHrScope } = require('../middleware/hrScope');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const pmController = require('../controllers/pmController');

const router = express.Router();

// Project Manager or Admin can access PM endpoints
router.use(requireAuth);
router.use(requireRole(ROLES.PROJECT_MANAGER, ROLES.ADMIN));
router.use(attachHrScope);

router.get('/dashboard', pmController.getDashboard);
router.get('/projects', pmController.getProjects);
router.get('/contractors', pmController.getContractors);
router.get('/work-updates', pmController.getWorkUpdates);
router.get('/procurement', pmController.getProcurement);
router.get('/site-warehouse', pmController.getSiteWarehouse);

// ---- Assigned-site workspace (deny-by-default: no assignment, no access) ----
router.get('/scope', pmController.getScope);
router.get(
  '/workers',
  [query('projectId').isInt({ min: 1 }), query('siteId').isInt({ min: 1 })],
  validate,
  pmController.listWorkers
);
router.get('/expenses', pmController.listExpenses);

// Labour attendance / workdays at an assigned site.
router.get('/attendance', pmController.listAttendance);
router.post(
  '/attendance',
  [
    body('contractorWorkerId').isInt({ min: 1 }).withMessage('Select a worker.'),
    body('projectId').isInt({ min: 1 }).withMessage('Select a project.'),
    body('siteId').isInt({ min: 1 }).withMessage('Select a site.'),
    body('taskId').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),
    body('date').optional().isISO8601(),
    body('status').optional().isIn(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE']),
    body('remarks').optional({ nullable: true }).trim().isLength({ max: 255 }),
  ],
  validate,
  pmController.markAttendance
);
router.patch(
  '/attendance/:id',
  [
    param('id').isInt({ min: 1 }),
    body('status').optional().isIn(['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE']),
    body('remarks').optional({ nullable: true }).trim().isLength({ max: 255 }),
  ],
  validate,
  pmController.updateAttendance
);

module.exports = router;
