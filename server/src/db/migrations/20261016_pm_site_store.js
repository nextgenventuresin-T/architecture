'use strict';

/**
 * Migration 20261016 — sites handled directly by a Project Manager.
 *
 * A site (and its project) with no contractor is run by its Project Manager. Its
 * material and machines are held in the site's own "Site Store":
 *
 *   warehouses.site_id                 the site a 'site' type warehouse (Site Store) belongs to
 *   daily_work_updates.contractor_id   now NULL-able: a PM logs daily work on a PM-run site
 *
 * Idempotent and purely additive.
 */
async function columnInfo(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows[0] || null;
}
async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [table, index]
  );
  return rows.length > 0;
}

async function up(conn) {
  if (!(await columnInfo(conn, 'warehouses', 'site_id'))) {
    await conn.query('ALTER TABLE `warehouses` ADD COLUMN `site_id` INT UNSIGNED NULL AFTER `contractor_id`');
  }
  if (!(await indexExists(conn, 'warehouses', 'uq_warehouses_site'))) {
    await conn.query('ALTER TABLE `warehouses` ADD UNIQUE INDEX `uq_warehouses_site` (`site_id`)');
  }
  const dwu = await columnInfo(conn, 'daily_work_updates', 'contractor_id');
  if (dwu && dwu.IS_NULLABLE === 'NO') {
    await conn.query('ALTER TABLE `daily_work_updates` MODIFY COLUMN `contractor_id` INT UNSIGNED NULL');
  }
}

module.exports = { up };
