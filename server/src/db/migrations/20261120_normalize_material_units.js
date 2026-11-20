'use strict';

/**
 * Data tidy 20261120 — one spelling per unit (KGS/Kgs -> kg, PCS/NOS/Nos -> nos, ...).
 *
 * Rewrites the unit on materials and on the records that keep a copy of it, using
 * the map in utils/materialUnits. Labels only: quantities are not touched.
 * Idempotent: a value already in standard form is left alone (BINARY compare, so
 * a casing-only change like "Nos" -> "nos" is applied once and then never again).
 */
const { UNIT_ALIASES } = require('../../utils/materialUnits');

const TABLES = ['materials', 'procurement_requests', 'material_movements', 'warehouse_transactions', 'daily_work_updates'];

async function up(conn) {
  const pairs = Object.entries(UNIT_ALIASES);
  const caseSql = `CASE LOWER(TRIM(unit)) ${pairs.map(() => 'WHEN ? THEN ?').join(' ')} END`;
  const caseArgs = pairs.flat();
  const standard = [...new Set(Object.values(UNIT_ALIASES))];

  for (const table of TABLES) {
    const [[exists]] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'unit'`,
      [table]
    );
    if (!exists.n) continue;
    const [result] = await conn.query(
      `UPDATE \`${table}\` SET unit = ${caseSql}
       WHERE LOWER(TRIM(unit)) IN (?) AND BINARY unit NOT IN (?)`,
      [...caseArgs, Object.keys(UNIT_ALIASES), standard]
    );
    if (result.affectedRows) console.log(`Units tidied on ${result.affectedRows} ${table} row(s)`);
  }
}

module.exports = { up };
