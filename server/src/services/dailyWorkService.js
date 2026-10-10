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
const { getConsumptionUnitCost } = require('../utils/materialPricing');
const pmScope = require('./pmScopeService');
const { resolveSubtask, subtaskIdFrom } = require('./subtaskLink');

/** The warehouse row that belongs to a contractor (null when none is provisioned). */
async function contractorWarehouseFor(contractorId) {
  await warehouseModel.ensureContractorWarehouses();
  const { contractors } = await warehouseModel.findScopes();
  return contractors.find((c) => Number(c.contractor_id) === Number(contractorId)) || null;
}

/**
 * TASK-WISE MATERIAL. Material a contractor procured for a Task may be used only on that Task:
 * received quantity (from requests raised for this task) minus what the daily log has already
 * booked against it, and never more than the contractor's actual warehouse stock.
 *
 * With a subtask, only material procured FOR that subtask counts, capped by what is still
 * unused on the whole main task (so main-task and subtask usage can never overdraw it).
 */
async function scopedTaskMaterialLines(taskId, contractorId, subtaskId) {
  const recScope = subtaskId ? ' AND pr.subtask_id = ?' : '';
  const [rows] = await pool.query(
    `SELECT pr.material_id, m.name, m.code, COALESCE(pr.unit, m.unit) AS unit,
            SUM(COALESCE(
              (SELECT SUM(r.received_quantity) FROM procurement_receipts r WHERE r.procurement_request_id = pr.id),
              (SELECT mm.received_quantity FROM material_movements mm WHERE mm.procurement_request_id = pr.id AND mm.status = 'received' LIMIT 1),
              0)) AS procured
     FROM procurement_requests pr
     JOIN materials m ON m.id = pr.material_id
     WHERE pr.task_id = ? AND pr.item_type = 'material' AND pr.status IN ('received', 'partially_received')
       AND (pr.contractor_id = ? OR pr.destination_contractor_id = ?)${recScope}
     GROUP BY pr.material_id, m.name, m.code, COALESCE(pr.unit, m.unit)`,
    [taskId, contractorId, contractorId, ...(subtaskId ? [subtaskId] : [])]
  );
  const wh = await contractorWarehouseFor(contractorId);
  const out = [];
  for (const r of rows) {
    const [[u]] = await pool.query(
      `SELECT COALESCE(SUM(quantity_used), 0) AS used FROM daily_work_updates WHERE task_id = ? AND material_id = ?${subtaskId ? ' AND subtask_id = ?' : ''}`,
      [taskId, r.material_id, ...(subtaskId ? [subtaskId] : [])]
    );
    const stock = wh ? Number(await warehouseModel.totalForMaterial(wh.id, r.material_id) || 0) : 0;
    const left = Math.max(0, Number(r.procured) - Number(u.used));
    const cost = wh ? await warehouseModel.averageUnitCost(wh.id, r.material_id) : null;
    out.push({
      material_id: r.material_id, name: r.name, code: r.code, unit: r.unit,
      procured: Number(r.procured), used: Number(u.used), taskAvailable: left,
      availableStock: Math.min(left, stock), costPerUnit: cost || 0,
    });
  }
  return out.filter((x) => x.procured > 0);
}

async function getTaskMaterials(taskId, contractorId, subtaskId = null) {
  if (!taskId || !contractorId) return [];
  const lines = await scopedTaskMaterialLines(taskId, contractorId, subtaskId || null);
  if (!subtaskId) return lines;
  const taskWide = await scopedTaskMaterialLines(taskId, contractorId, null);
  return lines.map((l) => {
    const tw = taskWide.find((x) => Number(x.material_id) === Number(l.material_id));
    const left = Math.min(l.taskAvailable, tw ? tw.taskAvailable : 0);
    return { ...l, subtaskId: Number(subtaskId), taskAvailable: left, availableStock: Math.min(left, l.availableStock) };
  });
}

