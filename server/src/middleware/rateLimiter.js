'use strict';

const rateLimit = require('express-rate-limit');

/** Caps login attempts per IP, on top of the per-account lockout. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many sign-in attempts from this device. Try again in 15 minutes.',
    },
  },
});

module.exports = { loginLimiter };
