const fs = require('fs');

let content = fs.readFileSync('server/src/models/taskModel.js', 'utf8');

// 1. In findTaskById, query task_assigned_workers
const targetInFind = `  // Actual labour cost from worker logs + daily labour records`;
const replacementInFind = `  // Actual assigned workers for this task
  const [assignedWorkers] = await pool.query(
    \`SELECT taw.*,
            COALESCE(taw.phone, cw.phone, e.phone) AS phone,
            COALESCE(taw.aadhaar_number, cw.aadhaar_number) AS aadhaar_number,
            c.name AS contractor_name
     FROM task_assigned_workers taw
     LEFT JOIN contractor_workers cw ON cw.id = taw.worker_id AND taw.worker_type = 'daily_wage'
     LEFT JOIN contractors c ON c.id = cw.contractor_id
     LEFT JOIN employees e ON e.id = taw.worker_id AND taw.worker_type = 'company_employee'
     WHERE taw.task_id = ?
     ORDER BY taw.id ASC\`,
    [taskId]
  );

  // Actual labour cost from worker logs + daily labour records`;

if (content.includes(targetInFind) && !content.includes('task_assigned_workers taw')) {
  content = content.replace(targetInFind, replacementInFind);
}

// 2. Add assignedWorkers to return object in findTaskById
const targetReturn = `    labour: labour.map((l) => ({`;
const replacementReturn = `    assignedWorkers: assignedWorkers.map((w) => ({
      id: w.id,
      workerId: w.worker_id,
      workerType: w.worker_type,
      workerName: w.worker_name,
      workerCode: w.worker_code,
      phone: w.phone,
      aadhaarNumber: w.aadhaar_number,
      trade: w.trade,
      startDate: w.start_date,
      endDate: w.end_date,
      expectedDays: Number(w.expected_days || 0),
      dailyWage: Number(w.daily_wage || 0),
      plannedCost: Number(w.planned_cost || 0),
      contractorName: w.contractor_name,
      remarks: w.remarks,
      status: w.status,
    })),
    labour: labour.map((l) => ({`;

if (content.includes(targetReturn) && !content.includes('assignedWorkers: assignedWorkers.map')) {
  content = content.replace(targetReturn, replacementReturn);
}

