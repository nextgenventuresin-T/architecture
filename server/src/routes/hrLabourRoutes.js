'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const { attachHrScope } = require('../middleware/hrScope');
const { ROLES } = require('../config/roles');
const controller = require('../controllers/hrLabourController');

const router = express.Router();

// Everything below needs a signed-in user, and every handler needs to know
// whether the caller is scoped to their own contractor/employee record.
router.use(requireAuth);
router.use(attachHrScope);
router.use(requirePermission('hr', 'view'));

const canCreate = requirePermission('hr', 'create');
const canEdit = requirePermission('hr', 'edit');
// hr:approve is only granted to ADMIN/HR by default (see schema_hr_labour.sql)
// — requireRole is a second, explicit gate on top of that permission check,
// the same belt-and-braces pattern financeRoutes/procurementRoutes use for
// their own approve/manage endpoints.
const canApprove = requireRole(ROLES.ADMIN, ROLES.HR);
// Posting labour to a project/site (as opposed to a contractor merely
// requesting it) is an Admin/HR call.
const canManageAssignments = requireRole(ROLES.ADMIN, ROLES.HR);

// The blanket `hr:view/create/edit` permission (see schema_hr_labour.sql) is
// deliberately coarse — one module for the whole interface, matching how
// every other module in this ERP is permissioned. It is not, by itself,
// enough to keep CONTRACTOR out of company-employee leave, or EMPLOYEE out
// of contractor-worker/labour-request management: those need an explicit
// role allow-list per resource group, layered on top of the permission
// check the router already applies.
const labourWorkforceAccess = requireRole(ROLES.ADMIN, ROLES.HR, ROLES.CONTRACTOR);
const leaveAccess = requireRole(ROLES.ADMIN, ROLES.HR, ROLES.EMPLOYEE);
// Attendance is the one resource every role touches: HR/Admin record
// company labour, contractors record their own workers, and an employee
// may view (never mark) their own history — enforced in attendanceService.
const attendanceAccess = requireRole(ROLES.ADMIN, ROLES.HR, ROLES.CONTRACTOR, ROLES.EMPLOYEE);

const idParam = (name = 'id') => param(name).isInt({ min: 1 }).withMessage('Invalid id.');

const paginationRules = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('search').optional().trim(),
  query('contractorId').optional().isInt({ min: 1 }).toInt(),
  query('projectId').optional().isInt({ min: 1 }).toInt(),
  query('siteId').optional().isInt({ min: 1 }).toInt(),
];

// ------------------------------------------------------------- dashboard

router.get('/dashboard', controller.dashboardSummary);
router.get('/dashboard/sites/:siteId/workforce', [idParam('siteId')], validate, controller.siteWorkforce);

// ------------------------------------------------------- contractor workers

const SKILL_MAX = 80;
const workerRules = (isCreate) => {
  const required = (chain) => (isCreate ? chain : chain.optional());
  return [
    body('contractorId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a contractor.').toInt(),
    required(body('fullName').trim().notEmpty().withMessage('Enter the worker\'s name.').isLength({ max: 150 })),
    body('phone').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 30 }),
    body('skillCategory').optional({ checkFalsy: true }).trim().isLength({ max: SKILL_MAX }),
    body('dailyRate').optional().isFloat({ min: 0 }).toFloat(),
    body('status').optional().isIn(['active', 'inactive']).withMessage('Choose a valid status.'),
    body('joiningDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Enter a valid joining date.'),
    body('workerCode').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 30 }),
    body('aadhaarNumber').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 30 }),
    body('aadhaar_number').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 30 }),
    body('isCompanyLabour').optional().isBoolean().toBoolean(),
    body('is_company_labour').optional().isBoolean().toBoolean(),
    body('workerType').optional().trim(),
    body('notes').optional({ nullable: true }).trim(),
  ];
};

router.use('/contractor-workers', labourWorkforceAccess);
router.get('/contractor-workers', paginationRules, validate, controller.listWorkers);
router.get('/contractor-workers/skill-categories', controller.workerSkillCategories);
router.get('/contractor-workers/:id/history', [idParam()], validate, (req, res, next) => {
  req.params.workerType = 'labour';
  return controller.getWorkerHistory(req, res, next);
});
router.get('/contractor-workers/:id', [idParam()], validate, controller.getWorker);
router.post('/contractor-workers', canCreate, workerRules(true), validate, controller.createWorker);
router.patch('/contractor-workers/:id', canEdit, [idParam(), ...workerRules(false)], validate, controller.updateWorker);
router.delete('/contractor-workers/:id', canEdit, [idParam()], validate, controller.deleteWorker);

