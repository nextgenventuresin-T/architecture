'use strict';

/**
 * Error carrying an HTTP status and a stable machine-readable code, so the
 * client can branch on `code` instead of parsing message text.
 */
class ApiError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message, details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static invalidCredentials() {
    // Deliberately vague: never reveal whether the account exists.
    return new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  static unauthorized(message = 'Your session has expired. Sign in again.') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have access to this area.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static locked(message) {
    return new ApiError(423, 'ACCOUNT_LOCKED', message);
  }
  static notFound(message = 'Not found.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
}

module.exports = ApiError;
