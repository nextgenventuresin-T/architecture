'use strict';

/**
 * Applies the small, additive column migrations at startup, so a deploy (e.g. to
 * Hostinger, where there is no shell to run `npm run db:migrate`) brings its own
 * database up to date. Each migration only ADDS missing columns and is idempotent:
 * on a database that already has them it does nothing. No data is copied or exported.
 */
const { pool } = require('../config/db');

const STARTUP_MIGRATIONS = [
  '20261115_area_measure_engineer_receiving',
  '20261115_litres_vendor_dispatch',
];

async function ensureSchema() {
  const conn = await pool.getConnection();
  try {
    for (const name of STARTUP_MIGRATIONS) {
      try {
        await require(`./migrations/${name}`).up(conn);
      } catch (error) {
        // Never block the app from starting; the log says what to fix.
        console.error(`Startup migration ${name} failed: ${error.message}`);
      }
    }
  } finally {
    conn.release();
  }
}

module.exports = { ensureSchema };
