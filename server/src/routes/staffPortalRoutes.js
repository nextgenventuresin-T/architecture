'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { ROLES } = require('../config/roles');
const svc = require('../services/staffPortalService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

/**
 * "My Portal" - every signed-in user marks their OWN attendance and applies for leave.
 * The user is always taken from the session, never from the request.
 */
const myPortal = express.Router();
myPortal.use(requireAuth);
myPortal.get('/today', asyncHandler(async (req, res) => ok(res, await svc.getToday(req.user.id))));
myPortal.post('/check-in', [body('note').optional({ nullable: true }).trim().isLength({ max: 255 })], validate,
  asyncHandler(async (req, res) => ok(res, await svc.checkIn(req.user.id, req.body.note))));
myPortal.post('/check-out', [body('note').optional({ nullable: true }).trim().isLength({ max: 255 })], validate,
  asyncHandler(async (req, res) => ok(res, await svc.checkOut(req.user.id, req.body.note))));
myPortal.get('/attendance', [query('month').optional().matches(/^\d{4}-\d{2}$/)], validate,
  asyncHandler(async (req, res) => ok(res, await svc.monthFor(req.user.id, req.query.month))));
myPortal.get('/leaves', asyncHandler(async (req, res) => ok(res, await svc.myLeaves(req.user.id))));
myPortal.post(
  '/leaves',
  [
    body('leave_type').trim().notEmpty().withMessage('Choose a leave type.'),
    body('start_date').isISO8601().withMessage('Enter the first day of leave.'),
    body('end_date').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Enter the last day of leave.'),
    body('half_day').optional().isBoolean().toBoolean(),
    body('reason').trim().notEmpty().withMessage('Give a reason for the leave.').isLength({ max: 2000 }),
  ],
  validate,
  asyncHandler(async (req, res) => ok(res, await svc.applyLeave(req.user.id, req.body), 201))
);
myPortal.post('/leaves/:id/cancel', [param('id').isInt({ min: 1 })], validate,
  asyncHandler(async (req, res) => ok(res, await svc.cancelLeave(req.user.id, Number(req.params.id)))));

/** Admin and HR: everyone's attendance board, leave decisions, corrections, month report. */
const staff = express.Router();
staff.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.HR));
staff.get('/board', [query('date').optional().isISO8601()], validate,
  asyncHandler(async (req, res) => ok(res, await svc.board(req.query.date))));
staff.get('/report', [query('month').optional().matches(/^\d{4}-\d{2}$/)], validate,
  asyncHandler(async (req, res) => ok(res, await svc.monthReport(req.query.month))));
staff.get('/users/:userId/month', [param('userId').isInt({ min: 1 }), query('month').optional().matches(/^\d{4}-\d{2}$/)], validate,
  asyncHandler(async (req, res) => ok(res, await svc.monthFor(Number(req.params.userId), req.query.month))));
staff.put(
  '/users/:userId/days/:date',
  [
    param('userId').isInt({ min: 1 }),
    param('date').isISO8601(),
    body('check_in').optional({ nullable: true, checkFalsy: true }).matches(/^\d{2}:\d{2}$/).withMessage('Enter a time like 09:30.'),
    body('check_out').optional({ nullable: true, checkFalsy: true }).matches(/^\d{2}:\d{2}$/).withMessage('Enter a time like 18:00.'),
    body('status').optional().isIn(['present', 'absent']),
    body('note').trim().notEmpty().withMessage('Say why the times are being corrected.').isLength({ max: 255 }),
  ],
  validate,
  asyncHandler(async (req, res) => ok(res, await svc.correctAttendance(Number(req.params.userId), req.params.date, req.body, req.user)))
);
staff.get('/leaves', [query('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled', 'all'])], validate,
  asyncHandler(async (req, res) => ok(res, await svc.allLeaves(req.query.status || 'all'))));
staff.post(
  '/leaves/:id/:decision',
  [param('id').isInt({ min: 1 }), param('decision').isIn(['approve', 'reject']), body('note').optional({ nullable: true }).trim().isLength({ max: 255 })],
  validate,
  asyncHandler(async (req, res) => ok(res, await svc.decideLeave(
    Number(req.params.id), req.params.decision === 'approve' ? 'approved' : 'rejected', req.body.note, req.user
  )))
);

module.exports = { myPortal, staff };
