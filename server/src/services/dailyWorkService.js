'use strict';

const ApiError = require('../utils/ApiError');
const dailyWorkModel = require('../models/dailyWorkModel');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');
const materialModel = require('../models/materialModel');
const warehouseModel = require('../models/warehouseModel');
const warehouseService = require('./warehouseService');
const financeModel = require('../models/financeModel');
const taskModel = require('../models/taskModel');
const approvalModel = require('../models/approvalModel');
const notificationModel = require('../models/notificationModel');
const userModel = require('../models/userModel');
const { PROJECT_PHASES_DEF } = require('../config/projectPhases');
const { pool } = require('../config/db');

async function list(query = {}, hrScope) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));

  const contractorId = hrScope?.role === 'contractor' ? hrScope.contractorId : query.contractorId;

  const { rows, total } = await dailyWorkModel.findAll({
    projectId: query.projectId,
    siteId: query.siteId,
    taskId: query.taskId,
    contractorId,
    date: query.date,
    page,
    pageSize,
  });

  const ids = rows.map((r) => r.id);
  const workerCounts = {};
  if (ids.length) {
    const [cRows] = await pool.query(
      `SELECT daily_work_id, COUNT(*) AS cnt FROM task_worker_logs WHERE daily_work_id IN (${ids.map(() => '?').join(',')}) GROUP BY daily_work_id`,
      ids
    );
    cRows.forEach((c) => {
      workerCounts[c.daily_work_id] = Number(c.cnt || 0);
    });
  }

  return {
    updates: rows.map((r) => ({
      id: r.id,
      workerCount: workerCounts[r.id] || 0,
      projectId: r.project_id,
      projectName: r.project_name,
      projectCode: r.project_code,
      siteId: r.site_id,
      siteName: r.site_name,
      contractorId: r.contractor_id,
      contractorName: r.contractor_name,
      taskId: r.task_id,
      taskName: r.task_name,
      taskStatus: r.task_status,
      phaseNumber: r.phase_number,
      phaseTitle: r.phase_title || r.task_name,
      subcategory: r.subcategory || r.task_name,
      materialId: r.material_id,
      materialName: r.material_name,
      materialCode: r.material_code,
      materialCategory: r.material_category,
      quantityUsed: r.quantity_used ? Number(r.quantity_used) : null,
      unit: r.unit || r.material_unit,
      miscAmount: r.misc_amount ? Number(r.misc_amount) : 0,
      miscDescription: r.misc_description,
      miscRemarks: r.misc_remarks,
      warehouseTransactionId: r.warehouse_transaction_id,
      transactionNumber: r.transaction_number,
      expenseId: r.expense_id,
      workDate: r.work_date,
      workDone: r.work_done,
      workStatus: r.work_status,
      progressPercentage: r.progress_percentage,
      remarks: r.remarks,
      createdAt: r.created_at,
      photos: (r.photos || []).map((p) => ({
        id: p.id,
        workUpdateId: p.work_update_id,
        fileName: p.file_name,
        fileType: p.file_type,
        fileSize: p.file_size,
        url: `/api/daily-work/photos/${p.id}`,
        createdAt: p.created_at,
      })),
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id, hrScope) {
  const update = await dailyWorkModel.findById(id);
  if (!update) throw ApiError.notFound('Daily work update not found.');

  if (hrScope?.role === 'contractor' && Number(update.contractor_id) !== Number(hrScope.contractorId)) {
    throw ApiError.notFound('Daily work update not found.');
  }

  // Load material if present for rate calculation
  let material = null;
  if (update.material_id) {
    material = await materialModel.findById(update.material_id);
  }

  // Load workers for this update if any
  const [workers] = await pool.query(
    'SELECT * FROM task_worker_logs WHERE daily_work_id = ? ORDER BY id ASC',
    [id]
  );

  // Load expected assigned labour on this task
  let assignedLabour = [];
  let absentLabour = [];
  if (update.task_id) {
    // Query actual assigned workers from task_assigned_workers first
    let [assignedRows] = await pool.query(
      `SELECT taw.*,
              taw.worker_name AS person_name,
              taw.worker_code AS person_code,
              COALESCE(taw.phone, cw.phone, e.phone) AS person_phone,
              COALESCE(taw.aadhaar_number, cw.aadhaar_number) AS person_aadhaar,
              COALESCE(taw.trade, cw.skill_category, e.designation) AS person_trade,
              taw.worker_type,
              c.name AS contractor_name
       FROM task_assigned_workers taw
       LEFT JOIN contractor_workers cw ON cw.id = taw.worker_id AND taw.worker_type = 'daily_wage'
       LEFT JOIN contractors c ON c.id = cw.contractor_id
       LEFT JOIN employees e ON e.id = taw.worker_id AND taw.worker_type = 'company_employee'
       WHERE taw.task_id = ? ORDER BY taw.id ASC`,
      [update.task_id]
    );

    // Fallback to task_labour if no rows in task_assigned_workers
    if (!assignedRows.length) {
      const [legacyRows] = await pool.query(
        `SELECT tl.*,
                COALESCE(cw.full_name, e.full_name, tl.labour_name) AS person_name,
                COALESCE(cw.worker_code, e.employee_code) AS person_code,
                COALESCE(cw.phone, e.phone) AS person_phone,
                cw.aadhaar_number AS person_aadhaar,
                COALESCE(cw.skill_category, e.designation, tl.skill_trade) AS person_trade,
                tl.worker_type,
                c.name AS contractor_name
         FROM task_labour tl
         LEFT JOIN contractor_workers cw ON cw.id = tl.worker_id AND tl.worker_type = 'labour'
         LEFT JOIN contractors c ON c.id = cw.contractor_id
         LEFT JOIN employees e ON e.id = tl.worker_id AND tl.worker_type = 'company_employee'
         WHERE tl.task_id = ? ORDER BY tl.id ASC`,
        [update.task_id]
      );
      assignedRows = legacyRows;
    }

    const workedNames = new Set(workers.map((w) => (w.worker_name || '').toLowerCase().trim()));
    const workedCodes = new Set(workers.map((w) => (w.worker_code || '').toLowerCase().trim()));

    assignedLabour = assignedRows.map((a) => ({
      id: a.id,
      workerId: a.worker_id,
      workerType: a.worker_type,
      name: a.person_name || 'Worker',
      code: a.person_code || null,
      phone: a.person_phone || null,
      trade: a.person_trade || a.labour_type || 'Labour',
      dailyWage: Number(a.daily_wage || 0),
      workingDays: Number(a.working_days || 0),
      startDate: a.start_date,
      endDate: a.end_date,
      contractorName: a.contractor_name || (a.worker_type === 'company_employee' ? 'Company Internal' : null),
    }));

    absentLabour = assignedLabour.filter((a) => {
      const matchName = workedNames.has((a.name || '').toLowerCase());
      const matchCode = a.code && workedCodes.has(a.code.toLowerCase());
      return !matchName && !matchCode;
    });
  }

  // Linked expense details
  let linkedExpense = null;
  if (update.expense_id) {
    const [expRows] = await pool.query('SELECT * FROM expenses WHERE id = ? LIMIT 1', [update.expense_id]);
    if (expRows.length) {
      const exp = expRows[0];
      linkedExpense = {
        id: exp.id,
        expenseNumber: exp.expense_number,
        category: exp.category,
        description: exp.description,
        amount: Number(exp.amount || 0),
        status: exp.status,
        paymentMethod: exp.payment_method,
      };
    }
  }

  return {
    id: update.id,
    projectId: update.project_id,
    projectName: update.project_name,
    projectCode: update.project_code,
    siteId: update.site_id,
    siteName: update.site_name,
    contractorId: update.contractor_id,
    contractorName: update.contractor_name,
    taskId: update.task_id,
    taskName: update.task_name,
    taskStatus: update.task_status,
    phaseNumber: update.phase_number,
    phaseTitle: update.phase_title || update.task_name,
    subcategory: update.subcategory || update.task_name,
    materialId: update.material_id,
    materialName: update.material_name,
    materialCode: update.material_code,
    materialCategory: update.material_category,
    quantityUsed: update.quantity_used ? Number(update.quantity_used) : null,
    unit: update.unit || update.material_unit,
    warehouseTransactionId: update.warehouse_transaction_id,
    transactionNumber: update.transaction_number,
    expenseId: update.expense_id,
    linkedExpense,
    workDate: update.work_date,
    workDone: update.work_done,
    workStatus: update.work_status,
    progressPercentage: update.progress_percentage,
    remarks: update.remarks,
    miscAmount: update.misc_amount ? Number(update.misc_amount) : 0,
    miscDescription: update.misc_description,
    miscRemarks: update.misc_remarks,
    totalDailyExpense: Number(
      (
        workers.reduce((s, w) => s + (Number(w.hours_worked || 8) / 8) * Number(w.daily_wage || 0), 0) +
        (update.quantity_used ? Number(update.quantity_used) * Number(material ? material.default_rate || 0 : 0) : 0) +
        Number(update.misc_amount || 0)
      ).toFixed(2)
    ),
    createdAt: update.created_at,
    workers: workers.map((w) => ({
      id: w.id,
      workerName: w.worker_name,
      workerCode: w.worker_code,
      labourType: w.labour_type,
      hoursWorked: Number(w.hours_worked || 8),
      dailyWage: Number(w.daily_wage || 0),
      workPerformed: w.work_performed,
    })),
    assignedLabour,
    absentLabour,
    labourComparison: {
      totalAssigned: assignedLabour.length,
      totalWorkedToday: workers.length,
      totalAbsent: absentLabour.length,
    },
    photos: (update.photos || []).map((p) => ({
      id: p.id,
      workUpdateId: p.work_update_id,
      fileName: p.file_name,
      fileType: p.file_type,
      fileSize: p.file_size,
      url: `/api/daily-work/photos/${p.id}`,
      createdAt: p.created_at,
    })),
  };
}

async function create(payload, files, hrScope, userId) {
  const projectId = Number(payload.project_id);
  const siteId = payload.site_id ? Number(payload.site_id) : null;
  const taskId = payload.task_id ? Number(payload.task_id) : null;
  const workDate = payload.work_date || new Date().toISOString().slice(0, 10);
  const materialId = payload.material_id ? Number(payload.material_id) : null;
  const quantityUsed = payload.quantity_used ? Number(payload.quantity_used) : 0;

  // Contractor scope validation
  let contractorId = payload.contractor_id ? Number(payload.contractor_id) : null;
  if (hrScope?.role === 'contractor') {
    contractorId = Number(hrScope.contractorId);
  }

  if (!contractorId) {
    throw ApiError.badRequest('Contractor must be specified.');
  }

  // Verify project
  const project = await projectModel.findById(projectId);
  if (!project) throw ApiError.badRequest('Specified project does not exist.');

  // Verify site if provided
  if (siteId) {
    const site = await siteModel.findById(siteId);
    if (!site || Number(site.project_id) !== projectId) {
      throw ApiError.badRequest('Specified site does not belong to the project.');
    }

    if (hrScope?.role === 'contractor') {
      const isAssigned = Number(site.contractor_id) === contractorId || Number(project.contractor_id) === contractorId;
      if (!isAssigned) {
        throw ApiError.forbidden('You are not assigned to this project or site.');
      }
    }
  }

  // Task & Phase handling
  let task = null;
  let phaseTitle = payload.phase_title || null;
  let phaseNumber = payload.phase_number ? Number(payload.phase_number) : null;
  let subcategory = (payload.subcategory || '').trim();

  // Parse workers if provided
  let workersList = [];
  if (typeof payload.workers === 'string') {
    try { workersList = JSON.parse(payload.workers); } catch (e) { workersList = []; }
  } else if (Array.isArray(payload.workers)) {
    workersList = payload.workers;
  }

  // Budget exceeded pre-check
  let budgetExceededInfo = null;
  if (taskId) {
    const taskDetail = await taskModel.findTaskById(taskId);
    if (!taskDetail) throw ApiError.badRequest('Specified task does not exist.');
    if (Number(taskDetail.project_id) !== projectId) {
      throw ApiError.badRequest('Specified task does not belong to this project.');
    }
    if (siteId && taskDetail.site_id && Number(taskDetail.site_id) !== siteId) {
      throw ApiError.badRequest('Specified task does not belong to this site.');
    }
    task = taskDetail;
    phaseTitle = task.name;
    if (!subcategory) subcategory = task.name;

    // Calculate this update's incoming costs
    let incomingMaterialCost = 0;
    if (materialId && quantityUsed > 0) {
      const mat = await materialModel.findById(materialId);
      if (mat) {
        incomingMaterialCost = Number((quantityUsed * Number(mat.default_rate || 0)).toFixed(2));
      }
    }

    const incomingMiscCost = payload.misc_amount ? Number(payload.misc_amount) : 0;

    let incomingLabourCost = 0;
    for (const w of workersList) {
      const name = (w.worker_name || w.workerName || '').trim();
      const workerType = w.worker_type || w.workerType || (String(w.labour_type || w.labourType || '').toLowerCase().includes('company') ? 'company_employee' : 'labour');
      if (name && workerType !== 'company_employee') {
        const hours = Number(w.hours_worked || w.hoursWorked || 8.0);
        const wage = Number(w.daily_wage || w.dailyWage || 0.0);
        incomingLabourCost += (hours / 8.0) * wage;
      }
    }
    incomingLabourCost = Number(incomingLabourCost.toFixed(2));
    const thisUpdateCost = Number((incomingMaterialCost + incomingMiscCost + incomingLabourCost).toFixed(2));

    if (thisUpdateCost > 0) {
      const currentActual = Number(taskDetail.budgetUtilization?.total?.actual || 0);
      const effectiveApprovedBudget = Number(taskDetail.budgetUtilization?.total?.effectiveBudget || Number(task.total_budget || 0));
      const projectedTotal = Number((currentActual + thisUpdateCost).toFixed(2));

      if (projectedTotal > effectiveApprovedBudget) {
        const excessReason = (payload.excess_reason || '').trim();
        if (!excessReason) {
          throw ApiError.badRequest(
            `This update will exceed the approved task budget of ₹${effectiveApprovedBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })} by ₹${(projectedTotal - effectiveApprovedBudget).toLocaleString('en-IN', { minimumFractionDigits: 2 })} (projected total: ₹${projectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}). A mandatory excess budget reason/justification is required before submission.`
          );
        }
        budgetExceededInfo = {
          approvedBudget: effectiveApprovedBudget,
          currentActual,
          thisUpdateCost,
          projectedTotal,
          requestedExcess: Number((projectedTotal - effectiveApprovedBudget).toFixed(2)),
          excessReason,
        };
      }
    }
  } else if (phaseNumber) {
    const phaseDef = PROJECT_PHASES_DEF.find((p) => p.phase_number === phaseNumber);
    if (phaseDef) {
      phaseTitle = phaseDef.title;
      if (!subcategory && phaseDef.subcategories.length > 0) {
        subcategory = phaseDef.subcategories[0];
      }
    }
  }

  // Process Material Consumption if provided
  let issueTx = null;
  let expenseId = null;
  let material = null;

  if (materialId && quantityUsed > 0) {
    await warehouseModel.ensureContractorWarehouses();
    const { contractors } = await warehouseModel.findScopes();
    const warehouse = contractors.find((c) => Number(c.contractor_id) === contractorId);
    if (!warehouse) throw ApiError.badRequest('That contractor has no warehouse configured.');

    material = await materialModel.findById(materialId);
    if (!material) throw ApiError.badRequest('Selected material does not exist.');

    const available = await warehouseModel.totalForMaterial(warehouse.id, materialId);
    if (quantityUsed > Number(available || 0)) {
      throw ApiError.badRequest(`Only ${Number(available || 0)} ${material.unit} available in your inventory. Cannot exceed stock.`);
    }

    const taskLabel = task ? `Task: ${task.name}` : `Phase ${phaseNumber || ''} (${subcategory})`;

    issueTx = await warehouseService.issueStock({
      material_id: materialId,
      warehouse_id: warehouse.id,
      project_id: projectId,
      site_id: siteId,
      quantity: quantityUsed,
      unit: material.unit,
      reference: `CONSUMPTION-${workDate}`,
      notes: `${taskLabel}: ${payload.remarks || 'Daily work usage'}`,
      transaction_date: workDate,
    }, userId);

    const unitRate = Number(material.default_rate || 0);
    const totalAmount = Number((quantityUsed * unitRate).toFixed(2));
    const expenseNumber = `EXP-DWU-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 900 + 100)}`;

    expenseId = await financeModel.createExpense({
      expense_number: expenseNumber,
      project_id: projectId,
      site_id: siteId,
      contractor_id: contractorId,
      task_id: task ? task.id : null,
      category: 'Material Consumption',
      description: `Consumed ${quantityUsed} ${material.unit} of ${material.name} (${task ? task.name : subcategory})`,
      amount: totalAmount,
      expense_date: workDate,
      paid_by: 'Contractor Inventory',
      party_name: material.name,
      payment_method: 'other',
      reference: issueTx.transactionNumber || issueTx.transaction_number,
      status: 'approved',
      notes: payload.remarks ? `${taskLabel}: ${payload.remarks}` : taskLabel,
      created_by: userId,
    });
  }

  const workDoneText = payload.work_done?.trim()
    || (material ? `Material Used: ${quantityUsed} ${material.unit} of ${material.name}` : (task ? `${task.name} site work` : 'Site work'));

  // Miscellaneous expense processing
  const miscAmount = payload.misc_amount ? Number(payload.misc_amount) : 0;
  const miscDescription = (payload.misc_description || '').trim();
  const miscRemarks = (payload.misc_remarks || '').trim();

  if (miscAmount > 0) {
    const miscExpenseNumber = `EXP-MISC-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 900 + 100)}`;
    await financeModel.createExpense({
      expense_number: miscExpenseNumber,
      project_id: projectId,
      site_id: siteId,
      contractor_id: contractorId,
      task_id: task ? task.id : null,
      category: 'Miscellaneous',
      description: miscDescription || `Daily misc expense (${task ? task.name : 'Site'})`,
      amount: miscAmount,
      expense_date: workDate,
      paid_by: 'Contractor Daily Operational',
      party_name: 'Site Operational Misc',
      payment_method: 'other',
      reference: `DWU-MISC-${workDate}`,
      status: 'approved',
      notes: miscRemarks || null,
      created_by: userId,
    });
  }

  const updateId = await dailyWorkModel.createUpdate({
    project_id: projectId,
    site_id: siteId,
    contractor_id: contractorId,
    task_id: task ? task.id : null,
    phase_number: phaseNumber,
    phase_title: phaseTitle,
    subcategory,
    material_id: materialId,
    quantity_used: quantityUsed > 0 ? quantityUsed : null,
    unit: material ? material.unit : null,
    warehouse_transaction_id: issueTx ? issueTx.id : null,
    expense_id: expenseId,
    work_date: workDate,
    work_done: workDoneText,
    work_status: payload.work_status || 'in-progress',
    progress_percentage: Math.min(100, Math.max(0, Number(payload.progress_percentage || 0))),
    remarks: payload.remarks,
    created_by: userId,
    misc_description: miscDescription || null,
    misc_amount: miscAmount,
    misc_remarks: miscRemarks || null,
  });

  // Attach photos
  if (files && files.length) {
    for (const f of files) {
      await dailyWorkModel.addPhoto({
        work_update_id: updateId,
        project_id: projectId,
        site_id: siteId,
        task_id: task ? task.id : null,
        phase_number: phaseNumber,
        subcategory,
        file_path: f.path || f.file_path || f.filename || 'uploads/work-photos/mock.jpg',
        file_name: f.originalname || f.filename || f.file_name || 'photo.jpg',
        file_type: f.mimetype || f.file_type || 'image/jpeg',
        file_size: f.size || f.file_size || 0,
      });
    }
  }

  // Update progress
  const progressNum = Math.min(100, Math.max(0, Number(payload.progress_percentage || 0)));

  if (task) {
    // Update task progress & status
    await pool.query(
      'UPDATE project_tasks SET progress = GREATEST(progress, ?) WHERE id = ?',
      [progressNum, task.id]
    );
    if (progressNum === 100 || payload.work_status === 'completed') {
      await pool.query("UPDATE project_tasks SET status = 'completed' WHERE id = ?", [task.id]);
    }

    // Process workers if submitted with daily update
    for (const w of workersList) {
      const name = (w.worker_name || w.workerName || '').trim();
      if (name) {
        await taskModel.addWorkerLog({
          task_id: task.id,
          project_id: projectId,
          site_id: siteId,
          contractor_id: contractorId,
          daily_work_id: updateId,
          worker_id: w.worker_id || w.workerId || null,
          worker_type: w.worker_type || w.workerType || (String(w.labour_type || w.labourType || '').toLowerCase().includes('company') ? 'company_employee' : 'labour'),
          worker_name: name,
          worker_code: w.worker_code || w.workerCode || w.worker_id || null,
          labour_type: (w.labour_type || w.labourType || 'Labour').trim(),
          work_date: workDate,
          hours_worked: Number(w.hours_worked || w.hoursWorked || 8.0),
          daily_wage: Number(w.daily_wage || w.dailyWage || 0.0),
          work_performed: (w.work_performed || w.workPerformed) ? String(w.work_performed || w.workPerformed).trim() : null,
          created_by: userId,
        });
      }
    }

    // If task budget was exceeded, create approval request, audit record, and notify admin
    if (budgetExceededInfo) {
      let requesterName = 'Contractor';
      if (userId) {
        const u = await userModel.findById(userId).catch(() => null);
        if (u?.full_name) requesterName = u.full_name;
      }

      // 1. Create approval request
      const approvalReqId = await approvalModel.create({
        project_id: projectId,
        site_id: siteId,
        request_type: 'task_budget_exceeded',
        title: `Task Budget Exceeded: ${task.name} (+₹${budgetExceededInfo.requestedExcess.toLocaleString('en-IN', { minimumFractionDigits: 2 })})`,
        requested_by: requesterName,
        amount: budgetExceededInfo.requestedExcess,
        details: JSON.stringify({
          taskId: task.id,
          taskName: task.name,
          originalBudget: Number(task.total_budget || 0),
          approvedAdditional: Number(task.approved_additional_budget || 0),
          currentApprovedBudget: budgetExceededInfo.approvedBudget,
          currentActual: budgetExceededInfo.currentActual,
          incomingCost: budgetExceededInfo.thisUpdateCost,
          projectedTotal: budgetExceededInfo.projectedTotal,
          requestedExcess: budgetExceededInfo.requestedExcess,
          reason: budgetExceededInfo.excessReason,
        }),
        requested_on: workDate,
      });

      // 2. Insert into task_budget_approvals audit trail
      await pool.query(
        `INSERT INTO task_budget_approvals
         (task_id, project_id, site_id, category, budget_amount, actual_amount, requested_excess, reason, status, requested_by, approval_request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          task.id,
          projectId,
          siteId,
          'Task Total',
          budgetExceededInfo.approvedBudget,
          budgetExceededInfo.projectedTotal,
          budgetExceededInfo.requestedExcess,
          budgetExceededInfo.excessReason,
          userId,
          approvalReqId,
        ]
      );

      // 3. Update task pending_excess_budget and excess_reason (original total_budget is UNCHANGED!)
      await pool.query(
        `UPDATE project_tasks
         SET pending_excess_budget = pending_excess_budget + ?,
             excess_reason = ?
         WHERE id = ?`,
        [budgetExceededInfo.requestedExcess, budgetExceededInfo.excessReason, task.id]
      );

      // 4. Create admin notification
      await notificationModel.create({
        role: 'admin',
        title: `Task Budget Exceeded: ${task.name}`,
        message: `Task "${task.name}" in project "${project.name}" requires excess budget approval of ₹${budgetExceededInfo.requestedExcess.toLocaleString('en-IN', { minimumFractionDigits: 2 })}. Reason: ${budgetExceededInfo.excessReason}`,
        type: 'warning',
        category: 'approvals',
        actionUrl: '/admin/approvals',
        metadata: {
          taskId: task.id,
          projectId,
          siteId,
          approvalRequestId: approvalReqId,
          requestedExcess: budgetExceededInfo.requestedExcess,
        },
      });
    }
  } else if (phaseNumber) {
    // Legacy phase progress update
    await pool.query(
      'UPDATE project_phases SET progress = GREATEST(progress, ?) WHERE project_id = ? AND phase_number = ?',
      [progressNum, projectId, phaseNumber]
    );
  }

  return getById(updateId, hrScope);
}

module.exports = { list, getById, create };
