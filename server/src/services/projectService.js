'use strict';

const fs = require('fs');
const ApiError = require('../utils/ApiError');
const { pool } = require('../config/db');
const projectModel = require('../models/projectModel');
const siteModel = require('../models/siteModel');
const phaseBudgetModel = require('../models/phaseBudgetModel');
const taskModel = require('../models/taskModel');
const dailyWorkModel = require('../models/dailyWorkModel');

function calculateDurationMonths(startDate, completionDate) {
  if (!startDate || !completionDate) return 0;
  const start = new Date(startDate);
  const end = new Date(completionDate);
  const diffDays = (end - start) / (1000 * 60 * 60 * 24);
  if (diffDays <= 0) return 0;
  return Math.round((diffDays / 30.4375) * 10) / 10;
}

/** Converts DB rows into the camelCase shape the client consumes. */
function toProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    projectType: row.project_type,
    description: row.description,
    location: row.location,
    startDate: row.start_date,
    expectedCompletion: row.expected_completion,
    expectedDurationMonths: calculateDurationMonths(row.start_date, row.expected_completion),
    estimatedBudget: Number(row.estimated_budget),
    clientContractValue: Number(row.client_contract_value || row.estimated_budget || 0),
    spentAmount: Number(row.spent_amount || 0),
    status: row.status,
    progress: row.progress,
    currentPhase: row.current_phase,
    siteCount: Number(row.site_count || 0),
    client: row.client_id ? { id: row.client_id, name: row.client_name } : null,
    team: {
      projectManager: row.project_manager_id ? { id: row.project_manager_id, name: row.project_manager_name } : null,
      architect: row.architect_id ? { id: row.architect_id, name: row.architect_name } : null,
      siteEngineer: row.site_engineer_id ? { id: row.site_engineer_id, name: row.site_engineer_name } : null,
    },
    contractor: row.contractor_id ? { id: row.contractor_id, name: row.contractor_name } : null,
  };
}

