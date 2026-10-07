'use strict';

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Turns express-validator output into `{ field: message }` so the login form
 * can drop each message under the field it belongs to.
 */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = {};
  for (const error of result.array()) {
    if (!details[error.path]) details[error.path] = error.msg;
  }

  return next(ApiError.badRequest('Check the highlighted fields.', details));
}

module.exports = validate;
