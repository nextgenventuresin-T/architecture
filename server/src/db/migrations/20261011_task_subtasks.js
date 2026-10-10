'use strict';

/**
 * Migration 20261011 — Subtasks under every Main Task.
 *
 * Project -> Site -> Main Task (project_tasks) -> Subtask (task_subtasks).
 *
 * A subtask owns its own planning rows (materials / machines & tools / labour /
 * misc) and every transaction can be booked against it. The design keeps the
 * existing task_id on every row pointing at the MAIN task and only adds a
 * nullable subtask_id beside it, so:
 *   - all existing Main Task / Site / Project / Finance rollups (which group by
 *     task_id) keep working unchanged and automatically include subtask spend;
 *   - subtasks never live in project_tasks, so nothing is counted twice;
 *   - every pre-existing record keeps subtask_id = NULL ("direct" main-task
 *     record) and behaves exactly as before.
 *
 * Idempotent and purely additive: no column is dropped, renamed or rewritten.
 */

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index]
  );
  return rows.length > 0;
}

async function fkExists(conn, table, name) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY' LIMIT 1`,
    [table, name]
  );
  return rows.length > 0;
}

// Planning rows belong to the subtask: deleting a subtask removes its plan.
const PLANNING_TABLES = ['task_materials', 'task_tools', 'task_labour', 'task_misc'];

// Transactions are never lost: if a subtask goes, they fall back to the main task.
const TRANSACTION_TABLES = [
  'procurement_requests',
  'daily_work_updates',
  'daily_work_photos',
  'task_worker_logs',
  'expenses',
  'task_assigned_workers',
  'task_budget_approvals',
  'tool_allocations',
  'tool_rentals',
  'tool_unit_history',
];

async function up(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS task_subtasks (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id INT UNSIGNED NOT NULL,
      project_id INT UNSIGNED NOT NULL,
      site_id INT UNSIGNED NULL,
      name VARCHAR(180) NOT NULL,
      description TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'on-track',
      progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
      start_date DATE NULL,
      end_date DATE NULL,
      duration_days INT UNSIGNED NOT NULL DEFAULT 0,
      material_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      tool_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      labour_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      misc_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      total_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      approved_additional_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      pending_excess_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      sort_order INT UNSIGNED NOT NULL DEFAULT 0,
      created_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_subtask_task (task_id),
      KEY idx_subtask_project (project_id),
      KEY idx_subtask_site (site_id),
      CONSTRAINT fk_subtask_task FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const addColumn = async (table, onDelete) => {
    if (!(await tableExists(conn, table))) return;
    if (!(await columnExists(conn, table, 'subtask_id'))) {
      const after = (await columnExists(conn, table, 'task_id')) ? ' AFTER task_id' : '';
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN subtask_id INT UNSIGNED NULL${after}`);
    }
    const idx = `idx_${table}_subtask`.slice(0, 64);
    if (!(await indexExists(conn, table, idx))) {
      await conn.query(`ALTER TABLE \`${table}\` ADD INDEX \`${idx}\` (subtask_id)`);
    }
    const fk = `fk_${table}_subtask`.slice(0, 64);
    if (!(await fkExists(conn, table, fk))) {
      try {
        await conn.query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${fk}\` FOREIGN KEY (subtask_id) REFERENCES task_subtasks(id) ON DELETE ${onDelete}`
        );
      } catch (e) {
        // A legacy table on a different engine/charset can refuse the FK; the
        // application still validates subtask ownership, so this is not fatal.
        console.warn(`FK ${fk} not created: ${e.message}`);
      }
    }
  };

  for (const t of PLANNING_TABLES) await addColumn(t, 'CASCADE');
  for (const t of TRANSACTION_TABLES) await addColumn(t, 'SET NULL');
}

module.exports = { up, PLANNING_TABLES, TRANSACTION_TABLES };

if (require.main === module) {
  // Standalone: node src/db/migrations/20261011_task_subtasks.js
  const mysql = require('mysql2/promise');
  const env = require('../../config/env');
  (async () => {
    const cfg = { host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password, database: env.db.database };
    if (env.db.ssl) cfg.ssl = env.db.ssl;
    const conn = await mysql.createConnection(cfg);
    try {
      await up(conn);
      console.log('Subtask migration applied.');
    } finally {
      await conn.end();
    }
  })().catch((e) => {
    console.error('Subtask migration failed:', e.message);
    process.exit(1);
  });
}
