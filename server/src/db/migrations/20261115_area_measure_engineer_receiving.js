'use strict';

/**
 * Migration 20261115 — area measurement on projects and sites.
 *
 *   projects.area_value / area_unit   total project area and its unit (ft | m | sqft | sqm)
 *   sites.area_value    / area_unit   site area and its unit
 *   task_subtasks.area_value / area_unit   area of a subtask (e.g. a floor or wall) and its unit
 *
 * Purely additive and idempotent: existing rows keep NULL (no area recorded).
 */
async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

async function up(conn) {
  for (const table of ['projects', 'sites', 'task_subtasks']) {
    if (!(await columnExists(conn, table, 'area_value'))) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`area_value\` DECIMAL(14,2) NULL`);
    }
    if (!(await columnExists(conn, table, 'area_unit'))) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`area_unit\` VARCHAR(10) NULL`);
    }
  }
}

module.exports = { up };
