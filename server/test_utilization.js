const { pool } = require('./src/config/db');

async function test() {
  const taskId = 1;
  const [t] = await pool.query('SELECT * FROM project_tasks WHERE id = ?', [taskId]);
  const task = t[0];

  // 1. Material actual
  const [mRows] = await pool.query(`
    SELECT dwu.material_id, SUM(dwu.quantity_used) AS used_qty,
           COALESCE(tm.cost_per_unit, m.default_rate, 0) AS unit_rate,
           COALESCE(e.amount, 0) AS exp_amount
    FROM daily_work_updates dwu
    LEFT JOIN task_materials tm ON tm.task_id = dwu.task_id AND tm.material_id = dwu.material_id
    LEFT JOIN materials m ON m.id = dwu.material_id
    LEFT JOIN expenses e ON e.id = dwu.expense_id
    WHERE dwu.task_id = ? AND dwu.material_id IS NOT NULL AND dwu.quantity_used > 0
    GROUP BY dwu.material_id, tm.cost_per_unit, m.default_rate, e.amount
  `, [taskId]);
  const actualMaterials = mRows.reduce((sum, r) => sum + (Number(r.exp_amount) || (Number(r.used_qty) * Number(r.unit_rate))), 0);

  // 2. Tools actual
  const [toolExp] = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
    WHERE task_id = ? AND category IN ('Equipment Rental', 'Tools', 'Machinery', 'Equipment')
  `, [taskId]);
  const actualTools = Number(toolExp[0].total || 0);

  // 3. Labour actual
  const [labourLogs] = await pool.query(`
    SELECT COALESCE(SUM(daily_wage * (hours_worked / 8)), 0) AS total FROM task_worker_logs WHERE task_id = ?
  `, [taskId]);
  const actualLabour = Number(labourLogs[0].total || 0);

  // 4. Misc actual
  const [miscDwu] = await pool.query(`
    SELECT COALESCE(SUM(misc_amount), 0) AS total FROM daily_work_updates WHERE task_id = ?
  `, [taskId]);
  const actualMisc = Number(miscDwu[0].total || 0);

  const actualTotal = actualMaterials + actualTools + actualLabour + actualMisc;

  console.log({
    budget: {
      materials: Number(task.material_budget),
      tools: Number(task.tool_budget),
      labour: Number(task.labour_budget),
      misc: Number(task.misc_budget),
      total: Number(task.total_budget),
    },
    actual: {
      materials: actualMaterials,
      tools: actualTools,
      labour: actualLabour,
      misc: actualMisc,
      total: actualTotal,
    }
  });
  process.exit(0);
}

test();
