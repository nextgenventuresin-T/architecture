'use strict';

/** Forwards rejected promises from async route handlers to the error middleware. */
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

module.exports = asyncHandler;
