'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const asyncHandler = require('../utils/asyncHandler');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { attachHrScope } = require('../middleware/hrScope');
const { ROLES } = require('../config/roles');
const svc = require('../services/siteReceivingService');

/**
 * Material receiving for Site Engineers (employee logins) and Project Managers.
 * Which sites each may receive at is resolved server-side (siteReceiverScope);
 * the receive itself runs through the shared, row-locked receive code.
 */
const router = express.Router();
router.use(requireAuth, requireRole(ROLES.PROJECT_MANAGER, ROLES.SITE_ENGINEER, ROLES.EMPLOYEE), attachHrScope);

const ok = (res, data) => res.json({ success: true, data });

const receiveRules = [
  param('id').isInt({ min: 1 }).toInt(),
  // The receiver must type the arriving vehicle number - it is verified against the dispatch.
  // Shipments are received by vehicle number; vendor orders by their Bilty / AWB number.
  body('vehicle_number').optional({ nullable: true }).trim().isLength({ max: 40 }),
  body('bilty_number').optional({ nullable: true }).trim().isLength({ max: 60 }),
  body().custom((b) => {
    if (!String(b.vehicle_number || '').trim() && !String(b.bilty_number || '').trim()) {
      throw new Error('Enter the Bilty / AWB number (vendor deliveries) or the vehicle number.');
    }
    return true;
  }),
  body('receiving_date').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Enter a valid date.'),
  body('notes').optional({ nullable: true }).trim().isLength({ max: 1000 }),
];

router.get('/incoming', asyncHandler(async (req, res) => ok(res, await svc.listIncoming(req.hrScope))));

router.post(
  '/movements/:id/receive',
  [...receiveRules, body('received_quantity').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('Enter a quantity greater than zero.').toFloat()],
  validate,
  asyncHandler(async (req, res) => ok(res, await svc.receiveShipment(req.params.id, req.body, req.hrScope, req.user.id)))
);

router.post(
  '/orders/:id/receive',
  [...receiveRules, body('received_quantity').isFloat({ gt: 0 }).withMessage('Enter a quantity greater than zero.').toFloat()],
  validate,
  asyncHandler(async (req, res) => ok(res, await svc.receiveVendorOrder(req.params.id, req.body, req.hrScope, req.user.id)))
);

module.exports = router;
