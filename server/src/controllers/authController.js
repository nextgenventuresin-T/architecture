'use strict';

const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');

const REFRESH_COOKIE = 'aerp_refresh';

function refreshCookieOptions(remembered) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: (remembered ? 30 : 7) * 24 * 60 * 60 * 1000,
  };
}

const context = (req) => ({
  userAgent: req.get('user-agent'),
  ipAddress: req.ip,
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { identifier, password, remember } = req.body;

  const { user, accessToken, refreshToken } = await authService.login({
    identifier,
    password,
    remembered: Boolean(remember),
    ...context(req),
  });

  // The refresh token lives in an httpOnly cookie so client JavaScript
  // (and therefore any XSS) cannot read it. Only the short-lived access
  // token is handed to the browser.
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(Boolean(remember)));

  res.json({ success: true, data: { user, accessToken } });
});

/** POST /api/auth/refresh */
const refresh = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.refreshSession({
    refreshToken: req.cookies[REFRESH_COOKIE],
    ...context(req),
  });

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions(false));
  res.json({ success: true, data: { user, accessToken } });
});

/** POST /api/auth/logout */
const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({ success: true, data: { message: 'Signed out.' } });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.id);
  res.json({ success: true, data: { user } });
});

module.exports = { login, refresh, logout, me, REFRESH_COOKIE };
