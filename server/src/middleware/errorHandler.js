'use strict';

const env = require('../config/env');
const ApiError = require('../utils/ApiError');

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

module.exports = { notFoundHandler, errorHandler };
