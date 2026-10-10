'use strict';
/**
 * End-to-end check of Main Task -> Subtask planning against a REAL database.
 * Every step goes through the real services (no stubs): task + subtask planning,
 * procurement with plan enforcement, approval, order, vehicle-verified receipt,
 * daily work consumption / labour / machine / misc, expenses, budget approvals,
 * and the Task / Site / Project consolidation.
 *
 * Refuses to run unless DB_NAME ends with "_test" (clone one first):
 *   node scripts_test/clone_test_db.js
 *   DB_NAME=architecture_erp_test node src/db/migrations/20261011_task_subtasks.js
 *   DB_NAME=architecture_erp_test node scripts_test/subtask_integration_test.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

if (!String(process.env.DB_NAME || '').endsWith('_test')) {
  console.error('Refusing to run: set DB_NAME to a *_test database.');
  process.exit(1);
}

const SRC = path.join(__dirname, '..', 'src');
const { pool } = require(path.join(SRC, 'config/db'));
const taskService = require(path.join(SRC, 'services/taskService'));
const taskModel = require(path.join(SRC, 'models/taskModel'));
const procurementService = require(path.join(SRC, 'services/procurementService'));
const dailyWorkService = require(path.join(SRC, 'services/dailyWorkService'));
const financeService = require(path.join(SRC, 'services/financeService'));
const approvalService = require(path.join(SRC, 'services/approvalService'));
const projectService = require(path.join(SRC, 'services/projectService'));
const siteService = require(path.join(SRC, 'services/siteService'));
const warehouseModel = require(path.join(SRC, 'models/warehouseModel'));

let passed = 0;
let failed = 0;
function check(label, cond, extra) {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); } else { failed += 1; console.log(`  FAIL ${label}${extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ''}`); }
}
async function expectError(label, fn, match) {
  try {
    await fn();
    check(`${label} (expected an error)`, false);
  } catch (e) {
    const text = `${e.message} ${JSON.stringify(e.details || {})}`;
    check(label, !match || match.test(text), text);
  }
}
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

const ADMIN = { role: 'admin' };
const ADMIN_ID = 1;
const CONTRACTOR_ID = 1;
const CONTRACTOR = { role: 'contractor', contractorId: CONTRACTOR_ID };
const CONTRACTOR_USER = 13;
const M1 = 1; // Cement, bags
const M2 = 2; // Sand
const TOOL = 3; // Concrete Mixer

(async () => {
  const tag = Date.now().toString().slice(-6);
  await warehouseModel.ensureContractorWarehouses();

  // ---- fixtures: project + site run by the contractor
  const [pr] = await pool.query(
    `INSERT INTO projects (code, name, location, start_date, expected_completion, contractor_id)
     VALUES (?, ?, 'Test City', '2026-10-01', '2027-03-31', ?)`,
    [`ST-${tag}`, `Subtask Test ${tag}`, CONTRACTOR_ID]
  );
  const projectId = pr.insertId;
  const [sr] = await pool.query(
    'INSERT INTO sites (project_id, name, address, contractor_id) VALUES (?, ?, ?, ?)',
    [projectId, `Block A ${tag}`, 'Plot 1', CONTRACTOR_ID]
  );
  const siteId = sr.insertId;

  console.log('\n1. Main task with a direct plan');
  const created = await taskService.createTask({
    project_id: projectId, site_id: siteId, name: 'Structure Work', duration_days: 30,
    start_date: '2026-10-01', end_date: '2026-10-30',
    materials: [{ material_id: M1, quantity: 10, cost_per_unit: 100 }],
    misc: [{ description: 'Permits', amount: 500 }],
  }, ADMIN_ID, ADMIN);
  const taskId = created.task.id;
  check('main task total = 1500', near(created.task.totalBudget, 1500), created.task.totalBudget);

  console.log('\n2. Subtasks with their own planning');
  let d = await taskService.createSubtask(taskId, {
    name: 'Column Casting', start_date: '2026-10-01', end_date: '2026-10-10',
    materials: [{ material_id: M1, quantity: 20, cost_per_unit: 100 }],
    labour: [{ labour_name: 'Mason A', labour_type: 'Labour', daily_wage: 500, working_days: 4 }],
    tools: [{ tool_id: TOOL, tool_name: 'Concrete Mixer Machine', rental_type: 'Rent', quantity: 1, cost: 300, working_days: 2 }],
    misc: [{ description: 'Curing water', amount: 200 }],
  }, ADMIN_ID, ADMIN);
  const subA = d.subtaskId;
  d = await taskService.createSubtask(taskId, {
    name: 'Slab Sand Filling', materials: [{ material_id: M2, quantity: 5, cost_per_unit: 50 }],
  }, ADMIN_ID, ADMIN);
  const subB = d.subtaskId;
  let task = d.task;
  const A = () => task.subtasks.find((s) => s.id === subA);
  const B = () => task.subtasks.find((s) => s.id === subB);
  check('subtask A budget = 4800 (2000 mat + 2000 lab + 600 tool + 200 misc)', near(A().budget.total, 4800), A().budget);
  check('subtask B budget = 250', near(B().budget.total, 250), B().budget);
  check('main task total = direct 1500 + subtasks 5050 = 6550', near(task.totalBudget, 6550), task.totalBudget);
  check('main task categories include subtasks', near(task.materialBudget, 3250) && near(task.labourBudget, 2000) && near(task.toolBudget, 600) && near(task.miscBudget, 700),
    [task.materialBudget, task.labourBudget, task.toolBudget, task.miscBudget]);
  check('main task editable plan lists show only direct rows', task.materials.length === 1 && task.misc.length === 1 && task.tools.length === 0);
  let [[proj]] = await pool.query('SELECT estimated_budget FROM projects WHERE id = ?', [projectId]);
  check('project estimate = sum of main tasks (no double count)', near(proj.estimated_budget, 6550), proj.estimated_budget);

  console.log('\n3. Editing the main task keeps subtask plans');
  d = await taskService.updateTask(taskId, { materials: [{ material_id: M1, quantity: 12, cost_per_unit: 100 }] }, ADMIN_ID, ADMIN);
  task = d.task;
  check('main material budget = 1200 direct + 2000 + 250', near(task.materialBudget, 3450), task.materialBudget);
  check('main total = 6750', near(task.totalBudget, 6750), task.totalBudget);
  check('subtask A plan untouched', A().materials.length === 1 && near(A().budget.total, 4800));

  console.log('\n4. Project form bulk save keeps subtask plans');
  const pd = await projectService.getDetail(projectId, ADMIN);
  const pt = pd.tasks.find((t) => t.id === taskId);
  check('project detail task lists exclude subtask rows', pt.materials.length === 1 && pt.labour.length === 0 && pt.tools.length === 0);
  check('project detail carries subtask summaries', pt.subtaskCount === 2 && near(pt.subtaskBudgetTotal, 5050), [pt.subtaskCount, pt.subtaskBudgetTotal]);
  await taskModel.saveProjectTasks(projectId, [{ ...pt, siteId }], ADMIN_ID);
  task = (await taskService.getTaskDetail(taskId, ADMIN)).task;
  check('after bulk save main total still 6750', near(task.totalBudget, 6750), task.totalBudget);
  const [[{ n: subRows }]] = await pool.query('SELECT COUNT(*) AS n FROM task_materials WHERE task_id = ? AND subtask_id IS NOT NULL', [taskId]);
  check('subtask material rows survive bulk save', Number(subRows) === 2, subRows);

  console.log('\n5. Procurement is enforced against the subtask plan');
  const base = { procurement_kind: 'project_site', item_type: 'material', project_id: projectId, site_id: siteId, task_id: taskId, status: 'requested' };
  const r1 = await procurementService.create({ ...base, subtask_id: subA, material_id: M1, quantity: 15 }, CONTRACTOR_USER, CONTRACTOR);
  check('15 of 20 planned on subtask A -> not excess', r1.status === 'requested' && !r1.isExcess && r1.subtask?.id === subA, [r1.status, r1.isExcess, r1.subtask]);
  await expectError('10 more on subtask A needs an excess reason', () =>
    procurementService.create({ ...base, subtask_id: subA, material_id: M1, quantity: 10 }, CONTRACTOR_USER, CONTRACTOR), /exceeds/i);
  const r2 = await procurementService.create({ ...base, subtask_id: subA, material_id: M1, quantity: 10, excess_reason: 'Extra columns' }, CONTRACTOR_USER, CONTRACTOR);
  check('with reason -> pending approval, excess 5', r2.status === 'pending_approval' && near(r2.excessQuantity, 5), [r2.status, r2.excessQuantity]);
  await expectError('cement is not planned on subtask B', () =>
    procurementService.create({ ...base, subtask_id: subB, material_id: M1, quantity: 1 }, CONTRACTOR_USER, CONTRACTOR), /exceeds/i);
  const r3 = await procurementService.create({ ...base, material_id: M1, quantity: 12 }, CONTRACTOR_USER, CONTRACTOR);
  check('main-task (direct) request checked against direct plan only', r3.status === 'requested' && !r3.subtask, [r3.status, r3.subtask]);
  await expectError('machine not planned on subtask B is refused', () =>
    procurementService.create({ ...base, item_type: 'tool', tool_id: TOOL, material_id: undefined, subtask_id: subB, quantity: 1 }, CONTRACTOR_USER, CONTRACTOR), /not planned/i);
  // A subtask from another task is rejected.
  const other = await taskService.createTask({ project_id: projectId, site_id: siteId, name: 'Other Task' }, ADMIN_ID, ADMIN);
  const otherSub = (await taskService.createSubtask(other.task.id, { name: 'Other Sub' }, ADMIN_ID, ADMIN)).subtaskId;
  await expectError('subtask of a different task is rejected', () =>
    procurementService.create({ ...base, subtask_id: otherSub, material_id: M1, quantity: 1 }, CONTRACTOR_USER, CONTRACTOR), /does not belong/i);

  console.log('\n6. Approving excess grows the SUBTASK plan, main task follows');
  await procurementService.updateStatus(r2.id, 'approved', 'admin', ADMIN, ADMIN_ID);
  task = (await taskService.getTaskDetail(taskId, ADMIN)).task;
  check('subtask A material plan 20 + 5 approved', A().materials[0].revisedApproved === 25 && near(A().budget.material, 2500), [A().materials[0], A().budget.material]);
  check('main material = 1200 + 2500 + 250', near(task.materialBudget, 3950), task.materialBudget);
  check('main total = direct + subtasks', near(task.totalBudget, 1700 + A().budget.total + B().budget.total), [task.totalBudget, A().budget.total, B().budget.total]);

  console.log('\n7. Vehicle-number receiving still works for subtask requests');
  const rv = await procurementService.create({ ...base, subtask_id: subA, material_id: M1, quantity: 3, vehicle_number: 'PB10 AB 1234', excess_reason: 'Wastage buffer' }, ADMIN_ID, ADMIN);
  await procurementService.updateStatus(r1.id, 'pending_approval', 'admin', ADMIN, ADMIN_ID);
  for (const id of [r1.id, rv.id]) {
    await procurementService.updateStatus(id, 'approved', 'admin', ADMIN, ADMIN_ID);
    await procurementService.placeOrder(id, {});
  }
  await expectError('wrong vehicle number is rejected', () =>
    procurementService.receive(rv.id, { received_quantity: 3, vehicle_number: 'PB11 ZZ 9999' }, ADMIN_ID), /does not match/i);
  const { request: recv } = await procurementService.receive(rv.id, { received_quantity: 3, vehicle_number: 'pb10ab1234' }, ADMIN_ID);
  check('matching vehicle receives; subtask kept', recv.status === 'received' && recv.subtask?.id === subA, [recv.status, recv.subtask]);
  await procurementService.receive(r1.id, { received_quantity: 15 }, ADMIN_ID);

  console.log('\n8. Daily work against a subtask');
  const avail = await dailyWorkService.getTaskMaterials(taskId, CONTRACTOR_ID, subA);
  check('subtask A has 18 bags available', avail.length === 1 && near(avail[0].taskAvailable, 18), avail);
  const availB = await dailyWorkService.getTaskMaterials(taskId, CONTRACTOR_ID, subB);
  check('subtask B has none (procured for A)', availB.length === 0, availB);
  const dw = await dailyWorkService.create({
    project_id: projectId, site_id: siteId, task_id: taskId, subtask_id: subA, work_date: '2026-10-05',
    material_id: M1, quantity_used: 10, progress_percentage: 40,
    workers: [{ worker_name: 'Mason A', labour_type: 'Mason', daily_wage: 500, hours_worked: 8 }],
    misc_amount: 100, misc_description: 'Water', tool_cost: 300, tool_name: 'Concrete Mixer Machine',
  }, [], CONTRACTOR, CONTRACTOR_USER);
  check('daily update linked to subtask A', dw.subtaskId === subA, dw.subtaskId);
  const [exRows] = await pool.query('SELECT category, subtask_id FROM expenses WHERE task_id = ? ORDER BY id', [taskId]);
  check('material / machine / misc expenses carry subtask A', exRows.length === 3 && exRows.every((e) => e.subtask_id === subA), exRows);
  const [[wl]] = await pool.query('SELECT subtask_id FROM task_worker_logs WHERE daily_work_id = ?', [dw.id]);
  check('worker log carries subtask A', wl.subtask_id === subA);
  await expectError('cement cannot be consumed on subtask B', () => dailyWorkService.create({
    project_id: projectId, site_id: siteId, task_id: taskId, subtask_id: subB, material_id: M1, quantity_used: 1,
  }, [], CONTRACTOR, CONTRACTOR_USER), /not procured for subtask/i);
  await expectError('cannot consume more than the subtask has left', () => dailyWorkService.create({
    project_id: projectId, site_id: siteId, task_id: taskId, subtask_id: subA, material_id: M1, quantity_used: 9,
  }, [], CONTRACTOR, CONTRACTOR_USER), /Only 8/i);

  console.log('\n9. Consolidation');
  task = (await taskService.getTaskDetail(taskId, ADMIN)).task;
  check('subtask A actual = 1000 mat + 500 lab + 300 tool + 100 misc', near(A().actualCost, 1900), A().budgetUtilization.total);
  check('subtask A remaining = planned - actual', near(A().remainingBudget, A().plannedBudget - 1900));
  check('subtask A material used 10 of 25', A().materials[0].used === 10 && A().materials[0].procured === 28, A().materials[0]);
  check('subtask A shows its procurement requests', A().procurements.length === 3, A().procurements.length);
  check('subtask A progress 40, main follows (budget-weighted)', A().progress === 40 && task.progress > 0 && task.progress < 40, [A().progress, task.progress]);
  check('main actual = subtasks + direct (reconciled)', task.consolidation.reconciled && near(task.consolidation.mainTaskActual, 1900), task.consolidation);
  check('direct bucket has no spend yet', near(task.directScope.actualCost, 0));

  console.log('\n10. Manual expense linked to a subtask');
  await financeService.createExpense({
    project_id: projectId, site_id: siteId, task_id: taskId, subtask_id: subB, category: 'Site Expense',
    description: 'Tarpaulin', amount: 50, expense_date: '2026-10-06', status: 'approved',
  }, ADMIN_ID, ADMIN);
  await expectError('expense subtask must belong to the task', () => financeService.createExpense({
    project_id: projectId, task_id: taskId, subtask_id: otherSub, category: 'Site Expense', description: 'x', amount: 1, expense_date: '2026-10-06',
  }, ADMIN_ID, ADMIN), /does not belong/i);
  task = (await taskService.getTaskDetail(taskId, ADMIN)).task;
  check('subtask B misc actual 50', near(B().budgetUtilization.misc.actual, 50), B().budgetUtilization.misc);
  check('still reconciled; main actual 1950', task.consolidation.reconciled && near(task.consolidation.mainTaskActual, 1950), task.consolidation);

  console.log('\n11. Subtask budget overrun needs approval and grows subtask + main');
  await expectError('overrunning subtask B (250) needs a reason', () => dailyWorkService.create({
    project_id: projectId, site_id: siteId, task_id: taskId, subtask_id: subB, misc_amount: 1000, misc_description: 'Crane',
  }, [], CONTRACTOR, CONTRACTOR_USER), /subtask "Slab Sand Filling"/);
  await dailyWorkService.create({
    project_id: projectId, site_id: siteId, task_id: taskId, subtask_id: subB, misc_amount: 1000, misc_description: 'Crane',
    excess_reason: 'Crane hire for sand lift',
  }, [], CONTRACTOR, CONTRACTOR_USER);
  const [[tba]] = await pool.query('SELECT * FROM task_budget_approvals WHERE subtask_id = ? ORDER BY id DESC LIMIT 1', [subB]);
  check('approval request recorded for subtask B (excess 800)', tba && tba.category === 'Subtask Total' && near(tba.requested_excess, 800), tba && [tba.category, tba.requested_excess]);
  await approvalService.decide(tba.approval_request_id, 'approved', ADMIN_ID, 'ok');
  task = (await taskService.getTaskDetail(taskId, ADMIN)).task;
  check('subtask B effective budget 250 + 800', near(B().plannedBudget, 1050), B().plannedBudget);
  check('main task approved additional +800', near(task.approvedAdditionalBudget, 800), task.approvedAdditionalBudget);
  check('still reconciled', task.consolidation.reconciled, task.consolidation);

  console.log('\n12. Permissions & deletion');
  await expectError('contractor cannot create a subtask', () => taskService.createSubtask(taskId, { name: 'X' }, CONTRACTOR_USER, CONTRACTOR), /Contractors cannot/);
  await expectError('contractor cannot change subtask planning', () => taskService.updateSubtask(taskId, subB, { materials: [] }, CONTRACTOR_USER, CONTRACTOR), /Contractors cannot/);
  d = await taskService.updateSubtask(taskId, subB, { progress: 100, status: 'completed' }, CONTRACTOR_USER, CONTRACTOR);
  check('contractor can update subtask progress', d.task.subtasks.find((s) => s.id === subB).progress === 100);
  await expectError('subtask with activity cannot be deleted', () => taskService.deleteSubtask(taskId, subA, ADMIN), /cannot be deleted/);
  const before = (await taskService.getTaskDetail(taskId, ADMIN)).task.totalBudget;
  const c = (await taskService.createSubtask(taskId, { name: 'Temp', misc: [{ description: 'x', amount: 99 }] }, ADMIN_ID, ADMIN)).subtaskId;
  d = await taskService.deleteSubtask(taskId, c, ADMIN);
  check('empty subtask deleted and main budget restored', near(d.task.totalBudget, before) && !d.task.subtasks.some((s) => s.id === c), [before, d.task.totalBudget]);

  console.log('\n13. Lists, site and project summaries');
  const { tasks } = await taskService.listTasks({ projectId }, ADMIN);
  const lt = tasks.find((t) => t.id === taskId);
  check('task list carries subtask summaries', lt.subtaskCount === 2 && lt.subtasks.every((s) => typeof s.actualCost === 'number'), lt.subtasks);
  const sd = await siteService.getDetail(siteId);
  check('site summary has no NaN', sd.budgetSummary.categories.every((c2) => Number.isFinite(c2.used)), sd.budgetSummary.categories);
  const st = sd.tasks.find((t) => t.id === taskId);
  check('site task actual includes subtask spend (no double count)', near(st.actualCost, task.consolidation.mainTaskActual), [st.actualCost, task.consolidation.mainTaskActual]);
  [[proj]] = await pool.query('SELECT estimated_budget FROM projects WHERE id = ?', [projectId]);
  const [[sum]] = await pool.query('SELECT SUM(total_budget) AS s FROM project_tasks WHERE project_id = ?', [projectId]);
  check('project estimate = sum of main tasks', near(proj.estimated_budget, sum.s), [proj.estimated_budget, sum.s]);

  console.log(`\n${passed} passed, ${failed} failed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  console.error('\nTEST CRASHED:', e);
  await pool.end().catch(() => {});
  process.exit(1);
});