async function list(query, hrScope) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));

  const scopedQuery = hrScope?.role === 'contractor'
    ? { ...query, contractorId: hrScope.contractorId }
    : query;
  const { rows, total } = await projectModel.findAll({ ...scopedQuery, page, pageSize });

  return {
    projects: rows.map(toProject),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function getById(id) {
  const row = await projectModel.findById(id);
  if (!row) throw ApiError.notFound('That project does not exist.');
  return toProject(row);
}

/** Full detail payload backing every tab on the project page. */
async function getDetail(id, hrScope) {
  const project = await getById(id);

  let [sites, tasks, materials, labour, expenses, issues, documents, approvals, contractors, activities, financials, phases, dailyWork] =
    await Promise.all([
      projectModel.findRelated(id, 'sites'),
      projectModel.findRelated(id, 'tasks'),
      projectModel.findRelated(id, 'materials'),
      projectModel.findRelated(id, 'labour'),
      projectModel.findRelated(id, 'expenses'),
      projectModel.findRelated(id, 'issues'),
      projectModel.findRelated(id, 'documents'),
      projectModel.findRelated(id, 'approvals'),
      projectModel.findRelated(id, 'contractors'),
      projectModel.findRelated(id, 'activities'),
      projectModel.findFinancials(id),
      phaseBudgetModel.getPhasesWithDetails(id),
      dailyWorkModel.findAll({ projectId: id, pageSize: 50 }),
    ]);

  const isContractor = hrScope?.role === 'contractor';

  if (isContractor) {
    const cId = Number(hrScope.contractorId);
    const isAssignedProject = Number(project.contractor?.id) === cId || sites.some((s) => Number(s.contractor_id) === cId);
    if (!isAssignedProject) {
      throw ApiError.notFound('That project does not exist.');
    }
    sites = sites.filter((s) => Number(s.contractor_id) === cId || (!s.contractor_id && Number(project.contractor?.id) === cId));

    // Scoped phases for contractor: only titles, subcategories, progress, status, duration
    phases = phases.map((p) => ({
      id: p.id,
      phaseNumber: p.phaseNumber,
      title: p.title,
      subcategories: p.subcategories,
      durationMonths: p.durationMonths,
      progress: p.progress,
      status: p.status,
    }));
    // Filter tasks for contractor: only tasks for their assigned sites (or unassigned project-level tasks)
    tasks = tasks.filter((t) => !t.site_id || sites.some((s) => Number(s.id) === Number(t.site_id)));
  }

  // Batch fetch task items for all tasks in this project
  const taskIds = tasks.map((t) => t.id).filter(Boolean);
  let taskMaterials = [];
  let taskTools = [];
  let taskLabour = [];
  let taskMisc = [];
  let taskWorkerLogs = [];
  let taskDailyWork = [];

  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => '?').join(',');
    const [tmRows, ttRows, tlRows, tmcRows, twlRows, tdwRows] = await Promise.all([
      pool.query(
        `SELECT tm.*, m.name AS material_name, m.unit AS material_unit, m.category AS material_category
         FROM task_materials tm
         JOIN materials m ON m.id = tm.material_id
         WHERE tm.task_id IN (${placeholders}) ORDER BY tm.id ASC`,
        taskIds
      ),
      pool.query(
        `SELECT tt.*, t.code AS tool_code
         FROM task_tools tt
         LEFT JOIN tools t ON t.id = tt.tool_id
         WHERE tt.task_id IN (${placeholders}) ORDER BY tt.id ASC`,
        taskIds
      ),
      pool.query(
        `SELECT * FROM task_labour WHERE task_id IN (${placeholders}) ORDER BY id ASC`,
        taskIds
      ),
      pool.query(
        `SELECT * FROM task_misc WHERE task_id IN (${placeholders}) ORDER BY id ASC`,
        taskIds
      ),
      pool.query(
        `SELECT * FROM task_worker_logs WHERE task_id IN (${placeholders}) ORDER BY id ASC`,
        taskIds
      ),
      pool.query(
        `SELECT * FROM daily_work_updates WHERE task_id IN (${placeholders}) ORDER BY id ASC`,
        taskIds
      ),
    ]);
    taskMaterials = tmRows[0];
    taskTools = ttRows[0];
    taskLabour = tlRows[0];
    taskMisc = tmcRows[0];
    taskWorkerLogs = twlRows[0];
    taskDailyWork = tdwRows[0];
  }

  const formattedTasks = tasks.map((t) => {
    const tMaterials = taskMaterials.filter((m) => m.task_id === t.id);
    const tTools = taskTools.filter((tl) => tl.task_id === t.id);
    const tLabour = taskLabour.filter((l) => l.task_id === t.id);
    const tMisc = taskMisc.filter((mc) => mc.task_id === t.id);
    const tWorkerLogs = taskWorkerLogs.filter((w) => w.task_id === t.id);
    const tDailyWork = taskDailyWork.filter((dw) => dw.task_id === t.id);
    const tExpenses = (expenses || []).filter((e) => e.task_id === t.id);

    const budgetUtilization = taskModel.computeTaskBudgetUtilization(t, tMaterials, tDailyWork, tWorkerLogs, tExpenses);

    return {
      id: t.id,
      projectId: t.project_id,
      siteId: t.site_id,
      siteName: t.site_name,
      name: t.name,
      description: t.description,
      status: t.status,
      progress: Number(t.progress || 0),
      startDate: t.start_date || t.planned_start,
      endDate: t.end_date || t.planned_end,
      durationDays: Number(t.duration_days || 0),
      materialBudget: Number(t.material_budget || 0),
      toolBudget: Number(t.tool_budget || 0),
      labourBudget: Number(t.labour_budget || 0),
      miscBudget: Number(t.misc_budget || 0),
      totalBudget: Number(t.total_budget || 0),
      approvedAdditionalBudget: Number(t.approved_additional_budget || 0),
      pendingExcessBudget: Number(t.pending_excess_budget || 0),
      excessReason: t.excess_reason || null,
      budgetUtilization,
      workerEntriesCount: Number(t.worker_entries_count || 0),
      uniqueWorkersCount: Number(t.unique_workers_count || 0),
      actualLabourCost: budgetUtilization.labour.actual,
      actualMaterialCost: budgetUtilization.materials.actual,
      actualTaskExpenses: Number((budgetUtilization.tools.actual + budgetUtilization.misc.actual).toFixed(2)),
      actualCost: budgetUtilization.total.actual,
      variance: Number((budgetUtilization.total.effectiveBudget - budgetUtilization.total.actual).toFixed(2)),
      dailyUpdatesCount: Number(t.daily_updates_count || 0),
    materials: taskMaterials
      .filter((m) => m.task_id === t.id)
      .map((m) => ({
        id: m.id,
        materialId: m.material_id,
        materialName: m.material_name,
        unit: m.material_unit,
        category: m.material_category,
        quantity: Number(m.quantity || 0),
        costPerUnit: Number(m.cost_per_unit || 0),
        totalCost: Number(m.total_cost || 0),
      })),
    tools: taskTools
      .filter((tl) => tl.task_id === t.id)
      .map((tl) => ({
        id: tl.id,
        toolId: tl.tool_id,
        toolName: tl.tool_name,
        rentalType: tl.rental_type,
        quantity: Number(tl.quantity || 1),
        cost: Number(tl.cost || 0),
        workingDays: Number(tl.working_days || 1),
        startDate: tl.start_date || null,
        endDate: tl.end_date || null,
        totalCost: Number(tl.total_cost || 0),
      })),
    labour: taskLabour
      .filter((l) => l.task_id === t.id)
      .map((l) => ({
        id: l.id,
        labourName: l.labour_name || '',
        labourType: l.labour_type,
        workerCount: Number(l.worker_count || 1),
        dailyWage: Number(l.daily_wage || 0),
        workingDays: Number(l.working_days || 0),
        totalCost: Number(l.total_cost || 0),
      })),
    misc: taskMisc
      .filter((mc) => mc.task_id === t.id)
      .map((mc) => ({
        id: mc.id,
        description: mc.description,
        amount: Number(mc.amount || 0),
      })),
    };
  });

  const plannedMaterialBudget = formattedTasks.reduce((sum, t) => sum + t.materialBudget, 0);
  const plannedLabourBudget = formattedTasks.reduce((sum, t) => sum + t.labourBudget, 0);
  const plannedToolBudget = formattedTasks.reduce((sum, t) => sum + t.toolBudget, 0);
  const plannedMiscBudget = formattedTasks.reduce((sum, t) => sum + t.miscBudget, 0);
  const plannedTotalBudget = Number(project.estimatedBudget || project.estimated_budget || 0) ||
    (plannedMaterialBudget + plannedLabourBudget + plannedToolBudget + plannedMiscBudget);

  const actualLabourCost = formattedTasks.reduce((sum, t) => sum + t.actualLabourCost, 0) || Number(financials?.labour_cost || 0);
  const actualMaterialCost = formattedTasks.reduce((sum, t) => sum + t.actualMaterialCost, 0) || Number(financials?.material_cost || 0);

  const toolExpenses = (expenses || [])
    .filter((e) => ['equipment', 'tools', 'machinery', 'machines'].includes((e.category || '').toLowerCase()) && !['rejected', 'cancelled'].includes(e.status))
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const actualToolCost = toolExpenses;

  const miscExpenses = (expenses || [])
    .filter((e) => !['materials', 'labour', 'equipment', 'tools', 'machinery', 'machines'].includes((e.category || '').toLowerCase()) && !['rejected', 'cancelled'].includes(e.status))
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const actualMiscCost = miscExpenses;

  const actualTotalCost = actualMaterialCost + actualLabourCost + actualToolCost + actualMiscCost;
  const remainingTotalBudget = plannedTotalBudget - actualTotalCost;
  const utilizationPercentage = plannedTotalBudget > 0 ? Math.min(100, Math.round((actualTotalCost / plannedTotalBudget) * 100)) : 0;

  const budgetSummary = {
    plannedBudget: plannedTotalBudget,
    usedBudget: actualTotalCost,
    remainingBudget: remainingTotalBudget,
    utilizationPercentage,
    categories: [
      {
        name: 'Materials',
        planned: plannedMaterialBudget,
        used: actualMaterialCost,
        remaining: plannedMaterialBudget - actualMaterialCost,
      },
      {
        name: 'Labour',
        planned: plannedLabourBudget,
        used: actualLabourCost,
        remaining: plannedLabourBudget - actualLabourCost,
      },
      {
        name: 'Machines / Tools',
        planned: plannedToolBudget,
        used: actualToolCost,
        remaining: plannedToolBudget - actualToolCost,
      },
      {
        name: 'Miscellaneous',
        planned: plannedMiscBudget,
        used: actualMiscCost,
        remaining: plannedMiscBudget - actualMiscCost,
      },
      {
        name: 'Total',
        planned: plannedTotalBudget,
        used: actualTotalCost,
        remaining: remainingTotalBudget,
      },
    ],
    taskBreakdown: formattedTasks.map((t) => ({
      id: t.id,
      name: t.name,
      siteName: t.siteName,
      status: t.status,
      plannedBudget: t.totalBudget,
      actualCost: t.actualCost,
      variance: t.variance,
    })),
  };

  const formattedDocs = documents.map((doc) => ({
    id: doc.id,
    projectId: doc.project_id,
    siteId: doc.site_id,
    name: doc.name,
    documentType: doc.document_type,
    fileName: doc.file_name,
    fileType: doc.file_type,
    fileSize: doc.file_size,
    uploadedOn: doc.uploaded_on,
    createdAt: doc.created_at,
    downloadUrl: `/api/projects/${id}/documents/${doc.id}/download`,
  }));

  return {
    project,
    sites,
    phases,
    dailyWorkUpdates: dailyWork.rows,
    tasks: formattedTasks,
    budgetSummary,
    progress: summariseProgress(project, formattedTasks),
    materials,
    labour,
    expenses,
    issues,
    documents: formattedDocs,
    approvals,
    contractors,
    activities,
    financials: isContractor ? null : (() => {
      const labourCost = actualLabourCost || Number(financials?.labour_cost || 0);
      const spent = Number(financials?.spent || 0) + labourCost;
      const budget = Number(financials?.budget || 0);
      return {
        budget,
        spent,
        remaining: budget - spent,
        materialCost: Number(financials.material_cost || 0),
        contractValue: Number(financials.contract_value || 0),
        contractorPaid: Number(financials.contractor_paid || 0),
        contractorOutstanding: Number(financials.contract_value || 0) - Number(financials.contractor_paid || 0),
        labourCost,
        byCategory: financials.byCategory.map((r) => ({ category: r.category, total: Number(r.total) })),
      };
    })(),
  };
}