async function list(query = {}, hrScope) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));

  const contractorId = hrScope?.role === 'contractor' ? hrScope.contractorId : query.contractorId;

  const { rows, total } = await dailyWorkModel.findAll({
    projectId: query.projectId,
    siteId: query.siteId,
    taskId: query.taskId,
    subtaskId: query.subtaskId,
    contractorId,
    date: query.date,
    pmProjectIds: pmScope.isPm(hrScope) ? (hrScope.pmProjectIds || []) : undefined,
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
      subtaskId: r.subtask_id || null,
      subtaskName: r.subtask_name || null,
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
      toolId: r.tool_id || null,
      toolName: r.tool_name || null,
      toolCost: r.tool_cost ? Number(r.tool_cost) : 0,
      toolRemarks: r.tool_remarks || null,
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
  if (pmScope.isPm(hrScope) && !(hrScope.pmProjectIds || []).includes(Number(update.project_id))) {
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
              COALESCE(taw.phone, cw.phone) AS person_phone,
              COALESCE(taw.aadhaar_number, cw.aadhaar_number) AS person_aadhaar,
              COALESCE(taw.trade, cw.skill_category) AS person_trade,
              taw.worker_type,
              COALESCE(c.name, 'Company Labour (In-House)') AS contractor_name
       FROM task_assigned_workers taw
       LEFT JOIN contractor_workers cw ON cw.id = taw.worker_id
       LEFT JOIN contractors c ON c.id = cw.contractor_id
       WHERE taw.task_id = ? ORDER BY taw.id ASC`,
      [update.task_id]
    );
    if (update.subtask_id && assignedRows.some((a) => Number(a.subtask_id) === Number(update.subtask_id))) {
      assignedRows = assignedRows.filter((a) => Number(a.subtask_id) === Number(update.subtask_id));
    }

    // Fallback to task_labour if no rows in task_assigned_workers
    if (!assignedRows.length) {
      const [legacyRows] = await pool.query(
        `SELECT tl.*,
                COALESCE(cw.full_name, tl.labour_name) AS person_name,
                cw.worker_code AS person_code,
                cw.phone AS person_phone,
                cw.aadhaar_number AS person_aadhaar,
                COALESCE(cw.skill_category, tl.skill_trade) AS person_trade,
                tl.worker_type,
                COALESCE(c.name, 'Company Labour (In-House)') AS contractor_name
         FROM task_labour tl
         LEFT JOIN contractor_workers cw ON cw.id = tl.worker_id
         LEFT JOIN contractors c ON c.id = cw.contractor_id
         WHERE tl.task_id = ? ORDER BY tl.id ASC`,
        [update.task_id]
      );
      assignedRows = legacyRows;
    }

    const workedNames = new Set(workers.map((w) => (w.worker_name || '').toLowerCase().trim()));
    const workedCodes = new Set(workers.map((w) => (w.worker_code || '').toLowerCase().trim()));

    assignedLabour = assignedRows.map((a) => {
      const isCompany = a.worker_type === 'company_labour' || a.worker_type === 'company_employee' || String(a.person_trade || a.trade || a.labour_type || '').toLowerCase().includes('company');
      return {
        id: a.id,
        workerId: a.worker_id,
        workerType: isCompany ? 'company_labour' : (a.worker_type || 'daily_wage'),
        name: a.person_name || 'Worker',
        code: a.person_code || null,
        phone: a.person_phone || null,
        trade: a.person_trade || a.labour_type || 'Labour',
        dailyWage: isCompany ? 0 : Number(a.daily_wage || 0),
        workingDays: Number(a.working_days || 0),
        startDate: a.start_date,
        endDate: a.end_date,
        contractorName: isCompany ? 'Company Labour (In-House)' : (a.contractor_name || 'Contractor'),
      };
    });

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
    subtaskId: update.subtask_id || null,
    subtaskName: update.subtask_name || null,
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
    toolId: update.tool_id || null,
    toolName: update.tool_name || null,
    toolCost: update.tool_cost ? Number(update.tool_cost) : 0,
    toolRemarks: update.tool_remarks || null,
    totalDailyExpense: Number(
      (
        workers.reduce((s, w) => s + (Number(w.hours_worked || 8) / 8) * Number(w.daily_wage || 0), 0) +
        (update.quantity_used ? Number(update.quantity_used) * Number(material ? material.default_rate || 0 : 0) : 0) +
        Number(update.misc_amount || 0) +
        Number(update.tool_cost || 0)
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

  // Project Manager: only on an assigned project/site, recorded against the
  // contractor responsible for that site.
  if (pmScope.isPm(hrScope)) {
    pmScope.assertPmAssigned(hrScope, projectId, siteId);
    const owner = await pmScope.responsibleContractorId(projectId, siteId);
    if (contractorId && owner && Number(contractorId) !== Number(owner)) {
      throw ApiError.badRequest('That contractor is not responsible for this site.');
    }
    contractorId = contractorId || owner;
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

  // Machine/tool parameters
  const toolId = payload.tool_id ? Number(payload.tool_id) : (payload.toolId ? Number(payload.toolId) : null);
  let toolName = (payload.tool_name || payload.toolName || '').trim();
  const toolCost = payload.tool_cost ? Number(payload.tool_cost) : (payload.toolCost ? Number(payload.toolCost) : 0);
  const toolRemarks = (payload.tool_remarks || payload.toolRemarks || '').trim();

  if (toolId && !toolName) {
    const [tRows] = await pool.query('SELECT name FROM tools WHERE id = ? LIMIT 1', [toolId]);
    if (tRows.length) toolName = tRows[0].name;
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

  // Optional subtask under the selected main task.
  const subtask = await resolveSubtask(taskId, subtaskIdFrom(payload));
  const subtaskId = subtask ? subtask.id : null;

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
    if (!subcategory) subcategory = subtask ? subtask.name : task.name;

    // Calculate this update's incoming costs
    let incomingMaterialCost = 0;
    if (materialId && quantityUsed > 0) {
      const preWh = await contractorWarehouseFor(contractorId);
      const matRate = await getConsumptionUnitCost({ warehouseId: preWh?.id, materialId });
      incomingMaterialCost = Number((quantityUsed * matRate).toFixed(2));
    }

    const incomingMiscCost = payload.misc_amount ? Number(payload.misc_amount) : 0;
    const incomingToolCost = toolCost;

    let incomingLabourCost = 0;
    for (const w of workersList) {
      const name = (w.worker_name || w.workerName || '').trim();
      const isCompany = (w.worker_type === 'company_labour' || w.worker_type === 'company_employee' || w.workerType === 'company_labour' || w.workerType === 'company_employee' || String(w.labour_type || w.labourType || '').toLowerCase().includes('company'));
      if (name && !isCompany) {
        const hours = Number(w.hours_worked || w.hoursWorked || 8.0);
        const wage = Number(w.daily_wage || w.dailyWage || 0.0);
        incomingLabourCost += (hours / 8.0) * wage;
      }
    }
    incomingLabourCost = Number(incomingLabourCost.toFixed(2));
    const thisUpdateCost = Number((incomingMaterialCost + incomingMiscCost + incomingLabourCost + incomingToolCost).toFixed(2));

    if (thisUpdateCost > 0) {
      const currentActual = Number(taskDetail.budgetUtilization?.total?.actual || 0);
      const effectiveApprovedBudget = Number(taskDetail.budgetUtilization?.total?.effectiveBudget || Number(task.total_budget || 0));
      const projectedTotal = Number((currentActual + thisUpdateCost).toFixed(2));
      const fmt = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

      // A subtask has its own approved budget; overrunning it needs the same justification.
      let subOver = null;
      if (subtask) {
        const sub = (taskDetail.subtasks || []).find((x) => Number(x.id) === Number(subtask.id));
        if (sub) {
          const subProjected = Number((sub.actualCost + thisUpdateCost).toFixed(2));
          if (subProjected > sub.plannedBudget) {
            subOver = {
              approvedBudget: sub.plannedBudget,
              currentActual: sub.actualCost,
              projectedTotal: subProjected,
              requestedExcess: Number((subProjected - sub.plannedBudget).toFixed(2)),
            };
          }
        }
      }
      const taskOver = projectedTotal > effectiveApprovedBudget;

      if (taskOver || subOver) {
        const excessReason = (payload.excess_reason || '').trim();
        if (!excessReason) {
          throw ApiError.badRequest(
            taskOver
              ? `This update will exceed the approved task budget of ₹${fmt(effectiveApprovedBudget)} by ₹${fmt(projectedTotal - effectiveApprovedBudget)} (projected total: ₹${fmt(projectedTotal)}). A mandatory excess budget reason/justification is required before submission.`
              : `This update will exceed the approved budget of subtask "${subtask.name}" (₹${fmt(subOver.approvedBudget)}) by ₹${fmt(subOver.requestedExcess)} (projected: ₹${fmt(subOver.projectedTotal)}). A mandatory excess budget reason/justification is required before submission.`
          );
        }
        budgetExceededInfo = taskOver
          ? {
            scope: 'task',
            approvedBudget: effectiveApprovedBudget,
            currentActual,
            thisUpdateCost,
            projectedTotal,
            requestedExcess: Number((projectedTotal - effectiveApprovedBudget).toFixed(2)),
            excessReason,
          }
          : { scope: 'subtask', ...subOver, thisUpdateCost, excessReason };
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
  let consumptionUnitCost = null;
  let consumptionTotal = null;

  if (materialId && quantityUsed > 0) {
    // Material is booked TASK-WISE only: it must be logged against a task, and only up to what was
    // procured for that task and not yet used.
    if (!taskId) {
      throw ApiError.badRequest('Select the Task - material can only be used task-wise, against the task it was procured for.');
    }
    const taskStock = await getTaskMaterials(taskId, contractorId, subtaskId);
    const line = taskStock.find((x) => Number(x.material_id) === materialId);
    const scopeLabel = subtask ? `subtask "${subtask.name}"` : 'this task';
    if (!line) {
      throw ApiError.badRequest(`That material was not procured for ${scopeLabel}, so it cannot be used on it. Raise a procurement request for ${scopeLabel} first.`);
    }
    if (quantityUsed > line.taskAvailable + 1e-9) {
      throw ApiError.badRequest(`Only ${line.taskAvailable} ${line.unit} procured for ${scopeLabel} is still unused (procured ${line.procured}, already used ${line.used}).`);
    }
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

    const taskLabel = task ? `Task: ${task.name}${subtask ? ` › ${subtask.name}` : ''}` : `Phase ${phaseNumber || ''} (${subcategory})`;

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

    // Actual cost of the stock consumed, linked to where it came from.
    const unitRate = await getConsumptionUnitCost({ warehouseId: warehouse.id, materialId, issueTx });
    const totalAmount = Number((quantityUsed * unitRate).toFixed(2));
    consumptionUnitCost = unitRate;
    consumptionTotal = totalAmount;
    const expenseNumber = `EXP-DWU-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 900 + 100)}`;

    expenseId = await financeModel.createExpense({
      expense_number: expenseNumber,
      project_id: projectId,
      site_id: siteId,
      contractor_id: contractorId,
      task_id: task ? task.id : null,
      subtask_id: subtaskId,
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
      source_type: 'daily_work_material',
    });
  }

  const workDoneText = payload.work_done?.trim()
    || (material ? `Material Used: ${quantityUsed} ${material.unit} of ${material.name}` : (task ? `${task.name} site work` : 'Site work'));

  // Machine / Tool expense processing
  if (toolCost > 0) {
    const toolExpenseNumber = `EXP-TOOL-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 900 + 100)}`;
    await financeModel.createExpense({
      expense_number: toolExpenseNumber,
      project_id: projectId,
      site_id: siteId,
      contractor_id: contractorId,
      task_id: task ? task.id : null,
      subtask_id: subtaskId,
      category: 'Machine / Tool',
      description: toolRemarks || `Machine/Tool used: ${toolName || 'Equipment'} (${task ? task.name : 'Site'})`,
      amount: toolCost,
      expense_date: workDate,
      paid_by: 'Contractor Daily Operational',
      party_name: toolName || 'Machine/Tool Usage',
      payment_method: 'other',
      reference: `DWU-TOOL-${workDate}`,
      status: 'approved',
      notes: toolRemarks || null,
      created_by: userId,
    });
  }

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
      subtask_id: subtaskId,
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
    subtask_id: subtaskId,
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
    tool_id: toolId,
    tool_name: toolName || null,
    tool_cost: toolCost,
    tool_remarks: toolRemarks || null,
    unit_cost: consumptionUnitCost,
    material_cost: consumptionTotal,
  });

  if (expenseId) {
    await pool.query('UPDATE expenses SET source_id = ? WHERE id = ?', [updateId, expenseId]);
  }

  // Attach photos
  if (files && files.length) {
    for (const f of files) {
      await dailyWorkModel.addPhoto({
        work_update_id: updateId,
        project_id: projectId,
        site_id: siteId,
        task_id: task ? task.id : null,
        subtask_id: subtaskId,
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
    if (subtask) {
      // Subtask progress & status; the main task follows its subtasks.
      await pool.query('UPDATE task_subtasks SET progress = GREATEST(progress, ?) WHERE id = ?', [progressNum, subtask.id]);
      if (progressNum === 100 || payload.work_status === 'completed') {
        await pool.query("UPDATE task_subtasks SET status = 'completed', progress = 100 WHERE id = ?", [subtask.id]);
      }
      await taskModel.rollupMainTaskProgress(pool, task.id);
    } else {
      // Update task progress & status
      await pool.query(
        'UPDATE project_tasks SET progress = GREATEST(progress, ?) WHERE id = ?',
        [progressNum, task.id]
      );
      if (progressNum === 100 || payload.work_status === 'completed') {
        await pool.query("UPDATE project_tasks SET status = 'completed' WHERE id = ?", [task.id]);
      }
    }

    // Process workers if submitted with daily update
    for (const w of workersList) {
      const name = (w.worker_name || w.workerName || '').trim();
      if (name) {
        const isCompany = (w.worker_type === 'company_labour' || w.worker_type === 'company_employee' || w.workerType === 'company_labour' || w.workerType === 'company_employee' || String(w.labour_type || w.labourType || '').toLowerCase().includes('company'));
        const workerType = isCompany ? 'company_labour' : (w.worker_type || w.workerType || 'daily_wage');
        const dailyWage = isCompany ? 0.0 : Number(w.daily_wage || w.dailyWage || 0.0);

        await taskModel.addWorkerLog({
          task_id: task.id,
          subtask_id: subtaskId,
          project_id: projectId,
          site_id: siteId || task.site_id || null,
          contractor_id: contractorId,
          daily_work_id: updateId,
          worker_id: w.worker_id || w.workerId || null,
          worker_type: workerType,
          worker_name: name,
          worker_code: w.worker_code || w.workerCode || w.worker_id || null,
          labour_type: (w.labour_type || w.labourType || (isCompany ? 'Company Labour' : 'Labour')).trim(),
          work_date: workDate,
          hours_worked: Number(w.hours_worked || w.hoursWorked || 8.0),
          daily_wage: dailyWage,
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
      const scopeName = subtask ? `${task.name} › ${subtask.name}` : task.name;
      const approvalReqId = await approvalModel.create({
        project_id: projectId,
        site_id: siteId,
        request_type: 'task_budget_exceeded',
        title: `${budgetExceededInfo.scope === 'subtask' ? 'Subtask' : 'Task'} Budget Exceeded: ${scopeName} (+₹${budgetExceededInfo.requestedExcess.toLocaleString('en-IN', { minimumFractionDigits: 2 })})`,
        requested_by: requesterName,
        amount: budgetExceededInfo.requestedExcess,
        details: JSON.stringify({
          taskId: task.id,
          taskName: task.name,
          subtaskId,
          subtaskName: subtask ? subtask.name : null,
          scope: budgetExceededInfo.scope,
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
         (task_id, subtask_id, project_id, site_id, category, budget_amount, actual_amount, requested_excess, reason, status, requested_by, approval_request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          task.id,
          subtaskId,
          projectId,
          siteId,
          budgetExceededInfo.scope === 'subtask' ? 'Subtask Total' : 'Task Total',
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
      if (subtaskId) {
        await pool.query(
          'UPDATE task_subtasks SET pending_excess_budget = pending_excess_budget + ? WHERE id = ?',
          [budgetExceededInfo.requestedExcess, subtaskId]
        );
      }

      // 4. Create admin notification
      await notificationModel.create({
        role: 'admin',
        title: `Task Budget Exceeded: ${scopeName}`,
        message: `${subtask ? `Subtask "${subtask.name}" of task` : 'Task'} "${task.name}" in project "${project.name}" requires excess budget approval of ₹${budgetExceededInfo.requestedExcess.toLocaleString('en-IN', { minimumFractionDigits: 2 })}. Reason: ${budgetExceededInfo.excessReason}`,
        type: 'warning',
        category: 'approvals',
        actionUrl: '/admin/approvals',
        metadata: {
          taskId: task.id,
          subtaskId,
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

module.exports = { list, getById, create, getTaskMaterials };
