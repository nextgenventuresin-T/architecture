'use strict';

const { pool } = require('../config/db');

/**
 * Unified Labour Directory & Workforce Tracking Model.
 * Provides unified queries for both Contractor Labour and Company Employees,
 * their current Project/Site/Task assignments, today's work status,
 * and historical work logs.
 */

async function getDirectory({
  page = 1,
  pageSize = 20,
  search = '',
  projectId = null,
  siteId = null,
  taskId = null,
  contractorId = null,
  status = 'all',
  workerType = 'all',
  todayStatus = 'all',
  hrScope = null,
} = {}) {
  const offset = (Number(page) - 1) * Number(pageSize);
  const whereClauses = [];
  const params = [];

  // Scoping for contractor role
  let effectiveContractorId = null;
  if (hrScope?.role === 'contractor') {
    effectiveContractorId = Number(hrScope.contractorId);
  } else if (contractorId) {
    effectiveContractorId = Number(contractorId);
  }

  // Query for Contractor Labour / Daily Wage Workers and In-House Company Labour (Decoupled from Employees)
  let unionQuery = `
    SELECT
      w.id AS raw_id,
      CASE WHEN w.is_company_labour = 1 OR w.worker_type = 'company_labour' THEN 'company_labour' ELSE 'daily_wage' END AS worker_type,
      CASE WHEN w.is_company_labour = 1 OR w.worker_type = 'company_labour' THEN 'Company Labour' ELSE 'Daily Wage Worker' END AS worker_type_label,
      w.worker_code AS code,
      w.full_name AS name,
      w.phone,
      w.aadhaar_number,
      NULL AS department,
      w.skill_category AS trade,
      CASE WHEN w.is_company_labour = 1 OR w.worker_type = 'company_labour' THEN 0.00 ELSE w.daily_rate END AS daily_rate,
      w.status,
      w.notes,
      w.joining_date,
      w.is_company_labour,
      w.contractor_id,
      COALESCE(c.name, 'Company Labour (In-House)') AS contractor_name,
      cur_task.task_id,
      cur_task.task_name,
      cur_task.project_id,
      cur_task.project_name,
      cur_task.site_id,
      cur_task.site_name,
      cur_task.start_date,
      cur_task.end_date,
      cur_task.expected_days,
      cur_task.remarks AS assignment_remarks,
      today_log.id AS today_log_id,
      today_log.hours_worked AS today_hours,
      today_log.work_performed AS today_work,
      today_log.task_id AS today_task_id,
      today_log.task_name AS today_task_name
    FROM contractor_workers w
    LEFT JOIN contractors c ON c.id = w.contractor_id
    LEFT JOIN (
      SELECT
        ta.worker_id,
        ta.task_id,
        pt.name AS task_name,
        pt.project_id,
        p.name AS project_name,
        pt.site_id,
        s.name AS site_name,
        ta.start_date,
        ta.end_date,
        ta.expected_days,
        ta.remarks,
        ROW_NUMBER() OVER (PARTITION BY ta.worker_id ORDER BY ta.id DESC) AS rn
      FROM (
        SELECT worker_id, task_id, start_date, end_date, expected_days, remarks, id FROM task_assigned_workers
        UNION ALL
        SELECT worker_id, task_id, start_date, end_date, working_days AS expected_days, remarks, id FROM task_labour WHERE worker_id IS NOT NULL
      ) ta
      JOIN project_tasks pt ON pt.id = ta.task_id
      JOIN projects p ON p.id = pt.project_id
      LEFT JOIN sites s ON s.id = pt.site_id
    ) cur_task ON cur_task.worker_id = w.id AND cur_task.rn = 1
    LEFT JOIN (
      SELECT
        twl.id,
        twl.worker_id,
        twl.worker_name,
        twl.hours_worked,
        twl.work_performed,
        twl.task_id,
        pt2.name AS task_name,
        ROW_NUMBER() OVER (PARTITION BY COALESCE(twl.worker_id, twl.worker_name) ORDER BY twl.id DESC) AS rn
      FROM task_worker_logs twl
      JOIN project_tasks pt2 ON pt2.id = twl.task_id
      WHERE twl.work_date = CURDATE()
    ) today_log ON (today_log.worker_id = w.id OR today_log.worker_name = w.full_name) AND today_log.rn = 1
  `;

  // Apply filters on the unified result set
  if (effectiveContractorId) {
    whereClauses.push('(contractor_id = ? OR worker_type = \'company_labour\')');
    params.push(effectiveContractorId);
  }

  if (workerType && workerType !== 'all') {
    if (workerType === 'daily_wage' || workerType === 'labour') {
      whereClauses.push("worker_type = 'daily_wage'");
    } else if (workerType === 'company_labour' || workerType === 'company_employee') {
      whereClauses.push("worker_type = 'company_labour'");
    } else {
      whereClauses.push('worker_type = ?');
      params.push(workerType);
    }
  }

  if (status && status !== 'all') {
    whereClauses.push('status = ?');
    params.push(status);
  }

  if (projectId) {
    whereClauses.push('project_id = ?');
    params.push(Number(projectId));
  }

  if (siteId) {
    whereClauses.push('site_id = ?');
    params.push(Number(siteId));
  }

  if (taskId) {
    whereClauses.push('task_id = ?');
    params.push(Number(taskId));
  }

  if (search && search.trim()) {
    whereClauses.push('(name LIKE ? OR code LIKE ? OR phone LIKE ? OR trade LIKE ?)');
    const term = `%${search.trim()}%`;
    params.push(term, term, term, term);
  }

  if (todayStatus && todayStatus !== 'all') {
    if (todayStatus === 'worked') {
      whereClauses.push('today_log_id IS NOT NULL');
    } else if (todayStatus === 'not_worked') {
      whereClauses.push('today_log_id IS NULL');
    } else if (todayStatus === 'assigned') {
      whereClauses.push('task_id IS NOT NULL AND today_log_id IS NULL');
    } else if (todayStatus === 'available') {
      whereClauses.push('task_id IS NULL');
    }
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // Get total count
  const countSql = `SELECT COUNT(*) AS total FROM (${unionQuery}) u ${whereSql}`;
  const [[{ total }]] = await pool.query(countSql, params);

  // Get paginated data
  const dataSql = `
    SELECT * FROM (${unionQuery}) u
    ${whereSql}
    ORDER BY
      CASE WHEN today_log_id IS NOT NULL THEN 0 ELSE 1 END,
      name ASC
    LIMIT ? OFFSET ?
  `;
  const [rawRows] = await pool.query(dataSql, [...params, Number(pageSize), Number(offset)]);

  const rows = rawRows.map((r) => {
    let todayWorkStatus = 'available';
    let todayWorkLabel = 'Available';

    if (r.today_log_id) {
      todayWorkStatus = 'worked';
      todayWorkLabel = 'Worked Today';
    } else if (r.task_id) {
      todayWorkStatus = 'assigned';
      todayWorkLabel = 'Assigned';
    }

    return {
      id: `${r.worker_type}-${r.raw_id}`,
      workerId: r.raw_id,
      workerType: r.worker_type,
      workerTypeLabel: r.worker_type_label,
      workerCode: r.code,
      fullName: r.name,
      phone: r.phone,
      aadhaarNumber: r.aadhaar_number || null,
      department: r.department || null,
      skillCategory: r.trade,
      dailyRate: Number(r.daily_rate || 0),
      status: r.status,
      notes: r.notes || null,
      joiningDate: r.joining_date || null,
      isCompanyLabour: Boolean(r.is_company_labour || r.worker_type === 'company_labour'),
      contractorId: r.contractor_id,
      contractorName: r.contractor_name,
      currentProject: r.project_name || null,
      projectId: r.project_id || null,
      currentSite: r.site_name || null,
      siteId: r.site_id || null,
      currentTask: r.task_name || null,
      taskId: r.task_id || null,
      startDate: r.start_date || null,
      endDate: r.end_date || null,
      expectedDays: r.expected_days ? Number(r.expected_days) : null,
      remarks: r.assignment_remarks || null,
      todayStatus: todayWorkStatus,
      todayStatusLabel: todayWorkLabel,
      todayHours: r.today_hours ? Number(r.today_hours) : null,
      todayWork: r.today_work || null,
      todayTaskName: r.today_task_name || null,
    };
  });

  return { rows, total, workers: rows };
}

/**
 * Worker Work History profile query (Decoupled from Employees)
 */
async function getWorkHistory(workerId, workerType) {
  const wId = Number(workerId);

  // Get worker info from contractor_workers
  const [cwRows] = await pool.query(
    `SELECT w.id, w.worker_code AS code, w.full_name AS name, w.phone, w.aadhaar_number, w.skill_category AS trade, w.status,
            w.daily_rate, w.worker_type, w.is_company_labour,
            COALESCE(c.name, 'Company Labour (In-House)') AS contractor_name
     FROM contractor_workers w
     LEFT JOIN contractors c ON c.id = w.contractor_id
     WHERE w.id = ? LIMIT 1`,
    [wId]
  );

  if (!cwRows.length) return null;

  const w = cwRows[0];
  const isCompany = w.is_company_labour === 1 || w.worker_type === 'company_labour' || workerType === 'company_labour';
  const workerInfo = {
    ...w,
    workerType: isCompany ? 'company_labour' : 'daily_wage',
    dailyRate: isCompany ? 0 : Number(w.daily_rate || 0),
    contractor_name: isCompany ? 'Company Labour (In-House)' : (w.contractor_name || 'Contractor'),
  };

  // Retrieve work logs
  const [logs] = await pool.query(
    `SELECT
       twl.id,
       twl.work_date,
       twl.hours_worked,
       twl.daily_wage,
       twl.work_performed,
       twl.worker_type,
       twl.labour_type,
       twl.created_at,
       pt.name AS task_name,
       p.name AS project_name,
       p.code AS project_code,
       s.name AS site_name,
       COALESCE(c.name, 'Company Labour (In-House)') AS contractor_name,
       u.full_name AS logged_by_name
     FROM task_worker_logs twl
     JOIN project_tasks pt ON pt.id = twl.task_id
     JOIN projects p ON p.id = twl.project_id
     LEFT JOIN sites s ON s.id = twl.site_id
     LEFT JOIN contractors c ON c.id = twl.contractor_id
     LEFT JOIN users u ON u.id = twl.created_by
     WHERE twl.worker_id = ?
        OR (twl.worker_name = ? AND twl.worker_id IS NULL)
     ORDER BY twl.work_date DESC, twl.id DESC`,
    [wId, workerInfo.name]
  );

  let totalHours = 0;
  let totalCost = 0;
  const history = logs.map((l) => {
    const hours = Number(l.hours_worked || 8);
    const isCompanyLog = isCompany || l.worker_type === 'company_labour' || l.worker_type === 'company_employee' || String(l.labour_type || '').toLowerCase().includes('company');
    const wage = isCompanyLog ? 0 : Number(l.daily_wage || workerInfo.dailyRate || 0);
    const earned = isCompanyLog ? 0 : (hours / 8) * wage;
    totalHours += hours;
    totalCost += earned;

    return {
      id: l.id,
      date: l.work_date,
      projectName: l.project_name,
      projectCode: l.project_code,
      siteName: l.site_name || '—',
      taskName: l.task_name,
      workPerformed: l.work_performed || 'Site labour work',
      hoursWorked: hours,
      daysWorked: Number((hours / 8).toFixed(1)),
      dailyWage: wage,
      earnedAmount: Number(earned.toFixed(2)),
      contractorName: l.contractor_name || workerInfo.contractor_name,
      loggedBy: l.logged_by_name || 'System',
      createdAt: l.created_at,
    };
  });

  // Calculate monthly work history breakdown
  const monthlyMap = new Map();
  for (const item of history) {
    let ym = 'Unknown';
    if (item.date) {
      if (typeof item.date === 'string') {
        ym = item.date.slice(0, 7);
      } else {
        const d = new Date(item.date);
        ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
    }
    const key = `${ym}_${item.projectName}_${item.siteName}_${item.taskName}`;
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, {
        month: ym,
        projectName: item.projectName,
        siteName: item.siteName,
        taskName: item.taskName,
        daysWorked: 0,
        dailyWage: item.dailyWage,
        totalCost: 0,
      });
    }
    const entry = monthlyMap.get(key);
    entry.daysWorked = Number((entry.daysWorked + item.daysWorked).toFixed(1));
    entry.totalCost = Number((entry.totalCost + item.earnedAmount).toFixed(2));
  }
  const monthlyBreakdown = Array.from(monthlyMap.values());

  return {
    worker: workerInfo,
    history,
    monthlyBreakdown,
    summary: {
      totalWorkEntries: history.length,
      totalDaysWorked: Number((totalHours / 8).toFixed(1)),
      totalHoursWorked: totalHours,
      totalEarned: Number(totalCost.toFixed(2)),
    },
  };
}

