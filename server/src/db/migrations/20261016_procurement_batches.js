'use strict';

/**
 * Migration 20261016 — multi-item procurement.
 *
 *   procurement_batches            one multi-item request (PB-0001): who raised it, which flow
 *   procurement_requests.batch_id  each item is still an ordinary request, linked to its batch
 *
 * Every item keeps its own approval, order, movement, receipt and finance rows, so a
 * batch can never double-count a cost or a stock posting. Idempotent and purely additive.
 */
async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}
async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [table, index]
  );
  return rows.length > 0;
}

async function up(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS procurement_batches (
      id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
      batch_number   VARCHAR(30)  NOT NULL,
      flow           VARCHAR(40)  NULL,
      requested_by   INT UNSIGNED NULL,
      requester_role VARCHAR(40)  NULL,
      notes          TEXT         NULL,
      created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_procurement_batches_number (batch_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  if (!(await columnExists(conn, 'procurement_requests', 'batch_id'))) {
    await conn.query('ALTER TABLE `procurement_requests` ADD COLUMN `batch_id` INT UNSIGNED NULL');
  }
  if (!(await indexExists(conn, 'procurement_requests', 'idx_pr_batch'))) {
    await conn.query('ALTER TABLE `procurement_requests` ADD INDEX `idx_pr_batch` (`batch_id`)');
  }
}

module.exports = { up };
