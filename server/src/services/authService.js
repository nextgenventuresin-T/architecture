'use strict';

const bcrypt = require('bcryptjs');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const userModel = require('../models/userModel');
const userAccessModel = require('../models/userAccessModel');
const refreshTokenModel = require('../models/refreshTokenModel');
const themeSettingsService = require('./themeSettingsService');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../utils/tokens');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

/**
 * A bcrypt digest of a throwaway string. Comparing against it when no user is
 * found keeps the response time of "unknown email" and "wrong password" alike,
 * so the endpoint does not leak which emails are registered.
 */
const DUMMY_HASH = bcrypt.hashSync('architecture-erp-timing-guard', 10);

function issueSession({ user, remembered, userAgent, ipAddress }) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, remembered);
  const decoded = verifyRefreshToken(refreshToken);

  return refreshTokenModel
    .store({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(decoded.exp * 1000),
      userAgent,
      ipAddress,
    })
    .then(() => ({ accessToken, refreshToken }));
}

async function login({ identifier, password, remembered = false, userAgent, ipAddress }) {
  const normalised = String(identifier).trim().toLowerCase();
  const user = await userModel.findByIdentifier(normalised);

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.invalidCredentials();
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.max(
      1,
      Math.ceil((new Date(user.locked_until) - new Date()) / 60000)
    );
    throw ApiError.locked(
      `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`
    );
  }

  if (!user.is_active) {
    throw ApiError.forbidden('This account is inactive. Contact your administrator.');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    const attempts = user.failed_login_count + 1;
    const lockedUntil =
      attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60000)
        : null;
    await userModel.registerFailedAttempt(user.id, lockedUntil);
    throw ApiError.invalidCredentials();
  }

  await userModel.clearFailedAttempts(user.id);
  const permissions = await userAccessModel.findPermissionsForUser(user.id);
  const [tokens, theme] = await Promise.all([
    issueSession({ user, remembered, userAgent, ipAddress }),
    themeSettingsService.getActiveTheme(user.client_id || user.company_id || null),
  ]);

  const publicUser = userModel.toPublicUser(user, permissions);
  publicUser.theme = theme;
  return { user: publicUser, ...tokens };
}

/** Exchanges a valid refresh token for a new pair, rotating the old one out. */
async function refreshSession({ refreshToken, userAgent, ipAddress }) {
  if (!refreshToken) throw ApiError.unauthorized();

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized();
  }

  const tokenHash = hashToken(refreshToken);
  const stored = await refreshTokenModel.findActive(tokenHash);
  if (!stored) {
    // Token is signed but not on record: treat as replay and drop all sessions.
    await refreshTokenModel.revokeAllForUser(payload.sub);
    throw ApiError.unauthorized();
  }

  const user = await userModel.findById(payload.sub);
  if (!user || !user.is_active) throw ApiError.unauthorized();

  const [permissions, theme] = await Promise.all([
    userAccessModel.findPermissionsForUser(user.id),
    themeSettingsService.getActiveTheme(user.client_id || user.company_id || null),
  ]);

  await refreshTokenModel.revoke(tokenHash);
  const tokens = await issueSession({ user, remembered: false, userAgent, ipAddress });

  const publicUser = userModel.toPublicUser(user, permissions);
  publicUser.theme = theme;
  return { user: publicUser, ...tokens };
}

async function logout(refreshToken) {
  if (refreshToken) {
    await refreshTokenModel.revoke(hashToken(refreshToken));
  }
}

async function getProfile(userId) {
  const user = await userModel.findById(userId);
  if (!user) throw ApiError.unauthorized();
  const [permissions, theme] = await Promise.all([
    userAccessModel.findPermissionsForUser(user.id),
    themeSettingsService.getActiveTheme(user.client_id || user.company_id || null),
  ]);
  const publicUser = userModel.toPublicUser(user, permissions);
  publicUser.theme = theme;
  return publicUser;
}

module.exports = { login, refreshSession, logout, getProfile, MAX_FAILED_ATTEMPTS };
