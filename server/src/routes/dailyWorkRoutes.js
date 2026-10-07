'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { attachHrScope } = require('../middleware/hrScope');
const { uploadWorkPhotos } = require('../middleware/upload');
const controller = require('../controllers/dailyWorkController');

const router = express.Router();
router.use(requireAuth);
router.use(attachHrScope);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('projectId').optional().isInt({ min: 1 }).toInt(),
    query('siteId').optional().isInt({ min: 1 }).toInt(),
    query('taskId').optional().isInt({ min: 1 }).toInt(),
    query('date').optional().isISO8601(),
  ],
  validate,
  controller.list
);

router.get('/photos/:photoId', [param('photoId').isInt({ min: 1 })], validate, controller.getPhoto);

router.get('/:id', [param('id').isInt({ min: 1 })], validate, controller.detail);

router.post(
  '/',
  uploadWorkPhotos,
  [
    body('project_id').isInt({ min: 1 }).withMessage('Project is required.'),
    body('site_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('task_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('phase_number').optional({ nullable: true }).isInt({ min: 1, max: 8 }),
    body('subcategory').optional({ nullable: true }).trim(),
    body('work_done').optional({ nullable: true }).trim(),
    body('work_date').optional().isISO8601().withMessage('Enter a valid date.'),
    body('progress_percentage').optional().isInt({ min: 0, max: 100 }).toInt(),
    body('work_status').optional().isIn(['in-progress', 'completed']),
    body('remarks').optional({ nullable: true }).trim(),
    body('workers').optional(),
  ],
  validate,
  controller.create
);

module.exports = router;
