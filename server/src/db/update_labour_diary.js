const fs = require('fs');

// 1. Update labourDirectoryModel.js
let modelContent = fs.readFileSync('server/src/models/labourDirectoryModel.js', 'utf8');

// In getWorkforceLookup, include aadhaar_number from contractor_workers and always include employees
modelContent = modelContent.replace(
  'w.skill_category AS trade,\n       w.daily_rate AS daily_rate,',
  'w.skill_category AS trade,\n       w.daily_rate AS daily_rate,\n       w.aadhaar_number AS aadhaar_number,'
);

// Allow employees in lookup for contractors as well
modelContent = modelContent.replace(
  "  if (hrScope?.role !== 'contractor') {",
  "  if (true) { // Include active company employees for both Admin and Contractor"
);

// Map aadhaarNumber in combined array
modelContent = modelContent.replace(
  'phone: item.phone,\n    trade: item.trade || \'General Labour\',',
  'phone: item.phone,\n    aadhaarNumber: item.aadhaar_number || null,\n    trade: item.trade || \'General Labour\','
);

// Add getLabourDiary function before module.exports
const diaryCode = `
async function getLabourDiary({
  page = 1,
  pageSize = 20,
  viewBy = 'labour',
  workerId = null,
  workerType = null,
  siteId = null,
  taskId = null,
  projectId = null,
  month = null,
  year = null,
  search = '',
  hrScope = null,
} = {}) {
  const offset = (Number(page) - 1) * Number(pageSize);
  const whereClauses = [];
  const params = [];

  if (hrScope?.role === 'contractor') {
    whereClauses.push('twl.contractor_id = ?');
    params.push(Number(hrScope.contractorId));
  }

  if (workerId && workerId !== 'all') {
    whereClauses.push('twl.worker_id = ?');
    params.push(Number(workerId));
  }
  if (workerType && workerType !== 'all') {
    whereClauses.push('twl.worker_type = ?');
    params.push(workerType === 'daily_wage' ? 'labour' : (workerType === 'company_employee' ? 'company_employee' : workerType));
  }
  if (siteId && siteId !== 'all') {
    whereClauses.push('twl.site_id = ?');
    params.push(Number(siteId));
  }
  if (taskId && taskId !== 'all') {
    whereClauses.push('twl.task_id = ?');
    params.push(Number(taskId));
  }
  if (projectId && projectId !== 'all') {
    whereClauses.push('twl.project_id = ?');
    params.push(Number(projectId));
  }
  if (month) {
    whereClauses.push('MONTH(twl.work_date) = ?');
    params.push(Number(month));
  }
  if (year) {
    whereClauses.push('YEAR(twl.work_date) = ?');
    params.push(Number(year));
  }
  if (search && search.trim()) {
    whereClauses.push('(twl.worker_name LIKE ? OR twl.worker_code LIKE ? OR pt.name LIKE ? OR p.name LIKE ? OR s.name LIKE ?)');
    params.push(...Array(5).fill(\`%\${search.trim()}%\`));
  }

  const whereSql = whereClauses.length ? \`WHERE \${whereClauses.join(' AND ')}\` : '';

  const [rows] = await pool.query(
    \`SELECT
       twl.id,
       twl.work_date,
       twl.worker_id,
       twl.worker_type,
       twl.worker_name,
       twl.worker_code,
       COALESCE(twl.aadhaar_number, cw.aadhaar_number) AS aadhaar_number,
       COALESCE(cw.phone, e.phone) AS phone,
       twl.labour_type,
       twl.hours_worked,
       twl.daily_wage,
       twl.work_performed,
       twl.task_id,
       pt.name AS task_name,
       twl.project_id,
       p.name AS project_name,
       p.code AS project_code,
       twl.site_id,
       s.name AS site_name,
       twl.contractor_id,
       c.name AS contractor_name,
       dwu.remarks AS daily_remarks
     FROM task_worker_logs twl
     JOIN project_tasks pt ON pt.id = twl.task_id
     JOIN projects p ON p.id = twl.project_id
     LEFT JOIN sites s ON s.id = twl.site_id
     LEFT JOIN contractors c ON c.id = twl.contractor_id
     LEFT JOIN contractor_workers cw ON cw.id = twl.worker_id AND twl.worker_type = 'labour'
     LEFT JOIN employees e ON e.id = twl.worker_id AND twl.worker_type = 'company_employee'
     LEFT JOIN daily_work_updates dwu ON dwu.id = twl.daily_work_id
     \${whereSql}
     ORDER BY twl.work_date DESC, twl.id DESC
     LIMIT ? OFFSET ?\`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    \`SELECT COUNT(*) AS total
     FROM task_worker_logs twl
     JOIN project_tasks pt ON pt.id = twl.task_id
     JOIN projects p ON p.id = twl.project_id
     LEFT JOIN sites s ON s.id = twl.site_id
     LEFT JOIN contractors c ON c.id = twl.contractor_id
     LEFT JOIN contractor_workers cw ON cw.id = twl.worker_id AND twl.worker_type = 'labour'
     LEFT JOIN employees e ON e.id = twl.worker_id AND twl.worker_type = 'company_employee'
     LEFT JOIN daily_work_updates dwu ON dwu.id = twl.daily_work_id
     \${whereSql}\`,
    params
  );

  const [[summary]] = await pool.query(
    \`SELECT
       COUNT(*) AS total_logs,
       COUNT(DISTINCT COALESCE(twl.worker_id, twl.worker_name)) AS unique_workers,
       COALESCE(SUM(twl.hours_worked / 8), 0) AS total_days_worked,
       COALESCE(SUM(CASE WHEN twl.worker_type = 'company_employee' THEN 0 ELSE (twl.hours_worked / 8) * twl.daily_wage END), 0) AS total_wages_paid
     FROM task_worker_logs twl
     JOIN project_tasks pt ON pt.id = twl.task_id
     JOIN projects p ON p.id = twl.project_id
     LEFT JOIN sites s ON s.id = twl.site_id
     \${whereSql}\`,
    params
  );

  return {
    rows: rows.map((r) => {
      const hours = Number(r.hours_worked || 8);
      const isCompany = r.worker_type === 'company_employee';
      const wage = isCompany ? 0 : Number(r.daily_wage || 0);
      const earned = isCompany ? 0 : (hours / 8) * wage;
      return {
        id: r.id,
        date: r.work_date,
        workerId: r.worker_id,
        workerType: r.worker_type,
        workerTypeLabel: isCompany ? 'Company Employee' : 'Daily Wage Worker',
        workerName: r.worker_name,
        workerCode: r.worker_code,
        phone: r.phone,
        aadhaarNumber: r.aadhaar_number,
        trade: r.labour_type,
        hoursWorked: hours,
        daysWorked: Number((hours / 8).toFixed(1)),
        dailyWage: wage,
        earnedAmount: Number(earned.toFixed(2)),
        taskId: r.task_id,
        taskName: r.task_name,
        projectId: r.project_id,
        projectName: r.project_name,
        projectCode: r.project_code,
        siteId: r.site_id,
        siteName: r.site_name || '—',
        contractorName: r.contractor_name || '—',
        workDone: r.work_performed || 'Site labour execution',
        remarks: r.daily_remarks || '',
      };
    }),
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    totalPages: Math.max(1, Math.ceil(total / Number(pageSize))),
    summary: {
      totalLogs: Number(summary?.total_logs || 0),
      uniqueWorkers: Number(summary?.unique_workers || 0),
      totalDaysWorked: Number(Number(summary?.total_days_worked || 0).toFixed(1)),
      totalWagesPaid: Number(Number(summary?.total_wages_paid || 0).toFixed(2)),
    },
  };
}
`;