function summariseProgress(project, tasks) {
  const today = new Date().setHours(0, 0, 0, 0);
  const totalWeight = tasks.reduce((sum, t) => sum + t.weight, 0);

  const weightWhere = (predicate) =>
    tasks.filter(predicate).reduce((sum, t) => sum + t.weight, 0);

  const actual = totalWeight ? Math.round((weightWhere((t) => t.status === 'completed') / totalWeight) * 100) : project.progress;
  const planned = totalWeight
    ? Math.round((weightWhere((t) => t.planned_end && new Date(t.planned_end).setHours(0, 0, 0, 0) <= today) / totalWeight) * 100)
    : 0;

  return {
    overall: actual,
    planned,
    variance: actual - planned,
    currentPhase: project.currentPhase,
    completed: tasks.filter((t) => t.status === 'completed').length,
    inProgress: tasks.filter((t) => t.status === 'in-progress').length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    delayed: tasks.filter((t) => t.status === 'delayed').length,
    totalTasks: tasks.length,
  };
}

async function create(payload) {
  if (payload.code) {
    if (await projectModel.findByCode(payload.code)) {
      throw ApiError.badRequest('Check the highlighted fields.', { code: 'That project code is already in use.' });
    }
  }
  if (new Date(payload.expected_completion) < new Date(payload.start_date)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      expected_completion: 'Completion date cannot fall before the start date.',
    });
  }

  if (payload.clientContractValue !== undefined && payload.client_contract_value === undefined) {
    payload.client_contract_value = payload.clientContractValue;
  }
  if (!payload.client_contract_value && payload.estimated_budget) {
    payload.client_contract_value = payload.estimated_budget;
  }

  const id = await projectModel.create(payload);

  if (payload.tasks && Array.isArray(payload.tasks)) {
    await taskModel.saveProjectTasks(id, payload.tasks, payload.created_by || null);
  } else if (payload.phases && Array.isArray(payload.phases)) {
    await phaseBudgetModel.savePhases(id, payload.phases);
  } else {
    await phaseBudgetModel.ensurePhases(id);
  }

  return getById(id);
}

async function update(id, payload) {
  await getById(id);

  if (payload.clientContractValue !== undefined && payload.client_contract_value === undefined) {
    payload.client_contract_value = payload.clientContractValue;
  }

  if (payload.code) {
    const existing = await projectModel.findByCode(payload.code);
    if (existing && existing.id !== Number(id)) {
      throw ApiError.badRequest('Check the highlighted fields.', { code: 'That project code is already in use.' });
    }
  }
  if (payload.start_date && payload.expected_completion &&
      new Date(payload.expected_completion) < new Date(payload.start_date)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      expected_completion: 'Completion date cannot fall before the start date.',
    });
  }

  await projectModel.update(id, payload);

  if (payload.tasks && Array.isArray(payload.tasks)) {
    await taskModel.saveProjectTasks(id, payload.tasks, payload.updated_by || null);
  } else if (payload.phases && Array.isArray(payload.phases)) {
    await phaseBudgetModel.savePhases(id, payload.phases);
  }

  return getById(id);
}

async function archive(id) {
  await getById(id);
  await projectModel.archive(id);
}

