'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
// Interface 10 — blocks reaching a site by editing the id in the URL.
const { requireSiteAccess } = require('../middleware/authorize');
const controller = require('../controllers/siteController');

const router = express.Router();
router.use(requireAuth);

router.get('/:id', [param('id').isInt({ min: 1 })], validate, requireSiteAccess('id'), controller.detail);

router.patch(
  '/:id',
  [
    param('id').isInt({ min: 1 }),
    body('name').optional().trim().notEmpty().withMessage('Enter a site name.'),
    body('address').optional().trim().notEmpty().withMessage('Enter the site address.'),
    body('progress').optional().isInt({ min: 0, max: 100 }).withMessage('Progress must be between 0 and 100.').toInt(),
    body('labour_count').optional().isInt({ min: 0 }).toInt(),
    body('safety_status').optional().isIn(['safe', 'caution', 'incident']).withMessage('Choose a valid safety status.'),
    body('status').optional().isIn(['on-track', 'attention', 'delayed', 'on-hold', 'completed']),
  ],
  validate,
  controller.update
);

router.delete('/:id', [param('id').isInt({ min: 1 })], validate, controller.remove);

router.post(
  '/:id/activities',
  [
    param('id').isInt({ min: 1 }),
    body('activity_date').isISO8601().withMessage('Enter a valid date.'),
    body('work_completed').trim().notEmpty().withMessage('Describe the work completed.').isLength({ max: 4000 }),
    body('labour_present').optional().isInt({ min: 0 }).withMessage('Labour count cannot be negative.').toInt(),
    body('expenses').optional().isFloat({ min: 0 }).withMessage('Expenses cannot be negative.').toFloat(),
    body('contractor_activity').optional({ nullable: true }).trim(),
    body('equipment_used').optional({ nullable: true }).trim(),
    body('issues').optional({ nullable: true }).trim(),
    body('notes').optional({ nullable: true }).trim(),
    body('document_name').optional({ nullable: true }).trim(),
  ],
  validate,
  controller.logActivity
);

module.exports = router;