// 3. Add getTaskAssignments, assignWorkerToTask, unassignWorkerFromTask, createQuickWorker
const newFunctions = `
/**
 * Task Assigned Workers (Actual Labour Assignment)
 */
async function getTaskAssignments(taskId) {
  const [rows] = await pool.query(
    \`SELECT taw.*,
            COALESCE(taw.phone, cw.phone, e.phone) AS phone,
            COALESCE(taw.aadhaar_number, cw.aadhaar_number) AS aadhaar_number,
            c.name AS contractor_name
     FROM task_assigned_workers taw
     LEFT JOIN contractor_workers cw ON cw.id = taw.worker_id AND taw.worker_type = 'daily_wage'
     LEFT JOIN contractors c ON c.id = cw.contractor_id
     LEFT JOIN employees e ON e.id = taw.worker_id AND taw.worker_type = 'company_employee'
     WHERE taw.task_id = ?
     ORDER BY taw.id ASC\`,
    [taskId]
  );
  return rows.map((w) => ({
    id: w.id,
    taskId: w.task_id,
    projectId: w.project_id,
    siteId: w.site_id,
    contractorId: w.contractor_id,
    workerType: w.worker_type,
    workerId: w.worker_id,
    workerName: w.worker_name,
    workerCode: w.worker_code,
    phone: w.phone,
    aadhaarNumber: w.aadhaar_number,
    trade: w.trade,
    startDate: w.start_date,
    endDate: w.end_date,
    expectedDays: Number(w.expected_days || 0),
    dailyWage: Number(w.daily_wage || 0),
    plannedCost: Number(w.planned_cost || 0),
    contractorName: w.contractor_name,
    remarks: w.remarks,
    status: w.status,
  }));
}

async function assignWorkerToTask(payload) {
  const taskId = Number(payload.taskId || payload.task_id);
  const projectId = Number(payload.projectId || payload.project_id);
  const siteId = payload.siteId || payload.site_id ? Number(payload.siteId || payload.site_id) : null;
  const contractorId = payload.contractorId || payload.contractor_id ? Number(payload.contractorId || payload.contractor_id) : null;
  const workerType = payload.workerType || payload.worker_type || 'daily_wage';
  const workerId = Number(payload.workerId || payload.worker_id);
  const workerName = (payload.workerName || payload.worker_name || '').trim();
  const workerCode = payload.workerCode || payload.worker_code || null;
  const phone = payload.phone || null;
  const aadhaarNumber = payload.aadhaarNumber || payload.aadhaar_number || null;
  const trade = payload.trade || null;
  const startDate = payload.startDate || payload.start_date || null;
  const endDate = payload.endDate || payload.end_date || null;
  const expectedDays = Number(payload.expectedDays || payload.expected_days || 0);
  const dailyWage = workerType === 'company_employee' ? 0 : Number(payload.dailyWage || payload.daily_wage || 0);
  const plannedCost = workerType === 'company_employee' ? 0 : Number(payload.plannedCost || payload.planned_cost || (expectedDays * dailyWage));
  const remarks = (payload.remarks || '').trim() || null;
  const assignedBy = payload.assignedBy || payload.assigned_by || null;

  // Duplicate check
  const [existing] = await pool.query(
    'SELECT id FROM task_assigned_workers WHERE task_id = ? AND worker_type = ? AND worker_id = ?',
    [taskId, workerType, workerId]
  );
  if (existing.length) {
    const err = new Error(\`\${workerName} is already assigned to this task.\`);
    err.status = 409;
    throw err;
  }

  const [res] = await pool.query(
    \`INSERT INTO task_assigned_workers
      (task_id, project_id, site_id, contractor_id, worker_type, worker_id,
       worker_name, worker_code, phone, aadhaar_number, trade, start_date,
       end_date, expected_days, daily_wage, planned_cost, remarks, assigned_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
    [
      taskId, projectId, siteId, contractorId, workerType, workerId,
      workerName, workerCode, phone, aadhaarNumber, trade, startDate,
      endDate, expectedDays, dailyWage, plannedCost, remarks, assignedBy
    ]
  );

  return res.insertId;
}

async function unassignWorkerFromTask(assignmentId, taskId) {
  await pool.query('DELETE FROM task_assigned_workers WHERE id = ? AND task_id = ?', [
    Number(assignmentId),
    Number(taskId),
  ]);
  return true;
}

async function createQuickWorker(payload, contractorId) {
  const fullName = (payload.full_name || payload.fullName || payload.name || '').trim();
  if (!fullName) throw new Error('Worker full name is required.');

  const [cwMax] = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM contractor_workers');
  const nextId = cwMax[0].next_id;
  const workerCode = \`CW-\${String(nextId).padStart(4, '0')}\`;

  const phone = (payload.phone || payload.mobile || '').trim() || null;
  const aadhaar = (payload.aadhaar_number || payload.aadhaarNumber || payload.aadhaar || '').trim() || null;
  const trade = (payload.skill_category || payload.trade || 'General Labour').trim();
  const dailyRate = Number(payload.daily_rate || payload.dailyRate || payload.daily_wage || 750);
  const notes = (payload.notes || '').trim() || null;

  const [res] = await pool.query(
    \`INSERT INTO contractor_workers
      (contractor_id, worker_code, full_name, phone, aadhaar_number, skill_category, daily_rate, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)\`,
    [Number(contractorId || 1), workerCode, fullName, phone, aadhaar, trade, dailyRate, notes]
  );

  return {
    id: res.insertId,
    workerId: res.insertId,
    workerType: 'daily_wage',
    workerTypeLabel: 'Daily Wage Worker',
    code: workerCode,
    name: fullName,
    phone,
    aadhaarNumber: aadhaar,
    trade,
    dailyRate,
    contractorId: Number(contractorId || 1),
    status: 'active',
  };
}
`;

const exportTarget = `module.exports = {
  createTask,
  updateTask,
  deleteTask,
  findTaskById,
  findAllTasks,
  addWorkerLog,
  getTaskLabourSummary,
  saveProjectTasks,`;

const exportReplacement = `module.exports = {
  createTask,
  updateTask,
  deleteTask,
  findTaskById,
  findAllTasks,
  addWorkerLog,
  getTaskLabourSummary,
  saveProjectTasks,
  getTaskAssignments,
  assignWorkerToTask,
  unassignWorkerFromTask,
  createQuickWorker,`;

if (content.includes(exportTarget) && !content.includes('getTaskAssignments,')) {
  content = content.replace(exportTarget, exportReplacement);
  content = content.replace('module.exports = {', newFunctions + '\nmodule.exports = {');
}

fs.writeFileSync('server/src/models/taskModel.js', content, 'utf8');
console.log('server/src/models/taskModel.js successfully updated');
