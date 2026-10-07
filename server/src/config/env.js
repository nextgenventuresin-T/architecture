'use strict';

require('dotenv').config();

/**
 * Reads an environment variable, throwing when a required value is missing.
 * Failing at boot is safer than discovering a missing secret at login time.
 */
function read(name, { required = false, fallback = undefined } = {}) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (required) {
      throw new Error(
        `Missing required environment variable "${name}". Copy .env.example to .env and fill it in.`
      );
    }
    return fallback;
  }
  return value;
}

const env = {
  nodeEnv: read('NODE_ENV', { fallback: 'development' }),
  port: Number(read('PORT', { fallback: 5000 })),
  clientOrigin: read('CLIENT_ORIGIN', { fallback: 'http://localhost:5173' }),

  db: {
    host: read('DB_HOST', { fallback: 'localhost' }),
    port: Number(read('DB_PORT', { fallback: 3306 })),
    user: read('DB_USER', { required: true }),
    password: read('DB_PASSWORD', { fallback: '' }),
    database: read('DB_NAME', { fallback: 'architecture_erp' }),
    connectionLimit: Number(read('DB_CONNECTION_LIMIT', { fallback: 10 })),
    ssl: process.env.DB_SSL === 'true' || process.env.DB_SSL === '1' ? { minVersion: 'TLSv1.2', rejectUnauthorized: false } : undefined,
  },

  auth: {
    accessSecret: read('JWT_ACCESS_SECRET', { required: true }),
    refreshSecret: read('JWT_REFRESH_SECRET', { required: true }),
    accessExpiresIn: read('JWT_ACCESS_EXPIRES_IN', { fallback: '15m' }),
    refreshExpiresIn: read('JWT_REFRESH_EXPIRES_IN', { fallback: '7d' }),
    refreshExpiresInRemembered: read('JWT_REFRESH_EXPIRES_IN_REMEMBERED', { fallback: '30d' }),
    saltRounds: Number(read('BCRYPT_SALT_ROUNDS', { fallback: 12 })),
  },
};

env.isProduction = env.nodeEnv === 'production';

module.exports = env;
