'use strict';

const taskService = require('../server/src/services/taskService');
const dailyWorkService = require('../server/src/services/dailyWorkService');
const { pool } = require('../server/src/config/db');

async function testBackend() {
  console.log('--- Testing Task-Based Backend Logic ---');

  // Clean any leftover task from previous attempt
  await pool.query('DELETE FROM project_tasks WHERE name LIKE "Foundation %"');

  // 1. Get first project and site
  const [projects] = await pool.query('SELECT id, contractor_id FROM projects LIMIT 1');
  if (!projects.length) throw new Error('No projects found');
  const projectId = projects[0].id;
  const contractorId = projects[0].contractor_id || 1;

  const [sites] = await pool.query('SELECT id FROM sites WHERE project_id = ? LIMIT 1', [projectId]);
  const siteId = sites.length ? sites[0].id : null;

  console.log('Using projectId:', projectId, 'siteId:', siteId, 'contractorId:', contractorId);

  // 2. Create Task with Budget Breakdown
  const created = await taskService.createTask({
    project_id: projectId,
    site_id: siteId,
    name: 'Foundation and Excavation Work',
    description: 'Site leveling and digging foundation trenches',
    status: 'on-track',
    start_date: '2026-10-01',
    end_date: '2026-10-15',
    duration_days: 14,
    materials: [
      { material_id: 1, quantity: 20, cost_per_unit: 350, total_cost: 7000 },
      { material_id: 2, quantity: 5, cost_per_unit: 1200, total_cost: 6000 }
    ],
    tools: [
      { tool_name: 'Excavator JCB', rental_type: 'Rent', quantity: 1, cost: 15000, total_cost: 15000 }
    ],
    labour: [
      { labour_type: 'Excavation Labourer', worker_count: 4, daily_wage: 700, working_days: 10, total_cost: 28000 }
    ],
    misc: [
      { description: 'Site water connection and trench safety signage', amount: 3500 }
    ]
  }, 1, { role: 'admin' });

  const task = created.task;
  console.log('Task created! ID:', task.id);
  console.log('Task Name:', task.name);
  console.log('Total Budget:', task.budget.totalBudget, '(Expected: 7000 + 6000 + 15000 + 28000 + 3500 = 59500)');
  if (task.budget.totalBudget !== 59500) {
    throw new Error('Budget calculation mismatch: got ' + task.budget.totalBudget);
  }

  // 3. Log a worker against this task
  const workerLogRes = await taskService.logWorker(task.id, {
    contractor_id: contractorId,
    worker_name: 'Rajesh Kumar',
    worker_code: 'W-001',
    labour_type: 'Mason',
    work_date: '2026-10-06',
    hours_worked: 8,
    daily_wage: 800,
    work_performed: 'Foundation layout marking and brick placement'
  }, 1, { role: 'admin' });
  console.log('Worker log recorded:', workerLogRes);

  // 4. Check Labour Summary
  const labourSummary = await taskService.getLabourSummary(task.id, { role: 'admin' });
  console.log('Labour Summary workers count:', labourSummary.summary.actuals.workerList.length);
  console.log('Total actual labour cost:', labourSummary.summary.actuals.totalActualLabourCost);
  if (labourSummary.summary.actuals.totalActualLabourCost !== 800) {
    throw new Error('Labour summary cost mismatch');
  }

  // 5. Submit Daily Work Update against this task with another worker
  const dwu = await dailyWorkService.create({
    project_id: projectId,
    site_id: siteId,
    contractor_id: contractorId,
    task_id: task.id,
    work_date: '2026-10-06',
    work_done: 'Completed trench digging and concrete footing base',
    work_status: 'in-progress',
    progress_percentage: 35,
    remarks: 'Work progressing on schedule',
    workers: [
      { worker_name: 'Amit Singh', worker_code: 'W-002', labour_type: 'Excavation Labourer', hours_worked: 8, daily_wage: 750, work_performed: 'Trench digging' }
    ]
  }, [], { role: 'contractor', contractorId }, 1);

  console.log('Daily work created! ID:', dwu.id, 'Task Name:', dwu.taskName);

  // 6. Verify Task Detail reflects progress and both workers
  const taskAfter = (await taskService.getTaskDetail(task.id, { role: 'admin' })).task;
  console.log('Task progress after daily work:', taskAfter.progress, '(Expected: 35%)');
  console.log('Task worker logs count:', taskAfter.workerLogs.length, '(Expected: 2)');
  console.log('Task daily work count:', taskAfter.dailyWorkUpdates.length, '(Expected: 1)');

  // 7. Cleanup test task and daily work
  await taskService.deleteTask(task.id, { role: 'admin' });
  await pool.query('DELETE FROM daily_work_updates WHERE id = ?', [dwu.id]);
  console.log('--- Test Succeeded & Cleaned Up ---');
  process.exit(0);
}

testBackend().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
