'use strict';

const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * The last few failed WRITE requests (method, path, status, error code and message -
 * no request body, no user data), shown by /api/health so a save failure on the host
 * can be diagnosed without a shell.
 */
const recentErrors = [];
function remember(req, statusCode, error) {
  if (req.method === 'GET') return;
  recentErrors.unshift({
    at: new Date().toISOString(),
    route: `${req.method} ${String(req.originalUrl || '').split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id')}`,
    status: statusCode,
    code: error.code || null,
    message: String(error.sqlMessage || error.message || '').slice(0, 220),
  });
  recentErrors.length = Math.min(recentErrors.length, 15);
}

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist.`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  const isKnown = error instanceof ApiError;
  const statusCode = isKnown ? error.statusCode : 500;

  if (!isKnown) {
    console.error('Unhandled error:', error);
  }
  try { remember(req, statusCode, error); } catch (e) { /* never break the response */ }

  res.status(statusCode).json({
    success: false,
    error: {
      code: isKnown ? error.code : 'INTERNAL_ERROR',
      message: isKnown ? error.message : 'Something went wrong on our side. Try again.',
      ...(isKnown && error.details ? { details: error.details } : {}),
      ...(!env.isProduction && !isKnown ? { stack: error.stack } : {}),
    },
  });
}

module.exports = { notFoundHandler, errorHandler, recentErrors };