async function assignTeam(id, payload) {
  await getById(id);
  await projectModel.updateTeam(id, payload);
  return getById(id);
}

async function addSite(projectId, payload) {
  await getById(projectId);
  const id = await siteModel.create({ ...payload, project_id: projectId });
  return siteModel.findById(id);
}

// ------------------------------------------------------------ Documents
async function addDocuments(projectId, files, meta = {}) {
  await getById(projectId);
  const saved = [];
  for (const file of files) {
    const doc = await projectModel.addDocument({
      project_id: projectId,
      site_id: meta.site_id ? Number(meta.site_id) : null,
      name: meta.name || file.originalname,
      document_type: meta.document_type || 'General',
      file_path: file.path,
      file_name: file.originalname,
      file_type: file.mimetype,
      file_size: file.size,
      uploaded_on: new Date().toISOString().slice(0, 10),
    });
    saved.push(doc);
  }
  return saved;
}

async function getDocumentFile(projectId, docId) {
  await getById(projectId);
  const doc = await projectModel.findDocumentById(docId);
  if (!doc || Number(doc.project_id) !== Number(projectId)) {
    throw ApiError.notFound('Document not found.');
  }
  if (!fs.existsSync(doc.file_path)) {
    throw ApiError.notFound('Document file missing on disk.');
  }
  return doc;
}

async function deleteDocument(projectId, docId) {
  await getById(projectId);
  const doc = await projectModel.findDocumentById(docId);
  if (!doc || Number(doc.project_id) !== Number(projectId)) {
    throw ApiError.notFound('Document not found.');
  }
  if (doc.file_path && fs.existsSync(doc.file_path)) {
    try { fs.unlinkSync(doc.file_path); } catch (_) {}
  }
  await projectModel.removeDocument(docId);
  return { success: true };
}

