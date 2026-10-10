const { pool } = require('./src/config/db');

async function migrate() {
  try {
    console.log('Altering task_worker_logs.worker_type to VARCHAR(50)...');
    await pool.query("ALTER TABLE task_worker_logs MODIFY COLUMN worker_type VARCHAR(50) DEFAULT 'daily_wage'");
    console.log('✓ Successfully altered task_worker_logs.worker_type to VARCHAR(50)');

    // Also check task_assigned_workers just in case
    await pool.query("ALTER TABLE task_assigned_workers MODIFY COLUMN worker_type VARCHAR(50) DEFAULT 'daily_wage'");
    console.log('✓ Successfully altered task_assigned_workers.worker_type to VARCHAR(50)');

    // Also check task_budget_approvals worker_type
    await pool.query("ALTER TABLE task_budget_approvals MODIFY COLUMN worker_type VARCHAR(50) NULL");
    console.log('✓ Successfully altered task_budget_approvals.worker_type to VARCHAR(50)');

  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
