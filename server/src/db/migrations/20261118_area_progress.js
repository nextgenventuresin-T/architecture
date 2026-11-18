'use strict';

/**
 * Migration 20261118 — progress worked out from area covered.
 *
 *   project_tasks.area_value / area_unit    total area of a main task (subtasks already had it)
 *   daily_work_updates.area_done            area covered in that day's work, in the task's /
 *                                           subtask's own unit
 *
 * Progress % = area covered so far / total area (see dailyWorkService). Purely additive.
 */
async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

async function up(conn) {
  if (!(await columnExists(conn, 'project_tasks', 'area_value'))) {
    await conn.query('ALTER TABLE `project_tasks` ADD COLUMN `area_value` DECIMAL(14,2) NULL');
  }
  if (!(await columnExists(conn, 'project_tasks', 'area_unit'))) {
    await conn.query('ALTER TABLE `project_tasks` ADD COLUMN `area_unit` VARCHAR(10) NULL');
  }
  if (!(await columnExists(conn, 'daily_work_updates', 'area_done'))) {
    await conn.query('ALTER TABLE `daily_work_updates` ADD COLUMN `area_done` DECIMAL(14,2) NULL');
  }
}

module.exports = { up };
