'use strict';

const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/tokens');
const { isValidRole } = require('../config/roles');

/** Requires a valid access token and attaches `req.user`. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Sign in to continue.'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch {
    return next(ApiError.unauthorized());
  }
}

/**
 * Restricts a route to specific roles. Used once role dashboards and module
 * endpoints exist, e.g. router.get('/finance/invoices', requireAuth, requireRole('finance', 'admin'), ...)
 */
function requireRole(...allowed) {
  const roles = allowed.filter(isValidRole);
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    return next();
  };
}

module.exports = { requireAuth, requireRole };
