'use strict';

const express = require('express');
const { param, body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { attachHrScope } = require('../middleware/hrScope');
const { ROLES } = require('../config/roles');
const poController = require('../controllers/contractorPoController');
const { uploadSignature } = require('../middleware/upload');

const router = express.Router();

// Only signed-in contractor users with a linked contractor profile
router.use(requireAuth);
router.use(requireRole(ROLES.CONTRACTOR));
router.use(attachHrScope);

/** GET /api/contractor-portal/contracts - List contractor's own POs */
router.get('/', (req, res, next) => {
  req.query.contractorId = req.hrScope.contractorId;
  next();
}, poController.list);

/** GET /api/contractor-portal/contracts/summary - Financial & milestone summary */
router.get('/summary', (req, res, next) => {
  req.params.contractorId = req.hrScope.contractorId;
  next();
}, poController.financialDashboard);

/** GET /api/contractor-portal/contracts/:id - PO detail (auto marks as viewed) */
router.get('/:id', [param('id').isInt({ min: 1 })], validate, poController.detail);

/** POST /api/contractor-portal/contracts/:id/accept - Accept PO */
router.post('/:id/accept', [param('id').isInt({ min: 1 })], validate, poController.acceptPo);

/** POST /api/contractor-portal/contracts/:id/reject - Reject PO with reason */
router.post(
  '/:id/reject',
  [
    param('id').isInt({ min: 1 }),
    body('reason').trim().notEmpty().withMessage('Please state the reason for rejecting the Purchase Order.'),
  ],
  validate,
  poController.rejectPo
);

/** POST /api/contractor-portal/contracts/:id/sign - Contractor signature */
router.post(
  '/:id/sign',
  uploadSignature,
  [param('id').isInt({ min: 1 })],
  validate,
  poController.signContractor
);

/** GET /api/contractor-portal/contracts/:id/download - Download PO or signed contract PDF */
router.get('/:id/download', [param('id').isInt({ min: 1 })], validate, poController.downloadPdf);

/** GET /api/contractor-portal/contracts/:id/timeline - PO lifecycle timeline */
router.get('/:id/timeline', [param('id').isInt({ min: 1 })], validate, poController.timeline);

module.exports = router;
