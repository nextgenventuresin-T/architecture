const taskModel = require('./src/models/taskModel');
const restructuredFinanceService = require('./src/services/restructuredFinanceService');

async function verify() {
  console.log('--- VERIFYING LABOUR COST FLOW INTO TASKS & FINANCE ---');

  // 1. Task Detail / Tasks list
  const task = await taskModel.findTaskById(1);
  console.log('1. Task #1 Labour metrics:');
  console.log('   - Planned Labour Budget: ₹', task.budgetUtilization.labour.budgeted);
  console.log('   - Actual Labour Cost:    ₹', task.budgetUtilization.labour.actual);
  console.log('   - Remaining Labour:      ₹', task.budgetUtilization.labour.remaining);
  console.log('   - Total Actual Cost:     ₹', task.budgetUtilization.total.actual);

  // 2. Finance Tab 1: Project Costs
  const projectCosts = await restructuredFinanceService.getProjectCosts({ projectId: 1 });
  console.log('2. Finance Project Cost Summary (Tab 1):');
  console.log('   - Project:', projectCosts[0]?.projectName);
  console.log('   - Site:', projectCosts[0]?.siteName);
  console.log('   - Labour Cost: ₹', projectCosts[0]?.labourCost);
  console.log('   - Total Actual: ₹', projectCosts[0]?.totalActual);

  // 3. Finance Tab 2: Actual Expenses
  const actualExpenses = await restructuredFinanceService.getActualExpenses({ projectId: 1 });
  console.log('3. Finance Actual Expenses (Tab 2): total rows =', actualExpenses.rows.length);
  const labourRow = actualExpenses.rows.find(r => r.categoryType === 'labour');
  console.log('   - Labour transaction:', labourRow ? {
    itemLabour: labourRow.labour,
    amount: labourRow.amount,
    task: labourRow.taskName,
    sourceTx: labourRow.sourceTransaction
  } : 'NONE');

  // 4. Finance Tab 3: Budget vs Actual
  const budgetVsActual = await restructuredFinanceService.getBudgetVsActual();
  console.log('4. Finance Budget vs Actual (Tab 3): total tasks =', budgetVsActual.length);
  const taskRow = budgetVsActual.find(r => r.taskId === 1);
  console.log('   - Task #1 Row:', taskRow ? {
    taskName: taskRow.taskName,
    labourBudget: taskRow.labourBudget,
    labourActual: taskRow.labourActual,
    totalBudget: taskRow.totalBudget,
    totalActual: taskRow.totalActual
  } : 'NONE');

  process.exit(0);
}

verify().catch(e => { console.error(e); process.exit(1); });
