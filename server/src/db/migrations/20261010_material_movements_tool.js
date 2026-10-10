'use strict';

/**
 * Migration 20261010 — Add item_type and tool_id to material_movements,
 * and make material_id nullable for tool shipments.
 */

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function up(conn, log = console.log) {
  log('--- Migration 20261010: material_movements tool support ---');

  if (!(await columnExists(conn, 'material_movements', 'item_type'))) {
    await conn.query("ALTER TABLE material_movements ADD COLUMN item_type ENUM('material', 'tool') DEFAULT 'material' AFTER movement_number");
    log('  + material_movements.item_type');
  }

  if (!(await columnExists(conn, 'material_movements', 'tool_id'))) {
    await conn.query('ALTER TABLE material_movements ADD COLUMN tool_id INT UNSIGNED NULL AFTER material_id');
    log('  + material_movements.tool_id');
  }

  await conn.query('ALTER TABLE material_movements MODIFY COLUMN material_id INT UNSIGNED NULL');
  log('  ~ material_movements.material_id is now NULLABLE');
}

module.exports = { up };
