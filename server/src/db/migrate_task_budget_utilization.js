'use strict';

const { pool } = require('../config/db');

async function migrate() {
  console.log('Running task budget utilization migration...');
  const connection = await pool.getConnection();
  try {
    const [cols1] = await connection.query("SHOW COLUMNS FROM project_tasks LIKE 'approved_additional_budget'");
    if (!cols1.length) {
      await connection.query("ALTER TABLE project_tasks ADD COLUMN approved_additional_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER total_budget");
      console.log('Added approved_additional_budget to project_tasks');
    }

    const [cols2] = await connection.query("SHOW COLUMNS FROM project_tasks LIKE 'pending_excess_budget'");
    if (!cols2.length) {
      await connection.query("ALTER TABLE project_tasks ADD COLUMN pending_excess_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER approved_additional_budget");
      console.log('Added pending_excess_budget to project_tasks');
    }

    const [cols3] = await connection.query("SHOW COLUMNS FROM project_tasks LIKE 'excess_reason'");
    if (!cols3.length) {
      await connection.query("ALTER TABLE project_tasks ADD COLUMN excess_reason TEXT NULL AFTER pending_excess_budget");
      console.log('Added excess_reason to project_tasks');
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_budget_approvals (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        task_id INT UNSIGNED NOT NULL,
        project_id INT UNSIGNED NOT NULL,
        site_id INT UNSIGNED NULL,
        category VARCHAR(50) NOT NULL,
        budget_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        actual_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        requested_excess DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        reason TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        requested_by BIGINT UNSIGNED NULL,
        approval_request_id INT UNSIGNED NULL,
        decided_by BIGINT UNSIGNED NULL,
        decision_note VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        decided_at DATETIME NULL,
        KEY idx_task_id (task_id),
        KEY idx_project_id (project_id),
        KEY idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Verified task_budget_approvals table exists.');
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Migration completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = migrate;