// --------------------------------------------------- Materials Tracking (Received vs Used vs Balance)
async function getMaterialTracking(projectId, query = {}) {
  const pId = Number(projectId);
  const project = await getById(pId);

  // 1. Used (consumed) records
  const usedWhere = ['e.project_id = ?', "e.category = 'Material Consumption'", "e.status NOT IN ('rejected', 'cancelled')"];
  const usedParams = [pId];

  if (query.siteId && query.siteId !== 'all') {
    usedWhere.push('e.site_id = ?');
    usedParams.push(Number(query.siteId));
  }
  if (query.contractorId && query.contractorId !== 'all') {
    usedWhere.push('e.contractor_id = ?');
    usedParams.push(Number(query.contractorId));
  }
  if (query.dateFrom) {
    usedWhere.push('e.expense_date >= ?');
    usedParams.push(query.dateFrom);
  }
  if (query.dateTo) {
    usedWhere.push('e.expense_date <= ?');
    usedParams.push(query.dateTo);
  }

  const [usedRows] = await pool.query(
    `SELECT e.id AS expense_id, e.expense_number, e.amount, e.expense_date, e.reference, e.notes,
            COALESCE(dwu.material_id, m.id) AS material_id,
            COALESCE(m.name, e.party_name) AS material_name,
            m.code AS material_code, m.category AS material_category,
            COALESCE(dwu.unit, m.unit, 'unit') AS unit,
            COALESCE(m.default_rate, 0) AS default_rate,
            dwu.id AS work_update_id, dwu.quantity_used, dwu.phase_number, dwu.phase_title, dwu.subcategory,
            dwu.work_date,
            s.id AS site_id, s.name AS site_name,
            c.id AS contractor_id, c.name AS contractor_name,
            wt.transaction_number
     FROM expenses e
     LEFT JOIN daily_work_updates dwu ON dwu.expense_id = e.id
     LEFT JOIN materials m ON (m.id = dwu.material_id OR m.name = e.party_name)
     LEFT JOIN sites s ON s.id = COALESCE(dwu.site_id, e.site_id)
     LEFT JOIN contractors c ON c.id = COALESCE(dwu.contractor_id, e.contractor_id)
     LEFT JOIN warehouse_transactions wt ON (wt.transaction_number = e.reference OR wt.id = dwu.warehouse_transaction_id)
     WHERE ${usedWhere.join(' AND ')}
     ORDER BY e.expense_date DESC, e.id DESC`,
    usedParams
  );

  // Filter in memory for phase / subcategory / material if passed in query
  let filteredUsed = usedRows;
  if (query.phaseNumber && query.phaseNumber !== 'all') {
    filteredUsed = filteredUsed.filter((r) => String(r.phase_number) === String(query.phaseNumber));
  }
  if (query.subcategory && query.subcategory !== 'all') {
    filteredUsed = filteredUsed.filter((r) => r.subcategory === query.subcategory);
  }
  if (query.materialId && query.materialId !== 'all') {
    filteredUsed = filteredUsed.filter((r) => String(r.material_id) === String(query.materialId));
  }

  // 2. Received / Sent records
  const [recRows] = await pool.query(
    `SELECT wt.id, wt.transaction_number, wt.material_id, wt.quantity, wt.unit,
            wt.transaction_date, wt.reference, wt.notes,
            m.name AS material_name, m.code AS material_code, m.category AS material_category, m.default_rate,
            w_src.name AS source_name,
            w_dst.name AS destination_name,
            COALESCE(c.name, c_dst.name, '—') AS contractor_name,
            s.name AS site_name, s.id AS site_id
     FROM warehouse_transactions wt
     JOIN materials m ON m.id = wt.material_id
     LEFT JOIN sites s ON s.id = wt.site_id
     LEFT JOIN warehouses w_src ON w_src.id = wt.warehouse_id
     LEFT JOIN warehouses w_dst ON w_dst.id = wt.destination_warehouse_id
     LEFT JOIN contractors c ON c.id = w_src.contractor_id
     LEFT JOIN contractors c_dst ON c_dst.id = w_dst.contractor_id
     WHERE (
       wt.project_id = ?
       OR wt.warehouse_id IN (
         SELECT w.id FROM warehouses w
         JOIN projects prj ON prj.id = ?
         LEFT JOIN sites st ON st.project_id = prj.id
         WHERE (w.contractor_id = prj.contractor_id OR w.contractor_id = st.contractor_id)
       )
       OR wt.destination_warehouse_id IN (
         SELECT w.id FROM warehouses w
         JOIN projects prj ON prj.id = ?
         LEFT JOIN sites st ON st.project_id = prj.id
         WHERE (w.contractor_id = prj.contractor_id OR w.contractor_id = st.contractor_id)
       )
       OR wt.id IN (
         SELECT pr.warehouse_transaction_id FROM procurement_requests pr
         WHERE pr.project_id = ? AND pr.warehouse_transaction_id IS NOT NULL
       )
     )
     AND wt.transaction_type IN ('transfer', 'receipt', 'adjust')
     AND wt.quantity > 0
     ORDER BY wt.transaction_date DESC, wt.id DESC`,
    [pId, pId, pId, pId]
  );

  let filteredReceived = recRows;
  if (query.siteId && query.siteId !== 'all') {
    filteredReceived = filteredReceived.filter((r) => String(r.site_id) === String(query.siteId));
  }
  if (query.materialId && query.materialId !== 'all') {
    filteredReceived = filteredReceived.filter((r) => String(r.material_id) === String(query.materialId));
  }
  if (query.dateFrom) {
    filteredReceived = filteredReceived.filter((r) => r.transaction_date >= query.dateFrom);
  }
  if (query.dateTo) {
    filteredReceived = filteredReceived.filter((r) => r.transaction_date <= query.dateTo);
  }

  // 3. Contractor live warehouse stock balance
  const [stockRows] = await pool.query(
    `SELECT ws.material_id, SUM(ws.quantity) AS current_balance,
            m.name AS material_name, m.code AS material_code, m.category, m.unit, m.default_rate
     FROM warehouse_stock ws
     JOIN materials m ON m.id = ws.material_id
     WHERE ws.warehouse_id IN (
       SELECT w.id FROM warehouses w
       JOIN projects prj ON prj.id = ?
       LEFT JOIN sites st ON st.project_id = prj.id
       WHERE (w.contractor_id = prj.contractor_id OR w.contractor_id = st.contractor_id)
     )
     GROUP BY ws.material_id, m.name, m.code, m.category, m.unit, m.default_rate`,
    [pId]
  );

  // 4. Summaries by material: Total Received -> Total Used -> Current Balance
  const materialMap = new Map();

  // Seed from live stock
  stockRows.forEach((s) => {
    materialMap.set(Number(s.material_id), {
      materialId: s.material_id,
      name: s.material_name,
      code: s.material_code,
      category: s.category,
      unit: s.unit,
      defaultRate: Number(s.default_rate || 0),
      received: 0,
      used: 0,
      balance: Number(s.current_balance || 0),
    });
  });

  // Accumulate used
  filteredUsed.forEach((u) => {
    const mId = Number(u.material_id);
    const unitRate = Number(u.default_rate || 0);
    const qty = u.quantity_used != null ? Number(u.quantity_used) : (unitRate > 0 ? Number((Number(u.amount) / unitRate).toFixed(2)) : 1);

    if (!materialMap.has(mId)) {
      materialMap.set(mId, {
        materialId: mId,
        name: u.material_name,
        code: u.material_code,
        category: u.material_category,
        unit: u.unit,
        defaultRate: unitRate,
        received: 0,
        used: 0,
        balance: 0,
      });
    }
    const item = materialMap.get(mId);
    item.used += qty;
  });

  // Accumulate received
  filteredReceived.forEach((r) => {
    const mId = Number(r.material_id);
    if (!materialMap.has(mId)) {
      materialMap.set(mId, {
        materialId: mId,
        name: r.material_name,
        code: r.material_code,
        category: r.material_category,
        unit: r.unit,
        defaultRate: Number(r.default_rate || 0),
        received: 0,
        used: 0,
        balance: 0,
      });
    }
    const item = materialMap.get(mId);
    item.received += Number(r.quantity || 0);
  });

  // Ensure balance equation holds: Received = Used + Balance
  const materialSummaries = Array.from(materialMap.values()).map((m) => {
    const totalUsed = Number(m.used.toFixed(2));
    let totalReceived = Number(m.received.toFixed(2));
    let balance = Number(m.balance.toFixed(2));

    if (totalReceived < totalUsed + balance) {
      totalReceived = Number((totalUsed + balance).toFixed(2));
    } else {
      balance = Number((totalReceived - totalUsed).toFixed(2));
    }

    return {
      ...m,
      received: totalReceived,
      used: totalUsed,
      balance,
      usedCost: Number((totalUsed * m.defaultRate).toFixed(2)),
    };
  });

  const usedItems = filteredUsed.map((u) => {
    const unitRate = Number(u.default_rate || 0);
    const qty = u.quantity_used != null ? Number(u.quantity_used) : (unitRate > 0 ? Number((Number(u.amount) / unitRate).toFixed(2)) : 1);
    const matSummary = materialMap.get(Number(u.material_id));
    const workDate = u.work_date || u.expense_date;
    return {
      id: u.expense_id || u.work_update_id,
      expenseNumber: u.expense_number,
      expense_number: u.expense_number,
      materialId: u.material_id,
      material_id: u.material_id,
      materialName: u.material_name,
      material_name: u.material_name,
      materialCode: u.material_code,
      material_code: u.material_code,
      category: u.material_category,
      material_category: u.material_category,
      quantityUsed: qty,
      quantity_used: qty,
      unit: u.unit,
      rate: unitRate,
      totalCost: Number(u.amount || 0),
      total_cost: Number(u.amount || 0),
      usageDate: workDate,
      usage_date: workDate,
      work_date: workDate,
      contractorName: u.contractor_name || 'Direct / General',
      contractor_name: u.contractor_name || 'Direct / General',
      phaseNumber: u.phase_number,
      phase_number: u.phase_number,
      phaseTitle: u.phase_title || (u.phase_number ? `Phase ${u.phase_number}` : 'General Construction'),
      phase_name: u.phase_title || (u.phase_number ? `Phase ${u.phase_number}` : 'General Construction'),
      taskName: u.phase_title || u.subcategory || 'General Construction',
      task_name: u.phase_title || u.subcategory || 'General Construction',
      subcategory: u.subcategory || 'Daily Work',
      subcategory_name: u.subcategory || 'Daily Work',
      siteName: u.site_name || 'All Sites',
      site_name: u.site_name || 'All Sites',
      remainingQuantity: matSummary?.balance ?? 0,
      remaining_quantity: matSummary?.balance ?? 0,
      status: 'Verified & Deducted',
      verified_by_engineer: true,
      reference: u.reference || u.transaction_number || u.expense_number,
      remarks: u.notes,
    };
  });

  const receivedItems = filteredReceived.map((r) => ({
    id: r.id,
    transactionNumber: r.transaction_number,
    transaction_number: r.transaction_number,
    materialId: r.material_id,
    material_id: r.material_id,
    materialName: r.material_name,
    material_name: r.material_name,
    materialCode: r.material_code,
    material_code: r.material_code,
    category: r.material_category,
    quantity: Number(r.quantity || 0),
    unit: r.unit,
    source: r.source_name || 'Main Store (WH-001)',
    source_warehouse_name: r.source_name || 'Main Store (WH-001)',
    destination: r.destination_name || 'Contractor Store',
    destination_warehouse_name: r.destination_name || 'Contractor Store',
    contractorName: r.contractor_name || '—',
    contractor_name: r.contractor_name || '—',
    siteName: r.site_name || 'Central Store',
    site_name: r.site_name || 'Central Store',
    date: r.transaction_date,
    transaction_date: r.transaction_date,
    reference: r.reference || r.transaction_number,
    notes: r.notes,
  }));

  const summaryTotals = {
    totalReceived: Number(materialSummaries.reduce((s, m) => s + m.received, 0).toFixed(2)),
    totalUsed: Number(materialSummaries.reduce((s, m) => s + m.used, 0).toFixed(2)),
    balance: Number(materialSummaries.reduce((s, m) => s + m.balance, 0).toFixed(2)),
    usedCost: Number(materialSummaries.reduce((s, m) => s + m.usedCost, 0).toFixed(2)),
    byMaterial: materialSummaries,
  };

  return {
    projectId: pId,
    projectName: project.name,
    summary: summaryTotals,
    materials: materialSummaries,
    received: receivedItems,
    used: usedItems,
  };
}

