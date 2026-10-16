'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/authorize');
const { ROLES } = require('../config/roles');
const { MAX_ROWS } = require('../services/importService');
const controller = require('../controllers/importController');

const router = express.Router();
router.use(requireAuth);

// Importing needs the same right as adding one record by hand.
const GUARDS = {
  vendors: requireRole(ROLES.ADMIN, ROLES.PROCUREMENT),
  materials: requirePermission('materials', 'create'),
  tools: requirePermission('materials', 'create'),
  machines: requireRole(ROLES.ADMIN),
};

const entityParam = param('entity').isIn(Object.keys(GUARDS)).withMessage('Unknown import type.');
const guard = (req, res, next) => GUARDS[req.params.entity](req, res, next);

router.get('/:entity/fields', [entityParam], validate, guard, controller.fields);

router.post(
  '/:entity',
  [
    entityParam,
    body('rows').isArray({ min: 1, max: MAX_ROWS }).withMessage(`Send between 1 and ${MAX_ROWS} rows.`),
    body('onDuplicate').optional().isIn(['skip', 'update']),
    body('dryRun').optional().isBoolean(),
    body('firstRowNumber').optional().isInt({ min: 1 }),
  ],
  validate,
  guard,
  controller.run
);

module.exports = router;