// ------------------------------------------------------- labour directory & lookup
router.get(
  '/labour-directory',
  [
    ...paginationRules,
    query('workerType').optional().trim(),
    query('todayStatus').optional().trim(),
    query('taskId').optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.listLabourDirectory
);
router.get('/labour-directory/lookup', controller.workforceLookup);
router.get(
  '/labour-directory/diary',
  [
    ...paginationRules,
    query('viewBy').optional().trim(),
    query('workerId').optional().trim(),
    query('workerType').optional().trim(),
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
    query('taskId').optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  controller.diary
);
router.get('/labour-directory/:workerType/:id/history', [idParam()], validate, controller.getWorkerHistory);
router.patch('/labour-directory/:id', canEdit, [idParam(), ...workerRules(false)], validate, controller.updateWorker);
router.delete('/labour-directory/:id', canEdit, [idParam()], validate, controller.deleteWorker);

// ------------------------------------------------------------ assignments

const assignmentRules = (isCreate) => {
  const required = (chain) => (isCreate ? chain : chain.optional());
  return [
    required(body('labourType').isIn(['company', 'contractor']).withMessage('Choose company or contractor.')),
    required(body('projectId').isInt({ min: 1 }).withMessage('Select a project.')).toInt(),
    body('siteId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Select a valid site.').toInt(),
    body('employeeId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('contractorWorkerId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    required(body('startDate').isISO8601().withMessage('Enter a valid start date.')),
    body('endDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Enter a valid end date.'),
    body('status').optional().isIn(['active', 'completed', 'cancelled']).withMessage('Choose a valid status.'),
    body('notes').optional({ nullable: true }).trim(),
  ];
};

router.use('/assignments', labourWorkforceAccess);
router.get('/assignments', paginationRules, validate, controller.listAssignments);
router.get('/assignments/:id', [idParam()], validate, controller.getAssignment);
router.post('/assignments', canManageAssignments, assignmentRules(true), validate, controller.createAssignment);
router.patch('/assignments/:id', canManageAssignments, [idParam(), ...assignmentRules(false)], validate, controller.updateAssignment);
router.post(
  '/assignments/:id/end',
  canManageAssignments,
  [idParam(), body('endDate').optional({ nullable: true, checkFalsy: true }).isISO8601()],
  validate,
  controller.endAssignment
);

// -------------------------------------------------------- labour requests

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const requestRules = (isCreate) => {
  const required = (chain) => (isCreate ? chain : chain.optional());
  return [
    body('contractorId').optional().isInt({ min: 1 }).toInt(),
    required(body('projectId').isInt({ min: 1 }).withMessage('Select a project.')).toInt(),
    required(body('siteId').isInt({ min: 1 }).withMessage('Select a site.')).toInt(),
    required(body('skillCategory').trim().notEmpty().withMessage('Enter the skill/category needed.').isLength({ max: SKILL_MAX })),
    required(body('quantity').isInt({ min: 1 }).withMessage('Enter a quantity of at least 1.')).toInt(),
    required(body('requiredDate').isISO8601().withMessage('Enter a valid required date.')),
    body('durationDays').optional().isInt({ min: 1 }).withMessage('Enter a valid duration in days.').toInt(),
    body('priority').optional().isIn(PRIORITIES).withMessage('Choose a valid priority.'),
    body('reason').optional({ nullable: true }).trim(),
    body('submit').optional().isBoolean().toBoolean(),
  ];
};

router.use('/labour-requests', labourWorkforceAccess);
router.get('/labour-requests', [...paginationRules, query('status').optional().trim(), query('priority').optional().trim()], validate, controller.listRequests);
router.get('/labour-requests/:id', [idParam()], validate, controller.getRequest);
router.post('/labour-requests', canCreate, requestRules(true), validate, controller.createRequest);
router.patch('/labour-requests/:id', canEdit, [idParam(), ...requestRules(false)], validate, controller.updateRequest);
router.post('/labour-requests/:id/submit', canEdit, [idParam()], validate, controller.submitRequest);
router.post('/labour-requests/:id/review', canApprove, [idParam()], validate, controller.reviewRequest);
router.post(
  '/labour-requests/:id/approve',
  canApprove,
  [idParam(), body('decisionNote').optional({ nullable: true }).trim().isLength({ max: 255 })],
  validate,
  controller.approveRequest
);
router.post(
  '/labour-requests/:id/reject',
  canApprove,
  [idParam(), body('decisionNote').trim().notEmpty().withMessage('Explain why this request is being rejected.').isLength({ max: 255 })],
  validate,
  controller.rejectRequest
);
router.post('/labour-requests/:id/cancel', canEdit, [idParam()], validate, controller.cancelRequest);
router.post('/labour-requests/:id/complete', canApprove, [idParam()], validate, controller.completeRequest);
router.post(
  '/labour-requests/:id/assign',
  canApprove,
  [
    idParam(),
    body('labourType').optional().isIn(['company', 'contractor']).withMessage('Choose company or contractor.'),
    body('employeeId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('contractorWorkerId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('startDate').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body('endDate').optional({ nullable: true, checkFalsy: true }).isISO8601(),
    body('notes').optional({ nullable: true }).trim(),
  ],
  validate,
  controller.assignRequestWorker
);

// ------------------------------------------------------------- attendance

const STATUSES_ATTENDANCE = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'];
const attendanceMarkRules = [
  body('labourType').isIn(['company', 'contractor']).withMessage('Choose company or contractor.'),
  body('employeeId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body('contractorWorkerId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body('projectId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body('siteId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body('date').optional({ checkFalsy: true }).isISO8601().withMessage('Enter a valid date.'),
  body('status').optional().isIn(STATUSES_ATTENDANCE).withMessage('Choose a valid attendance status.'),
  body('checkIn').optional({ nullable: true, checkFalsy: true }).matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('Enter a valid check-in time.'),
  body('checkOut').optional({ nullable: true, checkFalsy: true }).matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage('Enter a valid check-out time.'),
  body('remarks').optional({ nullable: true }).trim().isLength({ max: 255 }),
];

router.use('/attendance', attendanceAccess);
router.get(
  '/attendance',
  [
    ...paginationRules,
    query('date').optional().isISO8601(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
    query('status').optional().trim(),
    query('labourType').optional().trim(),
    query('contractorId').optional().isInt({ min: 1 }).toInt(),
    query('projectId').optional().isInt({ min: 1 }).toInt(),
    query('siteId').optional().isInt({ min: 1 }).toInt(),
    query('search').optional().trim(),
  ],
  validate,
  controller.listAttendance
);
router.get('/attendance/:id', [idParam()], validate, controller.getAttendance);
router.post('/attendance', canCreate, attendanceMarkRules, validate, controller.markAttendance);
router.patch(
  '/attendance/:id',
  canEdit,
  [idParam(), body('status').optional().isIn(STATUSES_ATTENDANCE), body('checkIn').optional({ nullable: true, checkFalsy: true }), body('checkOut').optional({ nullable: true, checkFalsy: true }), body('remarks').optional({ nullable: true }).trim().isLength({ max: 255 })],
  validate,
  controller.updateAttendance
);

// ------------------------------------------------------------------ leave

const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid', 'other'];
const leaveRules = (isCreate) => {
  const required = (chain) => (isCreate ? chain : chain.optional());
  return [
    body('employeeId').optional().isInt({ min: 1 }).toInt(),
    body('leaveType').optional().isIn(LEAVE_TYPES).withMessage('Choose a valid leave type.'),
    required(body('startDate').isISO8601().withMessage('Enter a valid start date.')),
    required(body('endDate').isISO8601().withMessage('Enter a valid end date.')),
    body('reason').optional({ nullable: true }).trim(),
  ];
};

router.use('/leave', leaveAccess);
router.get('/leave', [...paginationRules, query('employeeId').optional().isInt({ min: 1 }).toInt(), query('status').optional().trim()], validate, controller.listLeave);
router.get('/leave/:id', [idParam()], validate, controller.getLeave);
router.post('/leave', canCreate, leaveRules(true), validate, controller.createLeave);
router.patch('/leave/:id', canEdit, [idParam(), ...leaveRules(false)], validate, controller.updateLeave);
router.post(
  '/leave/:id/approve',
  canApprove,
  [idParam(), body('decisionNote').optional({ nullable: true }).trim().isLength({ max: 255 })],
  validate,
  controller.approveLeave
);
router.post(
  '/leave/:id/reject',
  canApprove,
  [idParam(), body('decisionNote').trim().notEmpty().withMessage('Explain why this leave is being rejected.').isLength({ max: 255 })],
  validate,
  controller.rejectLeave
);
router.post('/leave/:id/cancel', canEdit, [idParam()], validate, controller.cancelLeave);

module.exports = router;
