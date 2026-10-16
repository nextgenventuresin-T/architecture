'use strict';

/**
 * Migration 20261015 — area-wise labour and company-labour attendance.
 *
 *   task_worker_logs.area_id          which area / floor / room the worker worked in
 *   task_worker_logs.attendance_id    set on the ONE costed log a company-labour attendance creates
 *   daily_work_updates.area_id        area of a daily work update
 *   attendance_records.subtask_id / area_id / daily_wage / worker_log_id
 *                                     company-labour attendance is recorded against a task (and
 *                                     optionally subtask / area) with the day's wage; worker_log_id
 *                                     links the labour-cost log it produced, so it is counted once.
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
async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [table, index]
  );
  return rows.length > 0;
}
async function addColumn(conn, table, column, definition) {
  if (!(await columnExists(conn, table, column))) await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}
async function addIndex(conn, table, index, columns) {
  if (!(await indexExists(conn, table, index))) await conn.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${columns})`);
}

async function up(conn) {
  await addColumn(conn, 'task_worker_logs', 'area_id', 'INT UNSIGNED NULL');
  await addColumn(conn, 'task_worker_logs', 'attendance_id', 'INT UNSIGNED NULL');
  await addIndex(conn, 'task_worker_logs', 'idx_twl_area', '`area_id`');
  await addIndex(conn, 'task_worker_logs', 'idx_twl_worker_day', '`worker_id`, `work_date`');
  await addIndex(conn, 'task_worker_logs', 'idx_twl_attendance', '`attendance_id`');

  await addColumn(conn, 'daily_work_updates', 'area_id', 'INT UNSIGNED NULL');

  await addColumn(conn, 'attendance_records', 'subtask_id', 'INT UNSIGNED NULL');
  await addColumn(conn, 'attendance_records', 'area_id', 'INT UNSIGNED NULL');
  await addColumn(conn, 'attendance_records', 'daily_wage', 'DECIMAL(10,2) NULL');
  await addColumn(conn, 'attendance_records', 'worker_log_id', 'INT UNSIGNED NULL');
  await addIndex(conn, 'attendance_records', 'idx_att_task', '`task_id`');
}

module.exports = { up };
