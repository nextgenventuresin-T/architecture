'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { attachHrScope } = require('../middleware/hrScope');
const { requirePermission } = require('../middleware/authorize');
const controller = require('../controllers/taskController');

const router = express.Router();

router.use(requireAuth);
router.use(attachHrScope);

router.get(
  '/',
  [
    query('projectId').optional().isInt({ min: 1 }),
    query('siteId').optional().isInt({ min: 1 }),
    query('status').optional().trim(),
    query('search').optional().trim(),
  ],
  validate,
  controller.list
);

router.get(
  '/:id',
  [param('id').isInt({ min: 1 })],
  validate,
  controller.detail
);

router.post(
  '/',
  requirePermission('projects', 'create'),
  [
    body('project_id').isInt({ min: 1 }).withMessage('Valid project_id is required.'),
    body('site_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('name').trim().notEmpty().withMessage('Task name is required.').isLength({ max: 180 }),
    body('description').optional({ nullable: true }).trim(),
    body('status').optional().isIn(['on-track', 'attention', 'delayed', 'completed']),
    body('progress').optional().isInt({ min: 0, max: 100 }),
    body('start_date').optional({ nullable: true }).isISO8601(),
    body('end_date').optional({ nullable: true }).isISO8601(),
    body('duration_days').optional().isInt({ min: 0 }),
    body('materials').optional().isArray(),
    body('tools').optional().isArray(),
    body('labour').optional().isArray(),
    body('misc').optional().isArray(),
  ],
  validate,
  controller.create
);

router.put(
  '/:id',
  requirePermission('projects', 'edit'),
  [
    param('id').isInt({ min: 1 }),
    body('name').optional().trim().notEmpty().isLength({ max: 180 }),
    body('description').optional({ nullable: true }).trim(),
    body('status').optional().isIn(['on-track', 'attention', 'delayed', 'completed']),
    body('progress').optional().isInt({ min: 0, max: 100 }),
    body('start_date').optional({ nullable: true }).isISO8601(),
    body('end_date').optional({ nullable: true }).isISO8601(),
    body('duration_days').optional().isInt({ min: 0 }),
    body('materials').optional().isArray(),
    body('tools').optional().isArray(),
    body('labour').optional().isArray(),
    body('misc').optional().isArray(),
  ],
  validate,
  controller.update
);

router.delete(
  '/:id',
  requirePermission('projects', 'delete'),
  [param('id').isInt({ min: 1 })],
  validate,
  controller.remove
);

router.post(
  '/:id/workers',
  [
    param('id').isInt({ min: 1 }),
    body('worker_name').trim().notEmpty().withMessage('Worker name is required.'),
    body('labour_type').trim().notEmpty().withMessage('Labour trade is required.'),
    body('work_date').optional().isISO8601(),
    body('hours_worked').optional().isFloat({ min: 0.5, max: 24 }),
    body('daily_wage').optional().isFloat({ min: 0 }),
  ],
  validate,
  controller.logWorker
);

router.get(
  '/:id/labour-summary',
  [param('id').isInt({ min: 1 })],
  validate,
  controller.labourSummary
);

const subtaskQuery = query('subtaskId').optional().custom((v) => v === 'direct' || Number(v) > 0).withMessage('Invalid subtask.');

router.get(
  '/:id/planned-materials',
  [param('id').isInt({ min: 1 }), subtaskQuery],
  validate,
  controller.plannedMaterials
);

router.get(
  '/:id/planned-tools',
  [param('id').isInt({ min: 1 }), subtaskQuery],
  validate,
  controller.plannedTools
);

router.get(
  '/:id/budget-approvals',
  [param('id').isInt({ min: 1 })],
  validate,
  controller.budgetApprovals
);

router.post('/workers/quick-create', controller.createWorker);

router.get('/:id/assignments', [param('id').isInt({ min: 1 })], validate, controller.assignments);

router.post(
  '/:id/assignments',
  [
    param('id').isInt({ min: 1 }),
    body('worker_name').trim().notEmpty().withMessage('Worker name is required.'),
    body('worker_id').isInt({ min: 1 }).withMessage('Valid worker ID is required.'),
    body('worker_type').isIn(['daily_wage', 'company_labour', 'company_employee', 'labour']).withMessage('Valid worker type is required.'),
  ],
  validate,
  controller.assignWorker
);

router.delete(
  '/:id/assignments/:assignmentId',
  [
    param('id').isInt({ min: 1 }),
    param('assignmentId').isInt({ min: 1 }),
  ],
  validate,
  controller.unassignWorker
);

// ---- Subtasks: Main Task -> Subtask, each with its own plan & budget
const subtaskBodyRules = (isCreate) => [
  (isCreate ? body('name').trim().notEmpty().withMessage('Subtask name is required.') : body('name').optional().trim().notEmpty())
    .isLength({ max: 180 }),
  body('description').optional({ nullable: true }).trim(),
  body('status').optional().isIn(['on-track', 'attention', 'delayed', 'completed']),
  body('progress').optional().isInt({ min: 0, max: 100 }),
  body('start_date').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('end_date').optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body('duration_days').optional({ nullable: true }).isInt({ min: 0 }),
  body('materials').optional().isArray(),
  body('tools').optional().isArray(),
  body('labour').optional().isArray(),
  body('misc').optional().isArray(),
];

router.get('/:id/subtasks', [param('id').isInt({ min: 1 })], validate, controller.listSubtasks);

router.post(
  '/:id/subtasks',
  requirePermission('projects', 'create'),
  [param('id').isInt({ min: 1 }), ...subtaskBodyRules(true)],
  validate,
  controller.createSubtask
);

// Contractors may update progress / status only (enforced in the service);
// every other role needs the same 'projects:edit' permission as main tasks.
const canEditSubtask = (req, res, next) =>
  (req.user?.role === 'contractor' ? next() : requirePermission('projects', 'edit')(req, res, next));

router.put(
  '/:id/subtasks/:subtaskId',
  canEditSubtask,
  [param('id').isInt({ min: 1 }), param('subtaskId').isInt({ min: 1 }), ...subtaskBodyRules(false)],
  validate,
  controller.updateSubtask
);

router.delete(
  '/:id/subtasks/:subtaskId',
  requirePermission('projects', 'delete'),
  [param('id').isInt({ min: 1 }), param('subtaskId').isInt({ min: 1 })],
  validate,
  controller.removeSubtask
);

module.exports = router;
