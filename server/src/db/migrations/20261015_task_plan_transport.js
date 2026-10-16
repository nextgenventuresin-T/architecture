'use strict';

/**
 * Migration 20261015 — estimated transport on task planning lines.
 *
 *   task_materials.transport_cost   estimated material transport for the line
 *   task_tools.transport_cost       estimated machine transport (mobilisation / shifting)
 *   task_labour.transport_cost      estimated labour internal transfer for the line
 *
 * The line's total_cost INCLUDES its transport_cost, so every existing budget
 * rollup (which sums total_cost) picks it up with no double counting.
 *
 * Idempotent and purely additive.
 */
async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}
async function addColumn(conn, table, column, definition) {
  if (!(await columnExists(conn, table, column))) await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

async function up(conn) {
  for (const table of ['task_materials', 'task_tools', 'task_labour']) {
    await addColumn(conn, table, 'transport_cost', 'DECIMAL(14,2) NOT NULL DEFAULT 0');
  }
}

module.exports = { up };
