'use strict';

const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { loginLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

const router = express.Router();

const loginRules = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Enter your email or username.')
    .isLength({ max: 191 })
    .withMessage('That entry is too long.'),
  body('password')
    .notEmpty()
    .withMessage('Enter your password.')
    .isLength({ max: 128 })
    .withMessage('That password is too long.'),
  body('remember').optional().isBoolean().withMessage('Invalid value.'),
];

router.post('/login', loginLimiter, loginRules, validate, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;
