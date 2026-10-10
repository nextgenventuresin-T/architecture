const { pool } = require('./src/config/db');
async function run() {
  const [cols] = await pool.query("SHOW FULL COLUMNS FROM task_worker_logs WHERE Field = 'worker_type'");
  console.log('worker_type in task_worker_logs:', cols[0]);

  const [allCols] = await pool.query("SHOW FULL COLUMNS FROM task_assigned_workers WHERE Field = 'worker_type'");
  console.log('worker_type in task_assigned_workers:', allCols[0]);

  process.exit(0);
}
run();