/**
 * Workforce Lookup for Task Budget Assignment and Contractor Daily Work dropdowns.
 * Strictly returns Daily-Wage Workers and In-House Company Labour.
 * Employees (office staff/management) are NEVER included here!
 */
async function getWorkforceLookup({ hrScope = null, search = '' } = {}) {
  const whereCw = ["w.status = 'active'"];
  const paramsCw = [];

  if (hrScope?.role === 'contractor') {
    whereCw.push('(w.contractor_id = ? OR w.is_company_labour = 1 OR w.worker_type = "company_labour")');
    paramsCw.push(Number(hrScope.contractorId));
  }

  if (search && search.trim()) {
    whereCw.push('(w.full_name LIKE ? OR w.worker_code LIKE ?)');
    paramsCw.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  const [contractorWorkers] = await pool.query(
    `SELECT
       w.id,
       CASE WHEN w.is_company_labour = 1 OR w.worker_type = 'company_labour' THEN 'company_labour' ELSE 'daily_wage' END AS worker_type,
       CASE WHEN w.is_company_labour = 1 OR w.worker_type = 'company_labour' THEN 'Company Labour' ELSE 'Daily Wage Worker' END AS worker_type_label,
       w.worker_code AS code,
       w.full_name AS name,
       w.phone,
       w.skill_category AS trade,
       CASE WHEN w.is_company_labour = 1 OR w.worker_type = 'company_labour' THEN 0.00 ELSE w.daily_rate END AS daily_rate,
       w.aadhaar_number AS aadhaar_number,
       w.contractor_id,
       COALESCE(c.name, 'Company Labour (In-House)') AS contractor_name,
       w.is_company_labour
     FROM contractor_workers w
     LEFT JOIN contractors c ON c.id = w.contractor_id
     WHERE ${whereCw.join(' AND ')}
     ORDER BY w.is_company_labour DESC, w.full_name ASC`,
    paramsCw
  );

  return contractorWorkers.map((item) => {
    const isCompany = item.is_company_labour === 1 || item.worker_type === 'company_labour';
    return {
      id: `${item.worker_type}-${item.id}`,
      workerId: item.id,
      workerType: item.worker_type,
      workerTypeLabel: item.worker_type_label,
      code: item.code,
      name: item.name,
      phone: item.phone,
      aadhaarNumber: item.aadhaar_number || null,
      trade: item.trade || 'General Labour',
      dailyRate: isCompany ? 0 : Number(item.daily_rate || 0),
      contractorId: item.contractor_id,
      contractorName: item.contractor_name,
      label: `${item.name} (${item.trade || item.worker_type_label}) — ${isCompany ? 'Company Labour (₹0 Cost)' : item.contractor_name}`,
    };
  });
}

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
    whereClauses.push('(twl.contractor_id = ? OR twl.worker_type = "company_labour")');
    params.push(Number(hrScope.contractorId));
  }

  if (workerId && workerId !== 'all') {
    whereClauses.push('twl.worker_id = ?');
    params.push(Number(workerId));
  }
  if (workerType && workerType !== 'all') {
    if (workerType === 'daily_wage' || workerType === 'labour') {
      whereClauses.push("twl.worker_type = 'daily_wage'");
    } else if (workerType === 'company_labour' || workerType === 'company_employee') {
      whereClauses.push("(twl.worker_type = 'company_labour' OR twl.worker_type = 'company_employee')");
    } else {
      whereClauses.push('twl.worker_type = ?');
      params.push(workerType);
    }
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
    params.push(...Array(5).fill(`%${search.trim()}%`));
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT
       twl.id,
       twl.work_date,
       twl.worker_id,
       twl.worker_type,
       twl.worker_name,
       twl.worker_code,
       COALESCE(twl.aadhaar_number, cw.aadhaar_number) AS aadhaar_number,
       cw.phone AS phone,
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
       COALESCE(c.name, 'Company Labour (In-House)') AS contractor_name,
       dwu.remarks AS daily_remarks
     FROM task_worker_logs twl
     JOIN project_tasks pt ON pt.id = twl.task_id
     JOIN projects p ON p.id = twl.project_id
     LEFT JOIN sites s ON s.id = twl.site_id
     LEFT JOIN contractors c ON c.id = twl.contractor_id
     LEFT JOIN contractor_workers cw ON cw.id = twl.worker_id
     LEFT JOIN daily_work_updates dwu ON dwu.id = twl.daily_work_id
     ${whereSql}
     ORDER BY twl.work_date DESC, twl.id DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM task_worker_logs twl
     JOIN project_tasks pt ON pt.id = twl.task_id
     JOIN projects p ON p.id = twl.project_id
     LEFT JOIN sites s ON s.id = twl.site_id
     LEFT JOIN contractors c ON c.id = twl.contractor_id
     LEFT JOIN contractor_workers cw ON cw.id = twl.worker_id
     LEFT JOIN daily_work_updates dwu ON dwu.id = twl.daily_work_id
     ${whereSql}`,
    params
  );

  const [[summary]] = await pool.query(
    `SELECT
       COUNT(*) AS total_logs,
       COUNT(DISTINCT COALESCE(twl.worker_id, twl.worker_name)) AS unique_workers,
       COALESCE(SUM(twl.hours_worked / 8), 0) AS total_days_worked,
       COALESCE(SUM(CASE WHEN twl.worker_type IN ('company_labour', 'company_employee') OR LOWER(COALESCE(twl.labour_type, '')) LIKE '%company%' THEN 0 ELSE (twl.hours_worked / 8) * twl.daily_wage END), 0) AS total_wages_paid
     FROM task_worker_logs twl
     JOIN project_tasks pt ON pt.id = twl.task_id
     JOIN projects p ON p.id = twl.project_id
     LEFT JOIN sites s ON s.id = twl.site_id
     ${whereSql}`,
    params
  );

  return {
    rows: rows.map((r) => {
      const hours = Number(r.hours_worked || 8);
      const isCompany = r.worker_type === 'company_labour' || r.worker_type === 'company_employee' || String(r.labour_type || '').toLowerCase().includes('company');
      const wage = isCompany ? 0 : Number(r.daily_wage || 0);
      const earned = isCompany ? 0 : (hours / 8) * wage;
      return {
        id: r.id,
        date: r.work_date,
        work_date: r.work_date,
        workerId: r.worker_id,
        worker_id: r.worker_id,
        workerType: isCompany ? 'company_labour' : (r.worker_type || 'daily_wage'),
        worker_type: isCompany ? 'company_labour' : (r.worker_type || 'daily_wage'),
        is_company_labour: isCompany ? 1 : 0,
        workerTypeLabel: isCompany ? 'Company Labour' : 'Daily Wage Worker',
        workerName: r.worker_name,
        worker_name: r.worker_name,
        workerCode: r.worker_code,
        worker_code: r.worker_code,
        phone: r.phone,
        aadhaarNumber: r.aadhaar_number,
        aadhaar_number: r.aadhaar_number,
        trade: r.labour_type,
        labour_type: r.labour_type,
        hoursWorked: hours,
        hours_worked: hours,
        daysWorked: Number((hours / 8).toFixed(1)),
        days_worked: Number((hours / 8).toFixed(1)),
        dailyWage: wage,
        daily_wage: wage,
        earnedAmount: Number(earned.toFixed(2)),
        earned_amount: Number(earned.toFixed(2)),
        taskId: r.task_id,
        task_id: r.task_id,
        taskName: r.task_name,
        task_name: r.task_name,
        projectId: r.project_id,
        project_id: r.project_id,
        projectName: r.project_name,
        project_name: r.project_name,
        projectCode: r.project_code,
        project_code: r.project_code,
        siteId: r.site_id,
        site_id: r.site_id,
        siteName: r.site_name || '—',
        site_name: r.site_name || '—',
        contractorName: r.contractor_name || '—',
        contractor_name: r.contractor_name || '—',
        workDone: r.work_performed || 'Site labour execution',
        work_performed: r.work_performed || 'Site labour execution',
        remarks: r.daily_remarks || '',
        daily_remarks: r.daily_remarks || '',
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

module.exports = {
  getDirectory,
  getWorkHistory,
  getWorkforceLookup,
  getLabourDiary,
};
