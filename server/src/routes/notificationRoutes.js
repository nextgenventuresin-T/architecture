'use strict';

const express = require('express');
const { param, query, body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const controller = require('../controllers/notificationController');

const router = express.Router();

router.use(requireAuth);

router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }),
    query('pageSize').optional().isInt({ min: 1, max: 100 }),
    query('isRead').optional(),
    query('category').optional().trim(),
    query('type').optional().trim(),
    query('search').optional().trim(),
  ],
  validate,
  controller.list
);

router.get('/unread-count', controller.unreadCount);

router.post('/mark-all-read', controller.markAllAsRead);

router.delete('/clear-read', controller.clearRead);

router.patch(
  '/:id/read',
  [param('id').isInt({ min: 1 })],
  validate,
  controller.markAsRead
);

router.delete(
  '/:id',
  [param('id').isInt({ min: 1 })],
  validate,
  controller.remove
);

router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required.').isLength({ max: 255 }),
    body('message').trim().notEmpty().withMessage('Message is required.'),
    body('type').optional().isIn(['info', 'warning', 'success', 'error', 'approval', 'task', 'material', 'expense', 'system']),
    body('category').optional().trim(),
    body('actionUrl').optional({ nullable: true }).trim(),
  ],
  validate,
  controller.create
);

module.exports = router;
