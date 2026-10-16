'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { attachHrScope } = require('../middleware/hrScope');
const { ROLES } = require('../config/roles');
const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/companyLabourService');

/**
 * /api/labour - company labour (registered and paid by the company), its
 * attendance, and the project / site-wise labour report.
 *
 *   Admin / HR : manage company workers, mark attendance, full report.
 *   Contractor : company-labour dropdown (name + phone only) and a report of the
 *                work on their own sites - days for company labour, days and wages
 *                for their own workers.
 */
const router = express.Router();
router.use(requireAuth);
router.use(attachHrScope);

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const manage = requireRole(ROLES.ADMIN, ROLES.HR);
const id = param('id').isInt({ min: 1 }).toInt();

const reportRules = [
  query('projectId').optional().isInt({ min: 1 }).toInt(),
  query('siteId').optional().isInt({ min: 1 }).toInt(),
  query('taskId').optional().isInt({ min: 1 }).toInt(),
  query('areaId').optional().isInt({ min: 1 }).toInt(),
  query('contractorId').optional().isInt({ min: 1 }).toInt(),
  query('workerKind').optional().isIn(['all', 'company', 'contractor']),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('search').optional().trim(),
];

// ---- contractor-facing
router.get(
  '/company-workers/lookup',
  requireRole(ROLES.ADMIN, ROLES.HR, ROLES.CONTRACTOR, ROLES.PROJECT_MANAGER),
  asyncHandler(async (req, res) => ok(res, { workers: await service.lookup() }))
);
router.get(
  '/report/mine',
  requireRole(ROLES.CONTRACTOR),
  reportRules,
  validate,
  asyncHandler(async (req, res) => ok(res, await service.labourReport({ ...req.query, contractorId: undefined }, { forContractorId: req.hrScope.contractorId })))
);

// ---- admin / HR
const workerRules = [
  body('name').optional().trim().isLength({ max: 150 }),
  body('phone').optional({ nullable: true }).trim().isLength({ max: 30 }),
  body('skill').optional({ nullable: true }).trim().isLength({ max: 80 }),
  body('dailyRate').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Enter a valid daily wage.'),
  body('aadhaarNumber').optional({ nullable: true }).trim().isLength({ max: 30 }),
  body('joiningDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Enter a valid date.'),
  body('status').optional().isIn(['active', 'inactive']),
  body('notes').optional({ nullable: true }).trim(),
];
router.get('/company-workers', manage, [query('search').optional().trim(), query('status').optional().trim()], validate,
  asyncHandler(async (req, res) => ok(res, { workers: await service.listWorkers(req.query) })));
router.get('/company-workers/:id', manage, [id], validate, asyncHandler(async (req, res) => ok(res, await service.getWorker(req.params.id))));
router.post('/company-workers', manage, workerRules, validate, asyncHandler(async (req, res) => ok(res, { worker: await service.createWorker(req.body) }, 201)));
router.patch('/company-workers/:id', manage, [id, ...workerRules], validate,
  asyncHandler(async (req, res) => ok(res, { worker: await service.updateWorker(req.params.id, req.body) })));

router.get(
  '/company-attendance',
  manage,
  [
    query('date').optional().isISO8601(), query('from').optional().isISO8601(), query('to').optional().isISO8601(),
    query('projectId').optional().isInt({ min: 1 }), query('siteId').optional().isInt({ min: 1 }),
    query('taskId').optional().isInt({ min: 1 }), query('workerId').optional().isInt({ min: 1 }),
    query('page').optional().isInt({ min: 1 }), query('pageSize').optional().isInt({ min: 1, max: 500 }),
  ],
  validate,
  asyncHandler(async (req, res) => ok(res, await service.listAttendance(req.query)))
);
router.post(
  '/company-attendance',
  manage,
  [
    body('date').isISO8601().withMessage('Enter the attendance date.'),
    body('project_id').isInt({ min: 1 }).withMessage('Select the project.').toInt(),
    body('site_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).toInt(),
    body('task_id').isInt({ min: 1 }).withMessage('Select the task.').toInt(),
    body('subtask_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).toInt(),
    body('area_id').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).toInt(),
    body('entries').isArray({ min: 1 }).withMessage('Add at least one worker.'),
  ],
  validate,
  asyncHandler(async (req, res) => ok(res, await service.markAttendance(req.body, req.user?.id), 201))
);
router.delete('/company-attendance/:id', manage, [id], validate, asyncHandler(async (req, res) => ok(res, await service.deleteAttendance(req.params.id))));

router.get('/report', manage, reportRules, validate, asyncHandler(async (req, res) => ok(res, await service.labourReport(req.query))));

module.exports = router;