// --------------------------------------------------- Labour Tracking (Task-wise Assigned vs Worked vs Remaining)

async function getLabourTracking(projectId, query = {}) {
  const pId = Number(projectId);
  const project = await getById(pId);

  const siteFilter = query.siteId ? Number(query.siteId) : null;
  const dateFrom = query.dateFrom ? query.dateFrom : null;
  const dateTo = query.dateTo ? query.dateTo : null;

  // 1. Fetch all manual tasks for this project
  let tasksSql = `
    SELECT pt.*, s.name AS site_name
    FROM project_tasks pt
    LEFT JOIN sites s ON s.id = pt.site_id
    WHERE pt.project_id = ?
  `;
  const taskParams = [pId];
  if (siteFilter) {
    tasksSql += ' AND pt.site_id = ?';
    taskParams.push(siteFilter);
  }
  tasksSql += ' ORDER BY pt.id ASC';
  const [tasks] = await pool.query(tasksSql, taskParams);

  // 2. Fetch task labour budget allocations
  const [taskLabourRows] = await pool.query(
    `SELECT tl.*, pt.name AS task_name, s.name AS site_name
     FROM task_labour tl
     JOIN project_tasks pt ON pt.id = tl.task_id
     LEFT JOIN sites s ON s.id = tl.site_id
     WHERE pt.project_id = ?
     ORDER BY tl.task_id, tl.id`,
    [pId]
  );

  // 3. Fetch task worker logs (actual labour attendance on tasks)
  let workerLogsSql = `
    SELECT twl.*, pt.name AS task_name, s.name AS site_name, c.name AS contractor_name
    FROM task_worker_logs twl
    JOIN project_tasks pt ON pt.id = twl.task_id
    LEFT JOIN sites s ON s.id = twl.site_id
    LEFT JOIN contractors c ON c.id = twl.contractor_id
    WHERE pt.project_id = ?
  `;
  const workerLogsParams = [pId];
  if (siteFilter) {
    workerLogsSql += ' AND (twl.site_id = ? OR (twl.site_id IS NULL AND pt.site_id = ?))';
    workerLogsParams.push(siteFilter, siteFilter);
  }
  if (dateFrom) {
    workerLogsSql += ' AND twl.work_date >= ?';
    workerLogsParams.push(dateFrom);
  }
  if (dateTo) {
    workerLogsSql += ' AND twl.work_date <= ?';
    workerLogsParams.push(dateTo);
  }
  workerLogsSql += ' ORDER BY twl.work_date DESC, twl.id DESC';
  const [workerLogs] = await pool.query(workerLogsSql, workerLogsParams);

  // 4. Fetch general labour_records (for backward compatibility / quick logs)
  let labourSql = `
    SELECT lr.*, c.name AS contractor_name, s.name AS site_name, s.id AS site_id,
           (lr.present_count * lr.daily_rate) AS daily_cost
    FROM labour_records lr
    LEFT JOIN contractors c ON c.id = lr.contractor_id
    LEFT JOIN sites s ON s.id = lr.site_id
    WHERE (s.project_id = ? OR lr.site_id IN (SELECT id FROM sites WHERE project_id = ?))
  `;
  const labourParams = [pId, pId];
  if (siteFilter) {
    labourSql += ' AND lr.site_id = ?';
    labourParams.push(siteFilter);
  }
  if (dateFrom) {
    labourSql += ' AND lr.record_date >= ?';
    labourParams.push(dateFrom);
  }
  if (dateTo) {
    labourSql += ' AND lr.record_date <= ?';
    labourParams.push(dateTo);
  }
  labourSql += ' ORDER BY lr.record_date DESC, lr.id DESC';
  const [labourRecords] = await pool.query(labourSql, labourParams);

  // 5. Fetch daily_work_updates
  let dailyWorkSql = `
    SELECT dwu.*, c.name AS contractor_name, s.name AS site_name, pt.name AS task_name
    FROM daily_work_updates dwu
    LEFT JOIN contractors c ON c.id = dwu.contractor_id
    LEFT JOIN sites s ON s.id = dwu.site_id
    LEFT JOIN project_tasks pt ON pt.id = dwu.task_id
    WHERE dwu.project_id = ?
  `;
  const dailyWorkParams = [pId];
  if (siteFilter) {
    dailyWorkSql += ' AND dwu.site_id = ?';
    dailyWorkParams.push(siteFilter);
  }
  if (dateFrom) {
    dailyWorkSql += ' AND dwu.work_date >= ?';
    dailyWorkParams.push(dateFrom);
  }
  if (dateTo) {
    dailyWorkSql += ' AND dwu.work_date <= ?';
    dailyWorkParams.push(dateTo);
  }
  dailyWorkSql += ' ORDER BY dwu.work_date DESC, dwu.id DESC';
  const [dailyWorkRecords] = await pool.query(dailyWorkSql, dailyWorkParams);

  // Build taskMap from project_tasks
  const taskMap = new Map();

  for (const t of tasks) {
    const durDays = Number(t.duration_days) > 0 ? Number(t.duration_days) : 1;
    taskMap.set(t.id, {
      task_id: t.id,
      task_name: t.name,
      site_id: t.site_id,
      site_name: t.site_name || 'General Site',
      status: t.status || 'on-track',
      duration_days: durDays,
      calculated_working_days: durDays,
      labourItems: [],
      totalBudgetedWorkers: 0,
      totalBudgetedDays: 0,
      totalBudgetedCost: Number(t.labour_budget || 0),
      workedDays: 0,
      workedCost: 0,
      remainingDays: 0,
      remainingCost: 0,
    });
  }

  // Populate labourItems from task_labour
  taskLabourRows.forEach((tl) => {
    let group = taskMap.get(tl.task_id);
    if (!group) {
      group = {
        task_id: tl.task_id,
        task_name: tl.task_name || `Task #${tl.task_id}`,
        site_id: tl.site_id,
        site_name: tl.site_name || 'General Site',
        status: 'on-track',
        duration_days: Number(tl.working_days || 1),
        calculated_working_days: Number(tl.working_days || 1),
        labourItems: [],
        totalBudgetedWorkers: 0,
        totalBudgetedDays: 0,
        totalBudgetedCost: 0,
        workedDays: 0,
        workedCost: 0,
        remainingDays: 0,
        remainingCost: 0,
      };
      taskMap.set(tl.task_id, group);
    }

    const workerCount = Number(tl.worker_count || 1);
    const wage = Number(tl.daily_wage || 0);
    const days = Number(tl.working_days || group.duration_days || 1);
    const cost = Number(tl.total_cost || (workerCount * wage * days));

    group.labourItems.push({
      labour_type: tl.labour_type || tl.skill_trade || tl.labour_name || 'General Labour',
      labour_name: tl.labour_name || '',
      workers_count: workerCount,
      worker_count: workerCount,
      daily_wage: wage,
      working_days: days,
      total_cost: cost,
      remarks: tl.remarks || '',
    });

    group.totalBudgetedWorkers += workerCount;
    group.totalBudgetedDays += (workerCount * days);
    group.totalBudgetedCost = Math.max(group.totalBudgetedCost, group.labourItems.reduce((s, i) => s + i.total_cost, 0));
  });

  // Calculate worked labour on each task from task_worker_logs
  workerLogs.forEach((wl) => {
    const group = taskMap.get(wl.task_id);
    if (group) {
      const isCompany = wl.worker_type === 'company_labour' || wl.worker_type === 'company_employee' || String(wl.labour_type || '').toLowerCase().includes('company');
      const hours = Number(wl.hours_worked || 8);
      const days = Number((hours / 8).toFixed(2));
      const wage = isCompany ? 0 : Number(wl.daily_wage || 0);
      const cost = isCompany ? 0 : Number((wage * days).toFixed(2));
      group.workedDays += days;
      group.workedCost += cost;
    }
  });

  // Compute remaining for each task
  for (const group of taskMap.values()) {
    group.remainingDays = Math.max(0, group.totalBudgetedDays - group.workedDays);
    group.remainingCost = Math.max(0, group.totalBudgetedCost - group.workedCost);
  }

  const allTasks = Array.from(taskMap.values());

  // Aggregate summary
  const budgetedWorkers = allTasks.reduce((sum, t) => sum + (t.totalBudgetedWorkers || (t.labourItems.length > 0 ? t.labourItems.reduce((s, i) => s + i.workers_count, 0) : 0)), 0);
  const budgetedDays = allTasks.reduce((sum, t) => sum + t.totalBudgetedDays, 0);
  const budgetedCost = allTasks.reduce((sum, t) => sum + t.totalBudgetedCost, 0);

  // Build unified worked list
  const workedList = [
    ...workerLogs.map((wl) => {
      const isCompany = wl.worker_type === 'company_labour' || wl.worker_type === 'company_employee' || String(wl.labour_type || '').toLowerCase().includes('company');
      const hours = Number(wl.hours_worked || 8);
      const days = Number((hours / 8).toFixed(2));
      const wage = isCompany ? 0 : Number(wl.daily_wage || 0);
      const cost = isCompany ? 0 : Number((wage * days).toFixed(2));
      return {
        daily_work_id: wl.id,
        work_date: wl.work_date,
        contractor_name: wl.contractor_name || 'Direct / General',
        site_name: wl.site_name || 'Main Site',
        site_id: wl.site_id,
        task_id: wl.task_id,
        task_name: wl.task_name,
        phase_name: wl.task_name,
        labour_type: wl.labour_type || (isEmployee ? 'Company Employee' : 'General Labour'),
        subcategory_name: wl.worker_name ? `${wl.worker_name} (${isEmployee ? 'Company Staff' : 'Daily Wage Worker'})` : (wl.labour_type || 'Task Worker'),
        labour_count: 1,
        working_hours: hours,
        work_description: wl.work_performed || `Work by ${wl.worker_name || 'labour'}`,
        verified_by_engineer: true,
        daily_cost: cost,
      };
    }),
    ...labourRecords.map((r) => ({
      daily_work_id: r.id + 500000,
      work_date: r.record_date,
      contractor_name: r.contractor_name || 'Direct / General',
      site_name: r.site_name || 'Main Site',
      site_id: r.site_id,
      task_name: 'General Attendance',
      phase_name: r.category,
      subcategory_name: r.category,
      labour_count: r.present_count,
      working_hours: 8,
      work_description: `${r.category} deployment (${r.present_count}/${r.worker_count} present)`,
      verified_by_engineer: r.payment_status === 'verified' || r.payment_status === 'paid',
      daily_cost: Number(r.daily_cost || 0),
    })),
    ...dailyWorkRecords.map((dw) => ({
      daily_work_id: dw.id + 100000,
      work_date: dw.work_date,
      contractor_name: dw.contractor_name || 'Direct / General',
      site_name: dw.site_name || 'General Site',
      site_id: dw.site_id,
      task_id: dw.task_id,
      task_name: dw.task_name,
      phase_name: dw.task_name || dw.phase_title || 'Site Work',
      subcategory_name: dw.subcategory,
      labour_count: 1,
      working_hours: 8,
      work_description: dw.work_done,
      verified_by_engineer: true,
      daily_cost: 0,
    })),
  ];

  const totalWorkedDays = workedList.reduce((sum, r) => sum + Number(r.labour_count || 1), 0);
  const totalWorkedCost = workedList.reduce((sum, r) => sum + Number(r.daily_cost || 0), 0);

  return {
    projectId: pId,
    projectName: project.name,
    summary: {
      budgetedWorkers,
      budgetedDays,
      budgetedCost,
      workedDays: totalWorkedDays,
      workedCost: totalWorkedCost,
      remainingDays: budgetedDays > 0 ? Math.max(0, budgetedDays - totalWorkedDays) : 0,
      remainingCost: budgetedCost > 0 ? Math.max(0, budgetedCost - totalWorkedCost) : 0,
    },
    worked: workedList,
    tasks: allTasks,
    budgetByTask: allTasks,
    budgetByPhase: allTasks.map((t, idx) => ({
      phase_number: idx + 1,
      phase_name: t.task_name,
      task_id: t.task_id,
      task_name: t.task_name,
      site_name: t.site_name,
      status: t.status,
      calculated_working_days: t.duration_days,
      working_days_per_month: 25,
      expected_duration_months: Math.max(0.1, Number((t.duration_days / 25).toFixed(1))),
      labourItems: t.labourItems,
      totalBudgetedDays: t.totalBudgetedDays,
      totalBudgetedCost: t.totalBudgetedCost,
      workedDays: t.workedDays,
      workedCost: t.workedCost,
      remainingCost: t.remainingCost,
    })),
  };
}

