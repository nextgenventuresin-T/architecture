'use strict';

const mysql = require('mysql2/promise');
const env = require('./env');

/**
 * Shared MySQL connection pool. Every query in the app goes through this
 * so connections are reused rather than opened per request.
 */
const poolConfig = {
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0,
  namedPlaceholders: true,
  dateStrings: false,
};
if (env.db.ssl) {
  poolConfig.ssl = env.db.ssl;
}
const pool = mysql.createPool(poolConfig);

async function verifyConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

module.exports = { pool, verifyConnection };