if (!modelContent.includes('getLabourDiary(')) {
  modelContent = modelContent.replace('module.exports = {', diaryCode + '\nmodule.exports = {');
  modelContent = modelContent.replace('  getWorkforceLookup,', '  getWorkforceLookup,\n  getLabourDiary,');
  fs.writeFileSync('server/src/models/labourDirectoryModel.js', modelContent, 'utf8');
  console.log('labourDirectoryModel.js updated with getLabourDiary');
}

// 2. Update hrLabourController.js
let controllerContent = fs.readFileSync('server/src/controllers/hrLabourController.js', 'utf8');

const controllerAdditions = `
const diary = asyncHandler(async (req, res) => {
  const result = await labourDirectoryModel.getLabourDiary({
    ...req.query,
    hrScope: req.hrScope,
  });
  return ok(res, result);
});
`;

if (!controllerContent.includes('const diary =')) {
  controllerContent = controllerContent.replace('module.exports = {', controllerAdditions + '\nmodule.exports = {');
  controllerContent = controllerContent.replace('  history,', '  history,\n  diary,');
  fs.writeFileSync('server/src/controllers/hrLabourController.js', controllerContent, 'utf8');
  console.log('hrLabourController.js updated with diary');
}

// 3. Update hrLabourRoutes.js
let routesContent = fs.readFileSync('server/src/routes/hrLabourRoutes.js', 'utf8');

if (!routesContent.includes('/diary')) {
  routesContent = routesContent.replace(
    "router.get('/lookup', controller.workforceLookup);",
    "router.get('/lookup', controller.workforceLookup);\nrouter.get('/diary', controller.diary);"
  );
  fs.writeFileSync('server/src/routes/hrLabourRoutes.js', routesContent, 'utf8');
  console.log('hrLabourRoutes.js updated with /diary route');
}
