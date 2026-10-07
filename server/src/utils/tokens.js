'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ISSUER = 'architecture-erp';

function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, email: user.email, type: 'access' },
    env.auth.accessSecret,
    { expiresIn: env.auth.accessExpiresIn, issuer: ISSUER }
  );
}

function signRefreshToken(user, remembered = false) {
  return jwt.sign(
    // `jti` keeps every issued token unique. Without it, two tokens minted for
    // the same user in the same second are byte-identical and collide on the
    // unique hash column when a session is rotated.
    { sub: String(user.id), type: 'refresh', jti: crypto.randomUUID() },
    env.auth.refreshSecret,
    {
      expiresIn: remembered ? env.auth.refreshExpiresInRemembered : env.auth.refreshExpiresIn,
      issuer: ISSUER,
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.auth.accessSecret, { issuer: ISSUER });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.auth.refreshSecret, { issuer: ISSUER });
}

/** Refresh tokens are persisted as SHA-256 digests, never in readable form. */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
};
