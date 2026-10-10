require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { pool } = require('../config/db');

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Running task budget approvals migration for additional labour tracking...');

    // Add columns to task_budget_approvals if missing
    const [cols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_budget_approvals'
    `);
    const colNames = new Set(cols.map((c) => c.COLUMN_NAME));

    if (!colNames.has('original_planned_workers')) {
      await connection.query('ALTER TABLE task_budget_approvals ADD COLUMN original_planned_workers INT UNSIGNED NULL DEFAULT 0');
      console.log('Added original_planned_workers to task_budget_approvals');
    }
    if (!colNames.has('additional_workers')) {
      await connection.query('ALTER TABLE task_budget_approvals ADD COLUMN additional_workers INT UNSIGNED NULL DEFAULT 0');
      console.log('Added additional_workers to task_budget_approvals');
    }
    if (!colNames.has('revised_labour_budget')) {
      await connection.query('ALTER TABLE task_budget_approvals ADD COLUMN revised_labour_budget DECIMAL(15,2) NULL DEFAULT 0.00');
      console.log('Added revised_labour_budget to task_budget_approvals');
    }
    if (!colNames.has('worker_id')) {
      await connection.query('ALTER TABLE task_budget_approvals ADD COLUMN worker_id INT UNSIGNED NULL');
      console.log('Added worker_id to task_budget_approvals');
    }
    if (!colNames.has('worker_type')) {
      await connection.query('ALTER TABLE task_budget_approvals ADD COLUMN worker_type VARCHAR(50) NULL');
      console.log('Added worker_type to task_budget_approvals');
    }
    if (!colNames.has('worker_name')) {
      await connection.query('ALTER TABLE task_budget_approvals ADD COLUMN worker_name VARCHAR(150) NULL');
      console.log('Added worker_name to task_budget_approvals');
    }

    console.log('task_budget_approvals columns verified successfully.');
  } finally {
    connection.release();
  }
}

migrate()
  .then(() => {
    console.log('Migration finished.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
