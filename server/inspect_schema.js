const { pool } = require('./src/config/db');
(async () => {
  try {
    const [tables] = await pool.query('SHOW TABLES');
    const all = tables.map(r => Object.values(r)[0]);
    const matching = all.filter(t => t.includes('labour') || t.includes('task') || t.includes('worker') || t.includes('daily') || t.includes('expense'));
    console.log('Matching tables:', matching);

    for (const t of ['task_labour', 'task_worker_logs', 'daily_work_labour', 'daily_work_materials', 'daily_work_expenses', 'contractor_workers', 'labour_assignments']) {
      if (all.includes(t)) {
        const [cols] = await pool.query(`DESCRIBE ${t}`);
        console.log(`\nTable ${t} columns:`, cols.map(c => `${c.Field} (${c.Type})`));
      } else {
        console.log(`\nTable ${t} DOES NOT EXIST`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
})();