async function logLabour(projectId, payload) {
  const pId = Number(projectId);
  const project = await getById(pId);
  let siteId = payload.site_id ? Number(payload.site_id) : null;
  if (!siteId) {
    const [sites] = await pool.query('SELECT id FROM sites WHERE project_id = ? LIMIT 1', [pId]);
    if (sites.length > 0) {
      siteId = sites[0].id;
    } else {
      const [res] = await pool.query(
        'INSERT INTO sites (project_id, name, address, contractor_id, status) VALUES (?, ?, ?, ?, ?)',
        [pId, `${project.name} - Site 1`, project.location || 'Main Site', payload.contractor_id || project.contractor_id || null, 'on-track']
      );
      siteId = res.insertId;
    }
  }

  const workerCount = Number(payload.worker_count || 1);
  const presentCount = payload.present_count !== undefined ? Number(payload.present_count) : workerCount;
  const dailyRate = Number(payload.daily_rate || 500);

  const [result] = await pool.query(
    `INSERT INTO labour_records (site_id, contractor_id, category, worker_count, present_count, record_date, daily_rate, payment_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      siteId,
      payload.contractor_id || project.contractor_id || null,
      payload.category || 'General Labour',
      workerCount,
      presentCount,
      payload.record_date || new Date().toISOString().slice(0, 10),
      dailyRate,
      payload.payment_status || 'verified',
    ]
  );

  // If task_id provided, also record in task_worker_logs for task-wise tracking!
  if (payload.task_id) {
    const tId = Number(payload.task_id);
    for (let i = 0; i < presentCount; i++) {
      const workerName = payload.worker_name || `${payload.category || 'Worker'} #${i + 1}`;
      await pool.query(
        `INSERT INTO task_worker_logs (task_id, project_id, site_id, contractor_id, worker_name, labour_type, work_date, hours_worked, daily_wage, work_performed)
         VALUES (?, ?, ?, ?, ?, ?, ?, 8, ?, ?)`,
        [
          tId,
          pId,
          siteId,
          payload.contractor_id || project.contractor_id || null,
          workerName,
          payload.category || 'General Labour',
          payload.record_date || new Date().toISOString().slice(0, 10),
          dailyRate,
          payload.work_description || `Attendance logged: ${payload.category || 'Labour'}`,
        ]
      );
    }
  }

  return { id: result.insertId, site_id: siteId, ...payload };
}

module.exports = {
  list, getById, getDetail, create, update, archive, assignTeam, addSite, toProject,
  addDocuments, getDocumentFile, deleteDocument,
  getMaterialTracking, getLabourTracking, logLabour,
};
