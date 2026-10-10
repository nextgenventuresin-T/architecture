'use strict';

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

/**
 * Task Data Access Model.
 * Handles Project -> Site -> Task creation, budgeting, tracking,
 * worker logging, material usage, actual expenses, and budget utilization.
 */

function inclusiveDays(start, end) {
  if (!start || !end) return 0;
  const s = new Date(String(start).slice(0, 10));
  const e = new Date(String(end).slice(0, 10));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

/**
 * Machines & tools are budgeted by days, like labour: a rented machine costs
 * quantity x rate per day x days; a purchased one is a one-time quantity x cost.
 * The total is always recomputed here, never taken from the client.
 */
function normalizeToolRow(t, fallbackDays) {
  const rentalType = t.rental_type || t.rentalType || 'Rent';
  const isPurchase = String(rentalType).toLowerCase() === 'purchase';
  const qty = Math.max(0, Number(t.quantity || 1));
  const cost = Math.max(0, Number(t.cost || 0));
  const startDate = t.start_date || t.startDate || null;
  const endDate = t.end_date || t.endDate || null;
  let days = Number(t.working_days ?? t.workingDays ?? 0);
  if (!(days > 0)) days = inclusiveDays(startDate, endDate) || Number(fallbackDays || 0) || 1;
  if (isPurchase) days = 1;
  const total = Number((qty * cost * days).toFixed(2));
  return {
    toolId: t.tool_id || t.toolId || null,
    toolName: (t.tool_name || t.toolName || t.name || '').trim(),
    rentalType,
    qty,
    cost,
    days,
    total,
    startDate: isPurchase ? null : startDate,
    endDate: isPurchase ? null : endDate,
  };
}

/**
 * Subtask scope for a query on a table carrying task_id + subtask_id.
 *   undefined -> the whole main task (every row, legacy behaviour)
 *   null      -> rows booked directly on the main task (not in any subtask)
 *   number    -> rows of that one subtask
 */
function subtaskScope(alias, subtaskId) {
  const col = alias ? `${alias}.subtask_id` : 'subtask_id';
  if (subtaskId === undefined) return { sql: '', params: [] };
  if (subtaskId === null) return { sql: ` AND ${col} IS NULL`, params: [] };
  return { sql: ` AND ${col} = ?`, params: [Number(subtaskId)] };
}

/** Normalises a request value into the scope used by subtaskScope(). */
function toSubtaskId(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '' || Number(value) <= 0) return null;
  return Number(value);
}

/**
 * Machines & tools planned in the task budget (allocation rows written by the old
 * allocate flow carry contractor_id / requested_by and are not planning rows).
 * Rows typed as free text are matched to the tool master by name.
 * `subtaskId` narrows to one subtask (or, when null, to the main task's direct plan).
 */
async function findPlannedTools(taskId, conn = pool, subtaskId = undefined) {
  const plan = subtaskScope('tt', subtaskId);
  const reqScope = subtaskScope('', subtaskId);
  const [rows] = await conn.query(
    `SELECT tt.id, COALESCE(tt.tool_id, tm.id) AS tool_id, COALESCE(t.name, tm.name, tt.tool_name) AS tool_name,
            COALESCE(t.type, tm.type) AS tool_type, tt.rental_type, tt.quantity, tt.working_days, tt.cost, tt.total_cost
     FROM task_tools tt
     LEFT JOIN tools t ON t.id = tt.tool_id
     LEFT JOIN tools tm ON tt.tool_id IS NULL AND LOWER(TRIM(tm.name)) = LOWER(TRIM(tt.tool_name))
     WHERE tt.task_id = ? AND tt.contractor_id IS NULL AND tt.requested_by IS NULL${plan.sql}
     ORDER BY tt.id`,
    [taskId, ...plan.params]
  );
  const [req] = await conn.query(
    `SELECT tool_id, COALESCE(SUM(quantity), 0) AS qty
     FROM procurement_requests
     WHERE task_id = ? AND item_type = 'tool' AND status NOT IN ('rejected', 'cancelled')${reqScope.sql}
     GROUP BY tool_id`,
    [taskId, ...reqScope.params]
  );
  const requested = new Map(req.map((r) => [Number(r.tool_id), Number(r.qty)]));
  const byTool = new Map();
  for (const r of rows) {
    const key = r.tool_id ? Number(r.tool_id) : `name:${r.tool_name}`;
    const cur = byTool.get(key) || {
      toolId: r.tool_id ? Number(r.tool_id) : null,
      toolName: r.tool_name,
      toolType: r.tool_type || null,
      plannedQuantity: 0,
      plannedDays: 0,
      plannedRate: Number(r.cost || 0),
      plannedTotal: 0,
      rentalType: r.rental_type,
    };
    cur.plannedQuantity += Number(r.quantity || 0);
    cur.plannedDays = Math.max(cur.plannedDays, Number(r.working_days || 0));
    cur.plannedTotal = Number((cur.plannedTotal + Number(r.total_cost || 0)).toFixed(2));
    byTool.set(key, cur);
  }
  return [...byTool.values()].map((t) => {
    const alreadyRequested = t.toolId ? requested.get(t.toolId) || 0 : 0;
    return { ...t, alreadyRequested, remainingQuantity: Math.max(0, t.plannedQuantity - alreadyRequested) };
  });
}

async function insertToolRow(connection, taskId, projectId, siteId, r, subtaskId = null) {
  await connection.query(
    `INSERT INTO task_tools (task_id, subtask_id, project_id, site_id, tool_id, tool_name, rental_type, quantity, cost, working_days, total_cost, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [taskId, subtaskId, projectId, siteId, r.toolId, r.toolName, r.rentalType, r.qty, r.cost, r.days, r.total, r.startDate, r.endDate]
  );
}

/** Sum of every subtask's planned budget under a main task, per category. */
async function subtaskBudgetTotals(conn, taskId) {
  const [[row]] = await conn.query(
    `SELECT COUNT(*) AS cnt,
            COALESCE(SUM(material_budget), 0) AS material, COALESCE(SUM(tool_budget), 0) AS tool,
            COALESCE(SUM(labour_budget), 0) AS labour, COALESCE(SUM(misc_budget), 0) AS misc,
            COALESCE(SUM(total_budget), 0) AS total
     FROM task_subtasks WHERE task_id = ?`,
    [taskId]
  );
  return {
    count: Number(row.cnt || 0),
    material: Number(row.material || 0),
    tool: Number(row.tool || 0),
    labour: Number(row.labour || 0),
    misc: Number(row.misc || 0),
    total: Number(row.total || 0),
  };
}

/** Project estimated budget = sum of MAIN task budgets (subtasks are already inside them). */
async function refreshProjectEstimate(conn, projectId, { allowZero = false } = {}) {
  const [[budgetSum]] = await conn.query(
    'SELECT COALESCE(SUM(total_budget), 0) AS total_sum FROM project_tasks WHERE project_id = ?',
    [projectId]
  );
  if (allowZero || Number(budgetSum.total_sum) > 0) {
    await conn.query('UPDATE projects SET estimated_budget = ? WHERE id = ?', [Number(budgetSum.total_sum || 0), projectId]);
  }
}

function computeTaskBudgetUtilization(task, materials = [], dailyWork = [], workerLogs = [], expenses = []) {
  // 1. Materials
  const budgetedMaterial = Number(task.material_budget || task.materialBudget || 0);
  const materialRateMap = new Map();
  materials.forEach((m) => {
    materialRateMap.set(Number(m.material_id || m.materialId), Number(m.cost_per_unit || m.costPerUnit || 0));
  });

  let actualMaterial = 0;
  dailyWork.forEach((dw) => {
    const matId = Number(dw.material_id || dw.materialId);
    const qtyUsed = Number(dw.quantity_used || dw.quantityUsed || 0);
    if (matId && qtyUsed > 0) {
      const unitRate = materialRateMap.get(matId) || Number(dw.cost_per_unit || dw.unit_rate || dw.default_rate || 0);
      actualMaterial += qtyUsed * unitRate;
    }
  });
  actualMaterial = Number(actualMaterial.toFixed(2));
  const remainingMaterial = Math.max(0, Number((budgetedMaterial - actualMaterial).toFixed(2)));
  const utilizationMaterial = budgetedMaterial > 0 ? Number(((actualMaterial / budgetedMaterial) * 100).toFixed(1)) : 0;
  const isExceededMaterial = actualMaterial > budgetedMaterial;
  const exceededMaterial = Math.max(0, Number((actualMaterial - budgetedMaterial).toFixed(2)));

  // 2. Tools / Machines
  const budgetedTools = Number(task.tool_budget || task.toolBudget || 0);
  const toolExpenseCategories = new Set(['Equipment Rental', 'Tools', 'Machinery', 'Equipment', 'Tools & Equipment', 'Machine / Tool']);
  let actualTools = 0;
  dailyWork.forEach((dw) => {
    if (dw.tool_cost || dw.toolCost) {
      actualTools += Number(dw.tool_cost || dw.toolCost || 0);
    }
  });
  expenses.forEach((e) => {
    if (toolExpenseCategories.has(e.category)) {
      if (!e.reference?.startsWith('DWU-TOOL-')) {
        actualTools += Number(e.amount || 0);
      }
    }
  });
  actualTools = Number(actualTools.toFixed(2));
  const remainingTools = Math.max(0, Number((budgetedTools - actualTools).toFixed(2)));
  const utilizationTools = budgetedTools > 0 ? Number(((actualTools / budgetedTools) * 100).toFixed(1)) : 0;
  const isExceededTools = actualTools > budgetedTools;
  const exceededTools = Math.max(0, Number((actualTools - budgetedTools).toFixed(2)));

  // 3. Labour
  const budgetedLabour = Number(task.labour_budget || task.labourBudget || 0);
  let actualLabour = 0;
  if (workerLogs.length > 0) {
    workerLogs.forEach((w) => {
      const isEmployee = (w.worker_type === 'company_employee' || w.workerType === 'company_employee' || String(w.labour_type || w.labourType || '').toLowerCase().includes('company'));
      if (!isEmployee) {
        const hours = Number(w.hours_worked || w.hoursWorked || 8);
        const wage = Number(w.daily_wage || w.dailyWage || 0);
        actualLabour += (hours / 8) * wage;
      }
    });
  }
  actualLabour = Number(actualLabour.toFixed(2));
  const remainingLabour = Math.max(0, Number((budgetedLabour - actualLabour).toFixed(2)));
  const utilizationLabour = budgetedLabour > 0 ? Number(((actualLabour / budgetedLabour) * 100).toFixed(1)) : 0;
  const isExceededLabour = actualLabour > budgetedLabour;
  const exceededLabour = Math.max(0, Number((actualLabour - budgetedLabour).toFixed(2)));

  // 4. Miscellaneous
  const budgetedMisc = Number(task.misc_budget || task.miscBudget || 0);
  let actualMisc = 0;
  dailyWork.forEach((dw) => {
    if (dw.misc_amount || dw.miscAmount) {
      actualMisc += Number(dw.misc_amount || dw.miscAmount || 0);
    }
  });
  const miscCategories = ['Miscellaneous', 'Misc', 'Operational Misc', 'Material Transport'];
  // Categories already measured elsewhere: material via consumption, labour via worker logs.
  const notMiscCategories = new Set(['Material Consumption', 'material', 'labour', 'Labour Expense', 'Advance Wages', 'Labour Conveyance']);
  expenses.forEach((e) => {
    if (miscCategories.includes(e.category)) {
      if (!e.reference?.startsWith('DWU-MISC-')) {
        actualMisc += Number(e.amount || 0);
      }
    } else if (
      // A manually entered expense linked to this task / subtask (source_type is set
      // on every system-generated one) counts as miscellaneous spend.
      !e.source_type && e.task_id && !toolExpenseCategories.has(e.category) && !notMiscCategories.has(e.category)
      && !['rejected', 'cancelled'].includes(e.status) && !String(e.reference || '').startsWith('DWU-')
    ) {
      actualMisc += Number(e.amount || 0);
    }
  });
  actualMisc = Number(actualMisc.toFixed(2));
  const remainingMisc = Math.max(0, Number((budgetedMisc - actualMisc).toFixed(2)));
  const utilizationMisc = budgetedMisc > 0 ? Number(((actualMisc / budgetedMisc) * 100).toFixed(1)) : 0;
  const isExceededMisc = actualMisc > budgetedMisc;
  const exceededMisc = Math.max(0, Number((actualMisc - budgetedMisc).toFixed(2)));

  // 5. Task Total
  const budgetedTotal = Number(task.total_budget || task.totalBudget || 0);
  const approvedAdditional = Number(task.approved_additional_budget || task.approvedAdditionalBudget || 0);
  const pendingExcess = Number(task.pending_excess_budget || task.pendingExcessBudget || 0);
  const effectiveBudget = Number((budgetedTotal + approvedAdditional).toFixed(2));
  const actualTotal = Number((actualMaterial + actualTools + actualLabour + actualMisc).toFixed(2));
  const remainingTotal = Math.max(0, Number((effectiveBudget - actualTotal).toFixed(2)));
  const utilizationTotal = effectiveBudget > 0 ? Number(((actualTotal / effectiveBudget) * 100).toFixed(1)) : 0;
  const isExceededTotal = actualTotal > effectiveBudget;
  const exceededTotal = Math.max(0, Number((actualTotal - effectiveBudget).toFixed(2)));

  return {
    materials: {
      budgeted: budgetedMaterial,
      actual: actualMaterial,
      remaining: remainingMaterial,
      utilization: utilizationMaterial,
      isExceeded: isExceededMaterial,
      exceededAmount: exceededMaterial,
    },
    tools: {
      budgeted: budgetedTools,
      actual: actualTools,
      remaining: remainingTools,
      utilization: utilizationTools,
      isExceeded: isExceededTools,
      exceededAmount: exceededTools,
    },
    labour: {
      budgeted: budgetedLabour,
      actual: actualLabour,
      remaining: remainingLabour,
      utilization: utilizationLabour,
      isExceeded: isExceededLabour,
      exceededAmount: exceededLabour,
    },
    misc: {
      budgeted: budgetedMisc,
      actual: actualMisc,
      remaining: remainingMisc,
      utilization: utilizationMisc,
      isExceeded: isExceededMisc,
      exceededAmount: exceededMisc,
    },
    total: {
      budgeted: budgetedTotal,
      approvedAdditional,
      effectiveBudget,
      pendingExcess,
      actual: actualTotal,
      remaining: remainingTotal,
      utilization: utilizationTotal,
      isExceeded: isExceededTotal,
      exceededAmount: exceededTotal,
      excessReason: task.excess_reason || task.excessReason || null,
    },
  };
}

async function getTaskBudgetApprovals(taskId) {
  const [rows] = await pool.query(
    `SELECT tba.*, u.full_name AS requested_by_name, du.full_name AS decided_by_name, st.name AS subtask_name
     FROM task_budget_approvals tba
     LEFT JOIN users u ON u.id = tba.requested_by
     LEFT JOIN users du ON du.id = tba.decided_by
     LEFT JOIN task_subtasks st ON st.id = tba.subtask_id
     WHERE tba.task_id = ?
     ORDER BY tba.created_at DESC`,
    [Number(taskId)]
  );
  return rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    subtaskId: r.subtask_id || null,
    subtaskName: r.subtask_name || null,
    projectId: r.project_id,
    siteId: r.site_id,
    category: r.category,
    budgetAmount: Number(r.budget_amount || 0),
    actualAmount: Number(r.actual_amount || 0),
    requestedExcess: Number(r.requested_excess || 0),
    reason: r.reason,
    status: r.status,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    approvalRequestId: r.approval_request_id,
    decidedBy: r.decided_by,
    decidedByName: r.decided_by_name,
    decisionNote: r.decision_note,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    originalPlannedWorkers: Number(r.original_planned_workers || 0),
    additionalWorkers: Number(r.additional_workers || 0),
    revisedLabourBudget: Number(r.revised_labour_budget || 0),
    workerId: r.worker_id,
    workerType: r.worker_type,
    workerName: r.worker_name,
  }));
}

async function createTask(payload) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const projectId = Number(payload.project_id);
    const siteId = payload.site_id ? Number(payload.site_id) : null;
    const name = payload.name.trim();
    const description = payload.description ? payload.description.trim() : null;
    const status = payload.status || 'on-track';
    const progress = Math.min(100, Math.max(0, Number(payload.progress || 0)));
    const startDate = payload.start_date || payload.planned_start || null;
    const endDate = payload.end_date || payload.planned_end || null;
    const durationDays = Number(payload.duration_days || 0);
    const createdBy = payload.created_by || null;

    // Calculate budget categories
    let materialBudget = 0;
    let toolBudget = 0;
    let labourBudget = 0;
    let miscBudget = 0;

    // Materials
    const materials = Array.isArray(payload.materials) ? payload.materials : [];
    for (const m of materials) {
      const qty = Number(m.quantity || 0);
      const rate = Number(m.cost_per_unit || m.costPerUnit || 0);
      const total = m.total_cost != null ? Number(m.total_cost) : qty * rate;
      materialBudget += total;
    }

    // Tools
    const tools = (Array.isArray(payload.tools) ? payload.tools : [])
      .map((t) => normalizeToolRow(t, durationDays))
      .filter((r) => r.toolName);
    for (const r of tools) toolBudget += r.total;

    // Labour
    const labour = Array.isArray(payload.labour) ? payload.labour : [];
    for (const l of labour) {
      const workers = Number(l.worker_count || l.workerCount || 1);
      const wage = Number(l.daily_wage || l.dailyWage || 0);
      const days = Number(l.working_days || l.workingDays || durationDays || 0);
      const total = l.total_cost != null ? Number(l.total_cost) : workers * wage * days;
      labourBudget += total;
    }

    // Misc
    const misc = Array.isArray(payload.misc) ? payload.misc : [];
    for (const mc of misc) {
      const amt = Number(mc.amount || 0);
      miscBudget += amt;
    }

    const totalBudget = materialBudget + toolBudget + labourBudget + miscBudget;

    // Insert task
    const [taskResult] = await connection.query(
      `INSERT INTO project_tasks
        (project_id, site_id, name, description, status, progress,
         start_date, end_date, planned_start, planned_end, duration_days,
         material_budget, tool_budget, labour_budget, misc_budget, total_budget, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        siteId,
        name,
        description,
        status,
        progress,
        startDate,
        endDate,
        startDate,
        endDate,
        durationDays,
        materialBudget,
        toolBudget,
        labourBudget,
        miscBudget,
        totalBudget,
        createdBy,
      ]
    );

    const taskId = taskResult.insertId;

    // Insert budget breakdown rows
    for (const m of materials) {
      if (m.material_id || m.materialId) {
        const qty = Number(m.quantity || 0);
        const rate = Number(m.cost_per_unit || m.costPerUnit || 0);
        const total = m.total_cost != null ? Number(m.total_cost) : qty * rate;
        await connection.query(
          `INSERT INTO task_materials (task_id, project_id, site_id, material_id, quantity, cost_per_unit, total_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [taskId, projectId, siteId, m.material_id || m.materialId, qty, rate, total]
        );
      }
    }

    for (const r of tools) await insertToolRow(connection, taskId, projectId, siteId, r);

    const seenWorkers = new Set();
    for (const l of labour) {
      const lType = (l.labour_type || l.labourType || 'Labour').trim();
      const lName = (l.labour_name || l.labourName || l.worker_name || l.workerName || '').trim();
      const workerId = l.worker_id || l.workerId ? Number(l.worker_id || l.workerId) : null;
      const workerType = l.worker_type || l.workerType || (lType.toLowerCase().includes('company') ? 'company_employee' : 'labour');
      const startDate = l.start_date || l.startDate || null;
      const endDate = l.end_date || l.endDate || null;
      const remarks = (l.remarks || '').trim() || null;
      const skillTrade = (l.skill_trade || l.skillTrade || l.trade || '').trim() || null;

      // Prevent duplicate assignment for same person on this task
      const workerKey = workerId ? `${workerType}-${workerId}` : (lName ? lName.toLowerCase() : null);
      if (workerKey && seenWorkers.has(workerKey)) continue;
      if (workerKey) seenWorkers.add(workerKey);

      const workers = Number(l.worker_count || l.workerCount || 1);
      const wage = Number(l.daily_wage || l.dailyWage || 0);
      const days = Number(l.working_days || l.workingDays || durationDays || 0);
      const total = l.total_cost != null ? Number(l.total_cost) : workers * wage * days;
      await connection.query(
        `INSERT INTO task_labour (
           task_id, project_id, site_id, labour_name, labour_type, worker_count,
           daily_wage, working_days, total_cost, worker_id, worker_type,
           start_date, end_date, remarks, skill_trade
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          taskId, projectId, siteId, lName || null, lType, workers,
          wage, days, total, workerId, workerType,
          startDate, endDate, remarks, skillTrade
        ]
      );
    }

    for (const mc of misc) {
      const desc = (mc.description || '').trim();
      if (desc) {
        const amt = Number(mc.amount || 0);
        await connection.query(
          `INSERT INTO task_misc (task_id, project_id, site_id, description, amount)
           VALUES (?, ?, ?, ?, ?)`,
          [taskId, projectId, siteId, desc, amt]
        );
      }
    }

    // Recalculate project total estimated budget across all tasks
    const [[budgetSum]] = await connection.query(
      `SELECT COALESCE(SUM(total_budget), 0) AS total_sum FROM project_tasks WHERE project_id = ?`,
      [projectId]
    );
    if (Number(budgetSum.total_sum) > 0) {
      await connection.query('UPDATE projects SET estimated_budget = ? WHERE id = ?', [
        Number(budgetSum.total_sum),
        projectId,
      ]);
    }

    await connection.commit();
    return taskId;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function updateTask(taskId, payload) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query('SELECT * FROM project_tasks WHERE id = ?', [taskId]);
    if (!existing.length) throw new Error('Task not found');
    const task = existing[0];

    const projectId = task.project_id;
    const siteId = payload.site_id !== undefined ? (payload.site_id ? Number(payload.site_id) : null) : task.site_id;
    const name = payload.name !== undefined ? payload.name.trim() : task.name;
    const description = payload.description !== undefined ? payload.description?.trim() : task.description;
    const status = payload.status !== undefined ? payload.status : task.status;
    const progress = payload.progress !== undefined ? Math.min(100, Math.max(0, Number(payload.progress))) : task.progress;
    const startDate = payload.start_date !== undefined ? payload.start_date : task.start_date;
    const endDate = payload.end_date !== undefined ? payload.end_date : task.end_date;
    const durationDays = payload.duration_days !== undefined ? Number(payload.duration_days) : task.duration_days;

    // Check if budget items were provided
    let materialBudget = Number(task.material_budget || 0);
    let toolBudget = Number(task.tool_budget || 0);
    let labourBudget = Number(task.labour_budget || 0);
    let miscBudget = Number(task.misc_budget || 0);

    const hasMaterials = Array.isArray(payload.materials);
    const hasTools = Array.isArray(payload.tools);
    const hasLabour = Array.isArray(payload.labour);
    const hasMisc = Array.isArray(payload.misc);

    if (hasMaterials) {
      materialBudget = 0;
      await connection.query('DELETE FROM task_materials WHERE task_id = ? AND subtask_id IS NULL', [taskId]);
      for (const m of payload.materials) {
        if (m.material_id || m.materialId) {
          const qty = Number(m.quantity || 0);
          const rate = Number(m.cost_per_unit || m.costPerUnit || 0);
          const total = m.total_cost != null ? Number(m.total_cost) : qty * rate;
          materialBudget += total;
          await connection.query(
            `INSERT INTO task_materials (task_id, project_id, site_id, material_id, quantity, cost_per_unit, total_cost)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [taskId, projectId, siteId, m.material_id || m.materialId, qty, rate, total]
          );
        }
      }
    }

    if (hasTools) {
      toolBudget = 0;
      await connection.query('DELETE FROM task_tools WHERE task_id = ? AND subtask_id IS NULL', [taskId]);
      const toolDays = Number(payload.duration_days || task.duration_days || 0);
      for (const t of payload.tools) {
        const r = normalizeToolRow(t, toolDays);
        if (r.toolName) {
          toolBudget += r.total;
          await insertToolRow(connection, taskId, projectId, siteId, r);
        }
      }
    }

    if (hasLabour) {
      labourBudget = 0;
      await connection.query('DELETE FROM task_labour WHERE task_id = ? AND subtask_id IS NULL', [taskId]);
      const seenWorkers = new Set();
      for (const l of payload.labour) {
        const lType = (l.labour_type || l.labourType || 'Labour').trim();
        const lName = (l.labour_name || l.labourName || l.worker_name || l.workerName || '').trim();
        const workerId = l.worker_id || l.workerId ? Number(l.worker_id || l.workerId) : null;
        const workerType = l.worker_type || l.workerType || (lType.toLowerCase().includes('company') ? 'company_employee' : 'labour');
        const startDate = l.start_date || l.startDate || null;
        const endDate = l.end_date || l.endDate || null;
        const remarks = (l.remarks || '').trim() || null;
        const skillTrade = (l.skill_trade || l.skillTrade || l.trade || '').trim() || null;

        const workerKey = workerId ? `${workerType}-${workerId}` : (lName ? lName.toLowerCase() : null);
        if (workerKey && seenWorkers.has(workerKey)) continue;
        if (workerKey) seenWorkers.add(workerKey);

        const workers = Number(l.worker_count || l.workerCount || 1);
        const wage = Number(l.daily_wage || l.dailyWage || 0);
        const days = Number(l.working_days || l.workingDays || durationDays || 0);
        const total = l.total_cost != null ? Number(l.total_cost) : workers * wage * days;
        labourBudget += total;
        await connection.query(
          `INSERT INTO task_labour (
             task_id, project_id, site_id, labour_name, labour_type, worker_count,
             daily_wage, working_days, total_cost, worker_id, worker_type,
             start_date, end_date, remarks, skill_trade
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            taskId, projectId, siteId, lName || null, lType, workers,
            wage, days, total, workerId, workerType,
            startDate, endDate, remarks, skillTrade
          ]
        );
      }
    }

    if (hasMisc) {
      miscBudget = 0;
      await connection.query('DELETE FROM task_misc WHERE task_id = ? AND subtask_id IS NULL', [taskId]);
      for (const mc of payload.misc) {
        const desc = (mc.description || '').trim();
        if (desc) {
          const amt = Number(mc.amount || 0);
          miscBudget += amt;
          await connection.query(
            `INSERT INTO task_misc (task_id, project_id, site_id, description, amount)
             VALUES (?, ?, ?, ?, ?)`,
            [taskId, projectId, siteId, desc, amt]
          );
        }
      }
    }

    // A replaced category only rewrote the main task's direct rows; its subtasks'
    // planned budgets stay part of the main task total.
    if (hasMaterials || hasTools || hasLabour || hasMisc) {
      const sub = await subtaskBudgetTotals(connection, taskId);
      if (hasMaterials) materialBudget += sub.material;
      if (hasTools) toolBudget += sub.tool;
      if (hasLabour) labourBudget += sub.labour;
      if (hasMisc) miscBudget += sub.misc;
    }

    const totalBudget = materialBudget + toolBudget + labourBudget + miscBudget;

    await connection.query(
      `UPDATE project_tasks
       SET site_id = ?, name = ?, description = ?, status = ?, progress = ?,
           start_date = ?, end_date = ?, planned_start = ?, planned_end = ?, duration_days = ?,
           material_budget = ?, tool_budget = ?, labour_budget = ?, misc_budget = ?, total_budget = ?
       WHERE id = ?`,
      [
        siteId,
        name,
        description,
        status,
        progress,
        startDate,
        endDate,
        startDate,
        endDate,
        durationDays,
        materialBudget,
        toolBudget,
        labourBudget,
        miscBudget,
        totalBudget,
        taskId,
      ]
    );

    // Subtasks always sit on their main task's site.
    if (String(siteId ?? '') !== String(task.site_id ?? '')) {
      await connection.query('UPDATE task_subtasks SET site_id = ? WHERE task_id = ?', [siteId, taskId]);
    }

    // Recalculate project total estimated budget across all tasks
    await refreshProjectEstimate(connection, projectId);

    await connection.commit();
    return taskId;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function deleteTask(taskId) {
  const [taskRows] = await pool.query('SELECT project_id FROM project_tasks WHERE id = ?', [taskId]);
  if (!taskRows.length) return false;
  const projectId = taskRows[0].project_id;

  await pool.query('DELETE FROM project_tasks WHERE id = ?', [taskId]);

  // Recalculate project budget
  const [[budgetSum]] = await pool.query(
    `SELECT COALESCE(SUM(total_budget), 0) AS total_sum FROM project_tasks WHERE project_id = ?`,
    [projectId]
  );
  await pool.query('UPDATE projects SET estimated_budget = ? WHERE id = ?', [
    Number(budgetSum.total_sum || 0),
    projectId,
  ]);

  return true;
}

async function findTaskById(taskId) {
  const [rows] = await pool.query(
    `SELECT t.*,
            p.name AS project_name, p.code AS project_code, p.status AS project_status,
            s.name AS site_name, s.address AS site_address, s.contractor_id AS site_contractor_id,
            u.full_name AS created_by_name,
            c.name AS contractor_name
     FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN sites s ON s.id = t.site_id
     LEFT JOIN contractors c ON c.id = s.contractor_id OR c.id = p.contractor_id
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.id = ? LIMIT 1`,
    [taskId]
  );

  if (!rows.length) return null;
  const task = rows[0];

  // Load budget items with procurement & usage rollups
  const [materials] = await pool.query(
    `SELECT tm.*, m.name AS material_name, m.code AS material_code, m.unit AS material_unit, m.category AS material_category,
            COALESCE(proc.procured_quantity, 0) AS already_procured,
            COALESCE(used.used_quantity, 0) AS already_used,
            COALESCE(pend.pending_approval_quantity, 0) AS pending_approval_quantity
     FROM task_materials tm
     JOIN materials m ON m.id = tm.material_id
     LEFT JOIN (
       SELECT material_id, SUM(quantity) AS procured_quantity
       FROM procurement_requests
       WHERE task_id = ? AND subtask_id IS NULL AND status NOT IN ('rejected', 'cancelled')
       GROUP BY material_id
     ) proc ON proc.material_id = tm.material_id
     LEFT JOIN (
       SELECT material_id, SUM(quantity_used) AS used_quantity
       FROM daily_work_updates
       WHERE task_id = ? AND subtask_id IS NULL
       GROUP BY material_id
     ) used ON used.material_id = tm.material_id
     LEFT JOIN (
       SELECT material_id, SUM(quantity) AS pending_approval_quantity
       FROM procurement_requests
       WHERE task_id = ? AND subtask_id IS NULL AND status = 'pending_approval'
       GROUP BY material_id
     ) pend ON pend.material_id = tm.material_id
     WHERE tm.task_id = ? AND tm.subtask_id IS NULL ORDER BY tm.id ASC`,
    [taskId, taskId, taskId, taskId]
  );

  const [tools] = await pool.query(
    `SELECT tt.*, t.code AS tool_code, t.type AS tool_master_type
     FROM task_tools tt
     LEFT JOIN tools t ON t.id = tt.tool_id
     WHERE tt.task_id = ? AND tt.subtask_id IS NULL ORDER BY tt.id ASC`,
    [taskId]
  );

  const [labour] = await pool.query(
    `SELECT tl.*,
            COALESCE(cw.full_name, e.full_name, tl.labour_name) AS person_name,
            COALESCE(cw.worker_code, e.employee_code) AS person_code,
            COALESCE(cw.phone, e.phone) AS person_phone,
            COALESCE(cw.skill_category, e.designation, tl.skill_trade) AS person_trade,
            COALESCE(c.name, 'Company Internal') AS contractor_name
     FROM task_labour tl
     LEFT JOIN contractor_workers cw ON cw.id = tl.worker_id AND tl.worker_type = 'labour'
     LEFT JOIN contractors c ON c.id = cw.contractor_id
     LEFT JOIN employees e ON e.id = tl.worker_id AND tl.worker_type = 'company_employee'
     WHERE tl.task_id = ? AND tl.subtask_id IS NULL ORDER BY tl.id ASC`,
    [taskId]
  );

  const [misc] = await pool.query(
    `SELECT * FROM task_misc WHERE task_id = ? AND subtask_id IS NULL ORDER BY id ASC`,
    [taskId]
  );

  // Load daily work updates for this task
  const [dailyWork] = await pool.query(
    `SELECT dwu.*, c.name AS contractor_name, m.name AS material_name, m.unit AS material_unit, st.name AS subtask_name
     FROM daily_work_updates dwu
     LEFT JOIN contractors c ON c.id = dwu.contractor_id
     LEFT JOIN materials m ON m.id = dwu.material_id
     LEFT JOIN task_subtasks st ON st.id = dwu.subtask_id
     WHERE dwu.task_id = ?
     ORDER BY dwu.work_date DESC, dwu.id DESC`,
    [taskId]
  );

  // Attach photos
  const updateIds = dailyWork.map((u) => u.id);
  let photos = [];
  if (updateIds.length) {
    const [pRows] = await pool.query(
      `SELECT * FROM daily_work_photos WHERE work_update_id IN (${updateIds.map(() => '?').join(',')})`,
      updateIds
    );
    photos = pRows;
  }

  // Load worker logs for this task
  const [workerLogs] = await pool.query(
    `SELECT twl.*, c.name AS contractor_name, u.full_name AS logged_by_name, st.name AS subtask_name
     FROM task_worker_logs twl
     LEFT JOIN contractors c ON c.id = twl.contractor_id
     LEFT JOIN users u ON u.id = twl.created_by
     LEFT JOIN task_subtasks st ON st.id = twl.subtask_id
     WHERE twl.task_id = ?
     ORDER BY twl.work_date DESC, twl.id DESC`,
    [taskId]
  );

  // Calculate actual expenses logged against this task
  const [taskExpenses] = await pool.query(
    `SELECT e.*, c.name AS contractor_name, st.name AS subtask_name
     FROM expenses e
     LEFT JOIN contractors c ON c.id = e.contractor_id
     LEFT JOIN task_subtasks st ON st.id = e.subtask_id
     WHERE e.task_id = ? OR e.id IN (
       SELECT expense_id FROM daily_work_updates WHERE task_id = ? AND expense_id IS NOT NULL
     )
     ORDER BY e.expense_date DESC`,
    [taskId, taskId]
  );

  // Actual assigned workers for this task
  const [assignedWorkers] = await pool.query(
    `SELECT taw.*,
            COALESCE(taw.phone, cw.phone) AS phone,
            COALESCE(taw.aadhaar_number, cw.aadhaar_number) AS aadhaar_number,
            c.name AS contractor_name, st.name AS subtask_name
     FROM task_assigned_workers taw
     LEFT JOIN contractor_workers cw ON cw.id = taw.worker_id
     LEFT JOIN contractors c ON c.id = cw.contractor_id
     LEFT JOIN task_subtasks st ON st.id = taw.subtask_id
     WHERE taw.task_id = ?
     ORDER BY taw.id ASC`,
    [taskId]
  );

  // Actual labour cost from worker logs (Daily Wage only; Company Labour = ₹0)
  let actualLabourCost = Number(
    workerLogs.reduce(
      (sum, w) => {
        const isComp = w.worker_type === 'company_labour' || w.worker_type === 'company_employee' || w.workerType === 'company_labour' || w.workerType === 'company_employee' || String(w.labour_type || '').toLowerCase().includes('company');
        return sum + (!isComp ? (Number(w.daily_wage || 0) * (Number(w.hours_worked || 8) / 8)) : 0);
      },
      0
    ).toFixed(2)
  );

  // Actual material consumption
  const materialUsageList = dailyWork
    .filter((u) => u.material_id && Number(u.quantity_used) > 0)
    .map((u) => ({
      id: u.id,
      date: u.work_date,
      materialId: u.material_id,
      materialName: u.material_name,
      quantityUsed: Number(u.quantity_used),
      unit: u.unit || u.material_unit,
      contractorName: u.contractor_name,
      remarks: u.remarks,
      subtaskId: u.subtask_id || null,
      subtaskName: u.subtask_name || null,
    }));

  // Unit rates come from every plan row of the task (direct + subtasks), so the
  // main task, each subtask and the direct bucket price consumption identically.
  const [allMaterials] = await pool.query('SELECT material_id, cost_per_unit FROM task_materials WHERE task_id = ?', [taskId]);
  const [allLabourRows] = await pool.query('SELECT worker_count, working_days FROM task_labour WHERE task_id = ?', [taskId]);
  const [procurements] = await pool.query(
    `SELECT r.id, r.request_number, r.subtask_id, st.name AS subtask_name, r.item_type, r.material_id, r.tool_id,
            m.name AS material_name, m.unit AS material_unit, tl.name AS tool_name, r.quantity, r.unit, r.status,
            r.is_excess, r.total_amount, r.estimated_rate, r.vehicle_number, r.received_vehicle_number,
            u.full_name AS requested_by_name, r.created_at
     FROM procurement_requests r
     LEFT JOIN task_subtasks st ON st.id = r.subtask_id
     LEFT JOIN materials m ON m.id = r.material_id
     LEFT JOIN tools tl ON tl.id = r.tool_id
     LEFT JOIN users u ON u.id = r.requested_by
     WHERE r.task_id = ?
     ORDER BY r.created_at DESC, r.id DESC`,
    [taskId]
  );

  // Rejected / cancelled expenses are listed but never count as actual cost
  // (the same rule the task list, site and project views apply).
  const liveExpenses = taskExpenses.filter((e) => !['rejected', 'cancelled'].includes(e.status));
  const budgetUtilization = computeTaskBudgetUtilization(task, allMaterials, dailyWork, workerLogs, liveExpenses);
  const breakdown = await buildSubtaskBreakdown(task, {
    allMaterials, dailyWork, workerLogs, expenses: liveExpenses, assignedWorkers, procurements,
  });
  const budgetApprovals = await getTaskBudgetApprovals(taskId);
  const totalActualExpenses = budgetUtilization.total.actual;

  return {
    id: task.id,
    projectId: task.project_id,
    project_id: task.project_id,
    projectName: task.project_name,
    project_name: task.project_name,
    projectCode: task.project_code,
    project_code: task.project_code,
    projectStatus: task.project_status,
    project_status: task.project_status,
    siteId: task.site_id,
    site_id: task.site_id,
    siteName: task.site_name,
    site_name: task.site_name,
    siteAddress: task.site_address,
    site_address: task.site_address,
    contractorName: task.contractor_name,
    contractor_name: task.contractor_name,
    createdBy: task.created_by,
    created_by: task.created_by,
    createdByName: task.created_by_name,
    created_by_name: task.created_by_name,
    name: task.name,
    description: task.description,
    status: task.status,
    progress: Number(task.progress || 0),
    startDate: task.start_date || task.planned_start,
    start_date: task.start_date || task.planned_start,
    endDate: task.end_date || task.planned_end,
    end_date: task.end_date || task.planned_end,
    durationDays: Number(task.duration_days || 0),
    duration_days: Number(task.duration_days || 0),
    materialBudget: Number(task.material_budget || 0),
    material_budget: Number(task.material_budget || 0),
    toolBudget: Number(task.tool_budget || 0),
    tool_budget: Number(task.tool_budget || 0),
    labourBudget: Number(task.labour_budget || 0),
    labour_budget: Number(task.labour_budget || 0),
    miscBudget: Number(task.misc_budget || 0),
    misc_budget: Number(task.misc_budget || 0),
    totalBudget: Number(task.total_budget || 0),
    total_budget: Number(task.total_budget || 0),
    approvedAdditionalBudget: Number(task.approved_additional_budget || 0),
    approved_additional_budget: Number(task.approved_additional_budget || 0),
    pendingExcessBudget: Number(task.pending_excess_budget || 0),
    pending_excess_budget: Number(task.pending_excess_budget || 0),
    excessReason: task.excess_reason || null,
    excess_reason: task.excess_reason || null,
    budget: {
      materialBudget: Number(task.material_budget || 0),
      toolBudget: Number(task.tool_budget || 0),
      labourBudget: Number(task.labour_budget || 0),
      miscBudget: Number(task.misc_budget || 0),
      totalBudget: Number(task.total_budget || 0),
      approvedAdditionalBudget: Number(task.approved_additional_budget || 0),
      effectiveBudget: budgetUtilization.total.effectiveBudget,
      pendingExcessBudget: Number(task.pending_excess_budget || 0),
    },
    actuals: {
      totalActualExpenses,
      actualLabourCost: budgetUtilization.labour.actual,
      actualMaterialCost: budgetUtilization.materials.actual,
      actualToolsCost: budgetUtilization.tools.actual,
      actualMiscCost: budgetUtilization.misc.actual,
      workerLogsCount: workerLogs.length,
      materialsConsumedCount: materialUsageList.length,
      dailyUpdatesCount: dailyWork.length,
    },
    budgetUtilization,
    budgetApprovals,
    actualLabourCost: budgetUtilization.labour.actual,
    totalActualExpenses,
    materials: materials.map(mapPlannedMaterial),
    tools: tools.map((t) => ({
      id: t.id,
      toolId: t.tool_id,
      toolName: t.tool_name,
      toolCode: t.tool_code,
      rentalType: t.rental_type,
      quantity: Number(t.quantity || 1),
      cost: Number(t.cost || 0),
      workingDays: Number(t.working_days || 1),
      startDate: t.start_date || null,
      endDate: t.end_date || null,
      totalCost: Number(t.total_cost || 0),
    })),
    assignedWorkers: assignedWorkers.map((w) => ({
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
      subtaskId: w.subtask_id || null,
      subtaskName: w.subtask_name || null,
    })),
    labour: labour.map((l) => ({
      id: l.id,
      labourName: l.labour_name || l.person_name || '',
      labourType: l.labour_type,
      workerCount: Number(l.worker_count || 1),
      dailyWage: Number(l.daily_wage || 0),
      workingDays: Number(l.working_days || 0),
      totalCost: Number(l.total_cost || 0),
      // Needed so editing the plan keeps the chosen worker and dates.
      workerId: l.worker_id || null,
      workerType: l.worker_type || null,
      skillTrade: l.skill_trade || l.person_trade || null,
      startDate: l.start_date || null,
      endDate: l.end_date || null,
      remarks: l.remarks || null,
    })),
    labourSummary: {
      plannedLabourCost: Number(task.labour_budget || 0),
      actualLabourCost,
      remainingLabourBudget: Math.max(0, Number((Number(task.labour_budget || 0) - actualLabourCost).toFixed(2))),
      daysPlanned: allLabourRows.length ? Math.max(...allLabourRows.map((l) => Number(l.working_days || 0)), Number(task.duration_days || 0)) : Number(task.duration_days || 0),
      daysWorked: new Set(workerLogs.map((w) => String(w.work_date).slice(0, 10))).size,
      workersPlanned: allLabourRows.reduce((s, l) => s + Number(l.worker_count || 1), 0),
      workersWorked: new Set(workerLogs.map((w) => w.worker_name?.trim().toLowerCase()).filter(Boolean)).size,
    },
    misc: misc.map((mc) => ({
      id: mc.id,
      description: mc.description,
      amount: Number(mc.amount || 0),
    })),
    dailyWorkUpdates: dailyWork.map((u) => ({
      id: u.id,
      workDate: u.work_date,
      workDone: u.work_done,
      workStatus: u.work_status,
      progressPercentage: u.progress_percentage,
      remarks: u.remarks,
      contractorName: u.contractor_name,
      materialName: u.material_name,
      quantityUsed: u.quantity_used ? Number(u.quantity_used) : null,
      unit: u.unit || u.material_unit,
      subtaskId: u.subtask_id || null,
      subtaskName: u.subtask_name || null,
      photos: photos
        .filter((p) => p.work_update_id === u.id)
        .map((p) => ({
          id: p.id,
          fileName: p.file_name,
          url: `/api/daily-work/photos/${p.id}`,
        })),
    })),
    dailyWork: dailyWork.map((u) => ({
      id: u.id,
      workDate: u.work_date,
      workDone: u.work_done,
      workStatus: u.work_status,
      progressPercentage: u.progress_percentage,
      remarks: u.remarks,
      contractorName: u.contractor_name,
      materialName: u.material_name,
      quantityUsed: u.quantity_used ? Number(u.quantity_used) : null,
      unit: u.unit || u.material_unit,
      subtaskId: u.subtask_id || null,
      subtaskName: u.subtask_name || null,
      photos: photos
        .filter((p) => p.work_update_id === u.id)
        .map((p) => ({
          id: p.id,
          fileName: p.file_name,
          url: `/api/daily-work/photos/${p.id}`,
        })),
    })),
    workerLogs: workerLogs.map((w) => ({
      id: w.id,
      workerName: w.worker_name,
      workerCode: w.worker_code,
      labourType: w.labour_type,
      workDate: w.work_date,
      hoursWorked: Number(w.hours_worked || 8),
      dailyWage: Number(w.daily_wage || 0),
      workPerformed: w.work_performed,
      contractorName: w.contractor_name,
      workerType: w.worker_type,
      subtaskId: w.subtask_id || null,
      subtaskName: w.subtask_name || null,
    })),
    materialUsageList,
    expenses: taskExpenses.map((e) => ({
      id: e.id,
      expenseNumber: e.expense_number,
      category: e.category,
      description: e.description,
      amount: Number(e.amount || 0),
      expenseDate: e.expense_date,
      status: e.status,
      contractorName: e.contractor_name,
      subtaskId: e.subtask_id || null,
      subtaskName: e.subtask_name || null,
    })),
    procurements: procurements.map(mapProcurementRow),
    subtasks: breakdown.subtasks,
    directScope: breakdown.direct,
    consolidation: breakdown.consolidation,
  };
}

async function findAllTasks({ projectId, siteId, contractorId, status, search } = {}) {
  const where = [];
  const params = [];

  if (projectId) {
    where.push('t.project_id = ?');
    params.push(Number(projectId));
  }

  if (siteId) {
    where.push('t.site_id = ?');
    params.push(Number(siteId));
  }

  if (contractorId) {
    where.push('(s.contractor_id = ? OR p.contractor_id = ?)');
    params.push(Number(contractorId), Number(contractorId));
  }

  if (status && status !== 'all') {
    where.push('t.status = ?');
    params.push(status);
  }

  if (search) {
    where.push('(t.name LIKE ? OR t.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT t.*,
            p.name AS project_name, p.code AS project_code,
            s.name AS site_name, s.contractor_id AS site_contractor_id,
            c.name AS contractor_name,
            (SELECT COUNT(*) FROM task_worker_logs twl WHERE twl.task_id = t.id) AS worker_entries_count,
            (SELECT COUNT(DISTINCT twl.worker_name) FROM task_worker_logs twl WHERE twl.task_id = t.id) AS unique_workers_count,
            (SELECT COALESCE(SUM(CASE WHEN twl.worker_type IN ('company_labour', 'company_employee') OR LOWER(COALESCE(twl.labour_type, '')) LIKE '%company%' THEN 0 ELSE twl.daily_wage * (twl.hours_worked / 8) END), 0) FROM task_worker_logs twl WHERE twl.task_id = t.id) AS actual_labour_cost,
            (SELECT COUNT(*) FROM daily_work_updates dwu WHERE dwu.task_id = t.id AND dwu.material_id IS NOT NULL AND dwu.quantity_used > 0) AS material_used_count,
            (SELECT COUNT(*) FROM daily_work_updates dwu WHERE dwu.task_id = t.id) AS daily_updates_count
     FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN sites s ON s.id = t.site_id
     LEFT JOIN contractors c ON c.id = s.contractor_id OR c.id = p.contractor_id
     ${whereSql}
     ORDER BY t.start_date ASC, t.id ASC`,
    params
  );

  const taskIds = rows.map((r) => r.id);
  const taskMaterialsMap = new Map();
  const taskDailyWorkMap = new Map();
  const taskWorkerLogsMap = new Map();
  const taskExpensesMap = new Map();

  if (taskIds.length) {
    const placeholders = taskIds.map(() => '?').join(',');
    const [tmRows, dwRows, wlRows, exRows] = await Promise.all([
      pool.query(`SELECT tm.* FROM task_materials tm WHERE tm.task_id IN (${placeholders})`, taskIds).then(([r]) => r),
      pool.query(`SELECT dwu.* FROM daily_work_updates dwu WHERE dwu.task_id IN (${placeholders})`, taskIds).then(([r]) => r),
      pool.query(`SELECT twl.* FROM task_worker_logs twl WHERE twl.task_id IN (${placeholders})`, taskIds).then(([r]) => r),
      pool.query(`SELECT e.* FROM expenses e WHERE e.task_id IN (${placeholders}) AND e.status NOT IN ('rejected', 'cancelled')`, taskIds).then(([r]) => r),
    ]);

    tmRows.forEach((m) => {
      if (!taskMaterialsMap.has(m.task_id)) taskMaterialsMap.set(m.task_id, []);
      taskMaterialsMap.get(m.task_id).push(m);
    });
    dwRows.forEach((d) => {
      if (!taskDailyWorkMap.has(d.task_id)) taskDailyWorkMap.set(d.task_id, []);
      taskDailyWorkMap.get(d.task_id).push(d);
    });
    wlRows.forEach((w) => {
      if (!taskWorkerLogsMap.has(w.task_id)) taskWorkerLogsMap.set(w.task_id, []);
      taskWorkerLogsMap.get(w.task_id).push(w);
    });
    exRows.forEach((e) => {
      if (!taskExpensesMap.has(e.task_id)) taskExpensesMap.set(e.task_id, []);
      taskExpensesMap.get(e.task_id).push(e);
    });
  }

  const subtaskMap = await findSubtaskSummaries(taskIds);

  return rows.map((r) => {
    const subtasks = subtaskMap.get(r.id) || [];
    const budgetUtilization = computeTaskBudgetUtilization(
      r,
      taskMaterialsMap.get(r.id) || [],
      taskDailyWorkMap.get(r.id) || [],
      taskWorkerLogsMap.get(r.id) || [],
      taskExpensesMap.get(r.id) || []
    );

    return {
      id: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      projectCode: r.project_code,
      siteId: r.site_id,
      siteName: r.site_name,
      contractorName: r.contractor_name,
      name: r.name,
      description: r.description,
      status: r.status,
      progress: Number(r.progress || 0),
      startDate: r.start_date || r.planned_start,
      endDate: r.end_date || r.planned_end,
      durationDays: Number(r.duration_days || 0),
      materialBudget: Number(r.material_budget || 0),
      toolBudget: Number(r.tool_budget || 0),
      labourBudget: Number(r.labour_budget || 0),
      miscBudget: Number(r.misc_budget || 0),
      totalBudget: Number(r.total_budget || 0),
      approvedAdditionalBudget: Number(r.approved_additional_budget || 0),
      pendingExcessBudget: Number(r.pending_excess_budget || 0),
      excessReason: r.excess_reason || null,
      budgetUtilization,
      workerEntriesCount: Number(r.worker_entries_count || 0),
      uniqueWorkersCount: Number(r.unique_workers_count || 0),
      actualLabourCost: budgetUtilization.labour.actual,
      materialUsedCount: Number(r.material_used_count || 0),
      dailyUpdatesCount: Number(r.daily_updates_count || 0),
      createdAt: r.created_at,
      subtaskCount: subtasks.length,
      subtasks,
    };
  });
}

async function addWorkerLog({
  task_id,
  subtask_id,
  project_id,
  site_id,
  contractor_id,
  daily_work_id,
  worker_id,
  worker_type,
  worker_name,
  worker_code,
  labour_type,
  work_date,
  hours_worked = 8.0,
  daily_wage = 0.0,
  work_performed,
  created_by,
}) {
  const [result] = await pool.query(
    `INSERT INTO task_worker_logs
      (task_id, subtask_id, project_id, site_id, contractor_id, daily_work_id,
       worker_id, worker_type,
       worker_name, worker_code, labour_type, work_date,
       hours_worked, daily_wage, work_performed, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task_id,
      subtask_id ? Number(subtask_id) : null,
      project_id,
      site_id || null,
      contractor_id || null,
      daily_work_id || null,
      worker_id ? Number(worker_id) : null,
      (worker_type === 'company_labour' || worker_type === 'company_employee' || String(labour_type || '').toLowerCase().includes('company')) ? 'company_labour' : (worker_type || 'daily_wage'),
      worker_name.trim(),
      worker_code ? String(worker_code).trim() : null,
      labour_type ? String(labour_type).trim() : 'Labour',
      work_date,
      hours_worked,
      (worker_type === 'company_labour' || worker_type === 'company_employee' || String(labour_type || '').toLowerCase().includes('company')) ? 0.0 : Number(daily_wage || 0.0),
      work_performed ? work_performed.trim() : null,
      created_by || null,
    ]
  );
  return result.insertId;
}

async function getTaskLabourSummary(taskId) {
  const [workerLogs] = await pool.query(
    `SELECT twl.*, COALESCE(c.name, 'Company Labour (In-House)') AS contractor_name
     FROM task_worker_logs twl
     LEFT JOIN contractors c ON c.id = twl.contractor_id
     WHERE twl.task_id = ?
     ORDER BY twl.work_date DESC, twl.id DESC`,
    [taskId]
  );

  const [budgetRows] = await pool.query(
    `SELECT * FROM task_labour WHERE task_id = ?`,
    [taskId]
  );

  const budgetedWorkers = budgetRows.reduce((sum, b) => sum + Number(b.worker_count || 0), 0);
  const budgetedDays = budgetRows.reduce((sum, b) => sum + Number(b.working_days || 0), 0);
  const budgetedCost = budgetRows.reduce((sum, b) => sum + Number(b.total_cost || 0), 0);

  const todayStr = new Date().toISOString().slice(0, 10);
  const workersToday = workerLogs.filter((w) => (w.work_date ? new Date(w.work_date).toISOString().slice(0, 10) === todayStr : false));

  // Unique workers with individual contribution
  const workerContributions = new Map();
  let totalCost = 0;

  for (const log of workerLogs) {
    const isCompany = log.worker_type === 'company_labour' || log.worker_type === 'company_employee' || log.workerType === 'company_labour' || log.workerType === 'company_employee' || String(log.labour_type || '').toLowerCase().includes('company');
    const cost = isCompany ? 0 : Number(log.daily_wage || 0) * (Number(log.hours_worked || 8) / 8);
    totalCost += cost;

    const key = log.worker_name;
    if (!workerContributions.has(key)) {
      workerContributions.set(key, {
        workerName: log.worker_name,
        workerCode: log.worker_code,
        labourType: log.labour_type,
        contractorName: log.contractor_name,
        daysWorked: 0,
        totalHours: 0,
        totalEarned: 0,
        lastWorkedDate: log.work_date,
      });
    }

    const current = workerContributions.get(key);
    current.daysWorked += 1;
    current.totalHours += Number(log.hours_worked || 8);
    current.totalEarned += cost;
    if (new Date(log.work_date) > new Date(current.lastWorkedDate)) {
      current.lastWorkedDate = log.work_date;
    }
  }

  return {
    taskId: Number(taskId),
    budget: {
      budgetedWorkers,
      budgetedDays,
      budgetedCost,
    },
    actuals: {
      totalWorkersAssigned: budgetedWorkers,
      workersWorkedTodayCount: workersToday.length,
      workersWorkedToday: workersToday.map((w) => ({
        workerName: w.worker_name,
        workerCode: w.worker_code,
        labourType: w.labour_type,
        hoursWorked: Number(w.hours_worked || 8),
        dailyWage: Number(w.daily_wage || 0),
        workPerformed: w.work_performed,
      })),
      totalWorkingDaysCount: workerLogs.length,
      totalActualLabourCost: totalCost,
      workerList: Array.from(workerContributions.values()).sort((a, b) => b.daysWorked - a.daysWorked),
    },
  };
}

async function saveProjectTasks(projectId, tasksData, userId = 1) {
  if (!Array.isArray(tasksData)) return;

  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    const [existing] = await connection.query(
      'SELECT id FROM project_tasks WHERE project_id = ?',
      [projectId]
    );
    const existingIds = existing.map((r) => r.id);
    const submittedIds = tasksData.filter((t) => t.id).map((t) => Number(t.id));

    // Delete tasks that were removed if no daily work is attached
    const toDelete = existingIds.filter((id) => !submittedIds.includes(id));
    for (const delId of toDelete) {
      const [dw] = await connection.query(
        'SELECT id FROM daily_work_updates WHERE task_id = ? LIMIT 1',
        [delId]
      );
      if (!dw.length) {
        await connection.query('DELETE FROM project_tasks WHERE id = ?', [delId]);
      }
    }

    for (const t of tasksData) {
      if (!t.name || !t.name.trim()) continue;

      const taskName = t.name.trim();
      const siteId = t.siteId || t.site_id ? Number(t.siteId || t.site_id) : null;
      const description = t.description ? t.description.trim() : null;
      const status = t.status || 'on-track';
      const progress = Math.min(100, Math.max(0, Number(t.progress || 0)));
      const durationDays = Number(t.durationDays || t.duration_days || (t.durationMonths ? Math.round(Number(t.durationMonths) * 25) : 14));
      const startDate = t.startDate || t.start_date || null;
      const endDate = t.endDate || t.end_date || null;

      const materials = Array.isArray(t.materials) ? t.materials : [];
      const tools = (Array.isArray(t.tools) ? t.tools : [])
        .map((tl) => normalizeToolRow(tl, durationDays))
        .filter((r) => r.toolName);
      const labour = Array.isArray(t.labour) ? t.labour : [];
      const misc = Array.isArray(t.misc) ? t.misc : [];

      let materialBudget = 0;
      let toolBudget = 0;
      let labourBudget = 0;
      let miscBudget = 0;

      materials.forEach((m) => {
        const qty = Number(m.quantity || 0);
        const rate = Number(m.costPerUnit || m.cost_per_unit || 0);
        materialBudget += Number(m.totalCost != null ? m.totalCost : qty * rate);
      });
      tools.forEach((r) => { toolBudget += r.total; });
      labour.forEach((l) => {
        const wc = Number(l.workerCount || l.worker_count || 1);
        const dw = Number(l.dailyWage || l.daily_wage || 0);
        const wd = Number(l.workingDays || l.working_days || durationDays || 0);
        labourBudget += Number(l.totalCost != null ? l.totalCost : wc * dw * wd);
      });
      misc.forEach((mc) => {
        miscBudget += Number(mc.amount || 0);
      });

      const direct = { material: materialBudget, tool: toolBudget, labour: labourBudget, misc: miscBudget };
      let taskId = t.id ? Number(t.id) : null;
      const isExisting = Boolean(taskId && existingIds.includes(taskId));
      // The project form edits only the main task's direct plan; planned subtask
      // budgets stay inside the main task total.
      if (isExisting) {
        const sub = await subtaskBudgetTotals(connection, taskId);
        materialBudget += sub.material;
        toolBudget += sub.tool;
        labourBudget += sub.labour;
        miscBudget += sub.misc;
      }

      const totalBudget = materialBudget + toolBudget + labourBudget + miscBudget;

      if (isExisting) {
        await connection.query(
          `UPDATE project_tasks
           SET site_id = ?, name = ?, description = ?, status = ?, progress = COALESCE(?, progress),
               start_date = ?, end_date = ?, planned_start = ?, planned_end = ?, duration_days = ?,
               material_budget = ?, tool_budget = ?, labour_budget = ?, misc_budget = ?, total_budget = ?
           WHERE id = ?`,
          [
            siteId, taskName, description, status, t.progress !== undefined ? progress : null,
            startDate, endDate, startDate, endDate, durationDays,
            materialBudget, toolBudget, labourBudget, miscBudget, totalBudget,
            taskId
          ]
        );
        await connection.query('UPDATE task_subtasks SET site_id = ? WHERE task_id = ?', [siteId, taskId]);
        await connection.query('DELETE FROM task_materials WHERE task_id = ? AND subtask_id IS NULL', [taskId]);
        await connection.query('DELETE FROM task_tools WHERE task_id = ? AND subtask_id IS NULL', [taskId]);
        await connection.query('DELETE FROM task_labour WHERE task_id = ? AND subtask_id IS NULL', [taskId]);
        await connection.query('DELETE FROM task_misc WHERE task_id = ? AND subtask_id IS NULL', [taskId]);
      } else {
        const [res] = await connection.query(
          `INSERT INTO project_tasks (
             project_id, site_id, name, description, status, progress,
             start_date, end_date, planned_start, planned_end, duration_days,
             material_budget, tool_budget, labour_budget, misc_budget, total_budget, created_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            projectId, siteId, taskName, description, status, progress,
            startDate, endDate, startDate, endDate, durationDays,
            materialBudget, toolBudget, labourBudget, miscBudget, totalBudget, userId
          ]
        );
        taskId = res.insertId;
      }

      for (const m of materials) {
        if (m.materialId || m.material_id) {
          const qty = Number(m.quantity || 0);
          const rate = Number(m.costPerUnit || m.cost_per_unit || 0);
          const total = m.totalCost != null ? Number(m.totalCost) : qty * rate;
          await connection.query(
            `INSERT INTO task_materials (task_id, project_id, site_id, material_id, quantity, cost_per_unit, total_cost)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [taskId, projectId, siteId, m.materialId || m.material_id, qty, rate, total]
          );
        }
      }

      for (const r of tools) await insertToolRow(connection, taskId, projectId, siteId, r);

      const seenWorkers = new Set();
      for (const l of labour) {
        const lType = (l.labourType || l.labour_type || 'Labour').trim();
        const lName = (l.labourName || l.labour_name || l.workerName || l.worker_name || '').trim();
        const workerId = l.workerId || l.worker_id ? Number(l.workerId || l.worker_id) : null;
        const workerType = l.workerType || l.worker_type || (lType.toLowerCase().includes('company') ? 'company_labour' : 'labour');
        const startDate = l.startDate || l.start_date || null;
        const endDate = l.endDate || l.end_date || null;
        const remarks = (l.remarks || '').trim() || null;
        const skillTrade = (l.skillTrade || l.skill_trade || l.trade || '').trim() || null;

        const workerKey = workerId ? `${workerType}-${workerId}` : (lName ? lName.toLowerCase() : null);
        if (workerKey && seenWorkers.has(workerKey)) continue;
        if (workerKey) seenWorkers.add(workerKey);

        const wc = Number(l.workerCount || l.worker_count || 1);
        const dw = Number(l.dailyWage || l.daily_wage || 0);
        const wd = Number(l.workingDays || l.working_days || durationDays || 0);
        const total = l.totalCost != null ? Number(l.totalCost) : wc * dw * wd;
        await connection.query(
          `INSERT INTO task_labour (
             task_id, project_id, site_id, labour_name, labour_type, worker_count,
             daily_wage, working_days, total_cost, worker_id, worker_type,
             start_date, end_date, remarks, skill_trade
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            taskId, projectId, siteId, lName || null, lType, wc,
            dw, wd, total, workerId, workerType,
            startDate, endDate, remarks, skillTrade
          ]
        );
      }

      for (const mc of misc) {
        const desc = (mc.description || '').trim();
        if (desc) {
          const amt = Number(mc.amount || 0);
          await connection.query(
            `INSERT INTO task_misc (task_id, project_id, site_id, description, amount)
             VALUES (?, ?, ?, ?, ?)`,
            [taskId, projectId, siteId, desc, amt]
          );
        }
      }

      // Subtasks planned on the same form: sync them, then the main task total is
      // its direct plan plus every subtask's plan.
      if (Array.isArray(t.subtasks)) {
        await syncTaskSubtasks(connection, { id: taskId, projectId, siteId }, t.subtasks, userId);
        const sub = await subtaskBudgetTotals(connection, taskId);
        const mat = direct.material + sub.material;
        const tool = direct.tool + sub.tool;
        const lab = direct.labour + sub.labour;
        const msc = direct.misc + sub.misc;
        await connection.query(
          `UPDATE project_tasks SET material_budget = ?, tool_budget = ?, labour_budget = ?, misc_budget = ?, total_budget = ?
           WHERE id = ?`,
          [mat, tool, lab, msc, mat + tool + lab + msc, taskId]
        );
        await rollupMainTaskProgress(connection, taskId);
      }
    }

    await refreshProjectEstimate(connection, projectId);

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}


/**
 * Task Assigned Workers (Actual Labour Assignment)
 */
async function getTaskAssignments(taskId) {
  const [rows] = await pool.query(
    `SELECT taw.*,
            COALESCE(taw.phone, cw.phone) AS phone,
            COALESCE(taw.aadhaar_number, cw.aadhaar_number) AS aadhaar_number,
            COALESCE(c.name, 'Company Labour (In-House)') AS contractor_name, st.name AS subtask_name
     FROM task_assigned_workers taw
     LEFT JOIN contractor_workers cw ON cw.id = taw.worker_id
     LEFT JOIN contractors c ON c.id = cw.contractor_id
     LEFT JOIN task_subtasks st ON st.id = taw.subtask_id
     WHERE taw.task_id = ?
     ORDER BY taw.id ASC`,
    [taskId]
  );
  return rows.map((w) => ({
    id: w.id,
    taskId: w.task_id,
    subtaskId: w.subtask_id || null,
    subtaskName: w.subtask_name || null,
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
  const subtaskId = payload.subtaskId || payload.subtask_id ? Number(payload.subtaskId || payload.subtask_id) : null;
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
  const isCompany = workerType === 'company_labour' || workerType === 'company_employee' || String(payload.trade || '').toLowerCase().includes('company');
  const dailyWage = isCompany ? 0 : Number(payload.dailyWage || payload.daily_wage || 0);
  const plannedCost = isCompany ? 0 : Number(payload.plannedCost || payload.planned_cost || (expectedDays * dailyWage));
  const remarks = (payload.remarks || '').trim() || null;
  const assignedBy = payload.assignedBy || payload.assigned_by || null;

  // Duplicate check
  const [existing] = await pool.query(
    'SELECT id FROM task_assigned_workers WHERE task_id = ? AND worker_type = ? AND worker_id = ?',
    [taskId, workerType, workerId]
  );
  if (existing.length) {
    const err = new Error(`${workerName} is already assigned to this task.`);
    err.status = 409;
    throw err;
  }

  // Check planned workers vs assigned workers (within the subtask when one is chosen)
  const scope = subtaskId ? subtaskScope('', subtaskId) : { sql: '', params: [] };
  const [[planRow]] = await pool.query(
    `SELECT COALESCE(SUM(worker_count), 0) AS planned_count FROM task_labour WHERE task_id = ?${scope.sql}`,
    [taskId, ...scope.params]
  );
  const plannedCount = Number(planRow?.planned_count || 0);

  const [[assignedRow]] = await pool.query(
    `SELECT COUNT(*) AS assigned_count FROM task_assigned_workers WHERE task_id = ?${scope.sql}`,
    [taskId, ...scope.params]
  );
  const assignedCount = Number(assignedRow?.assigned_count || 0);

  const isAdditional = plannedCount > 0 && assignedCount >= plannedCount;
  const reason = (payload.reason || payload.remarks || '').trim();

  if (isAdditional && !reason) {
    const err = new Error('Additional labour above planned workers requires a mandatory reason and Admin approval.');
    err.status = 400;
    throw err;
  }

  let approvalRequestId = null;
  const status = isAdditional ? 'pending_approval' : 'active';

  if (isAdditional) {
    const [[projTask]] = await pool.query('SELECT name FROM project_tasks WHERE id = ?', [taskId]);
    const subRow = subtaskId ? await findSubtaskRow(subtaskId) : null;
    const taskName = `${projTask?.name || `Task #${taskId}`}${subRow ? ` › ${subRow.name}` : ''}`;
    const approvalTitle = `Additional Labour: ${workerName} for ${taskName}`;
    const approvalAmount = isCompany ? 0 : plannedCost;

    const [approvalRes] = await pool.query(
      `INSERT INTO approval_requests
        (project_id, site_id, request_type, title, requested_by, amount, details, status, requested_on)
       VALUES (?, ?, 'additional_labour', ?, ?, ?, ?, 'pending', CURDATE())`,
      [
        projectId,
        siteId,
        approvalTitle,
        payload.requested_by_name || payload.contractorName || 'Contractor',
        approvalAmount,
        JSON.stringify({
          taskId,
          subtaskId,
          taskName,
          workerId,
          workerName,
          workerType,
          originalPlannedWorkers: plannedCount,
          additionalWorkers: assignedCount + 1 - plannedCount,
          reason,
          dailyWage,
          expectedDays,
          plannedCost: approvalAmount,
        }),
      ]
    );
    approvalRequestId = approvalRes.insertId;

    await pool.query(
      `INSERT INTO task_budget_approvals
        (task_id, subtask_id, project_id, site_id, category, budget_amount, actual_amount, requested_excess,
         reason, status, requested_by, approval_request_id, original_planned_workers,
         additional_workers, revised_labour_budget, worker_id, worker_type, worker_name)
       VALUES (?, ?, ?, ?, 'labour', (SELECT COALESCE(labour_budget, 0) FROM project_tasks WHERE id = ?), ?, ?,
               ?, 'pending', ?, ?, ?, ?, (SELECT COALESCE(labour_budget, 0) + ? FROM project_tasks WHERE id = ?), ?, ?, ?)`,
      [
        taskId,
        subtaskId,
        projectId,
        siteId,
        taskId,
        approvalAmount,
        approvalAmount,
        reason,
        assignedBy || null,
        approvalRequestId,
        plannedCount,
        assignedCount + 1 - plannedCount,
        isCompany ? 0 : approvalAmount,
        taskId,
        workerId,
        workerType,
        workerName,
      ]
    );

    // If daily wage, mark pending_excess_budget so it doesn't silently increase approved budget
    if (!isCompany && approvalAmount > 0) {
      await pool.query(
        'UPDATE project_tasks SET pending_excess_budget = pending_excess_budget + ? WHERE id = ?',
        [approvalAmount, taskId]
      );
      if (subtaskId) {
        await pool.query(
          'UPDATE task_subtasks SET pending_excess_budget = pending_excess_budget + ? WHERE id = ?',
          [approvalAmount, subtaskId]
        );
      }
    }
  }

  const [res] = await pool.query(
    `INSERT INTO task_assigned_workers
      (task_id, subtask_id, project_id, site_id, contractor_id, worker_type, worker_id,
       worker_name, worker_code, phone, aadhaar_number, trade, start_date,
       end_date, expected_days, daily_wage, planned_cost, remarks, status, assigned_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      taskId, subtaskId, projectId, siteId, contractorId, workerType, workerId,
      workerName, workerCode, phone, aadhaarNumber, trade, startDate,
      endDate, expectedDays, dailyWage, plannedCost, remarks, status, assignedBy
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

  const isCompany = payload.worker_type === 'company_labour' || payload.is_company_labour || String(payload.skill_category || '').toLowerCase().includes('company');
  const workerType = isCompany ? 'company_labour' : 'daily_wage';
  const isCompanyLabour = isCompany ? 1 : 0;

  const [cwMax] = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM contractor_workers');
  const nextId = cwMax[0].next_id;
  const prefix = isCompany ? 'CL' : 'CW';
  const workerCode = `${prefix}-${String(nextId).padStart(4, '0')}`;

  const phone = (payload.phone || payload.mobile || '').trim() || null;
  const aadhaar = (payload.aadhaar_number || payload.aadhaarNumber || payload.aadhaar || '').trim() || null;
  const trade = (payload.skill_category || payload.trade || 'General Labour').trim();
  const dailyRate = isCompany ? 0.0 : Number(payload.daily_rate || payload.dailyRate || payload.daily_wage || 750);
  const notes = (payload.notes || '').trim() || null;
  const effectiveContractorId = isCompany ? null : Number(contractorId || 1);

  const [res] = await pool.query(
    `INSERT INTO contractor_workers
      (contractor_id, worker_type, is_company_labour, worker_code, full_name, phone, aadhaar_number, skill_category, daily_rate, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [effectiveContractorId, workerType, isCompanyLabour, workerCode, fullName, phone, aadhaar, trade, dailyRate, notes]
  );

  return {
    id: res.insertId,
    workerId: res.insertId,
    workerType,
    workerTypeLabel: isCompany ? 'Company Labour' : 'Daily Wage Worker',
    code: workerCode,
    name: fullName,
    phone,
    aadhaarNumber: aadhaar,
    trade,
    dailyRate,
    contractorId: effectiveContractorId,
    contractorName: isCompany ? 'Company Labour (In-House)' : 'Contractor',
    status: 'active',
  };
}

async function findPlannedMaterials(taskId, subtaskId = undefined) {
  const plan = subtaskScope('tm', subtaskId);
  const rec = subtaskScope('', subtaskId);
  const [rows] = await pool.query(
    `SELECT tm.*,
            m.name AS material_name,
            m.code AS material_code,
            m.unit AS material_unit,
            m.category AS material_category,
            COALESCE(proc.procured_quantity, 0) AS already_procured,
            COALESCE(used.used_quantity, 0) AS already_used
     FROM task_materials tm
     JOIN materials m ON m.id = tm.material_id
     LEFT JOIN (
       SELECT material_id, SUM(quantity) AS procured_quantity
       FROM procurement_requests
       WHERE task_id = ? AND status NOT IN ('rejected', 'cancelled')${rec.sql}
       GROUP BY material_id
     ) proc ON proc.material_id = tm.material_id
     LEFT JOIN (
       SELECT material_id, SUM(quantity_used) AS used_quantity
       FROM daily_work_updates
       WHERE task_id = ?${rec.sql}
       GROUP BY material_id
     ) used ON used.material_id = tm.material_id
     WHERE tm.task_id = ?${plan.sql}
     ORDER BY tm.id ASC`,
    [taskId, ...rec.params, taskId, ...rec.params, taskId, ...plan.params]
  );

  return rows.map((m) => {
    const originalPlanned = Number(m.quantity || 0);
    const approvedAdditional = Number(m.approved_additional_quantity || 0);
    const revisedApproved = Number((originalPlanned + approvedAdditional).toFixed(2));
    const alreadyProcured = Number(Number(m.already_procured || 0).toFixed(2));
    const remainingPlanned = Math.max(0, Number((revisedApproved - alreadyProcured).toFixed(2)));
    const alreadyUsed = Number(Number(m.already_used || 0).toFixed(2));

    return {
      id: m.id,
      materialId: m.material_id,
      materialName: m.material_name,
      materialCode: m.material_code,
      unit: m.material_unit || 'Units',
      category: m.material_category,
      costPerUnit: Number(m.cost_per_unit || 0),
      plannedQuantity: originalPlanned,
      approvedAdditional,
      revisedPlannedQuantity: revisedApproved,
      alreadyProcured,
      remainingPlannedQuantity: remainingPlanned,
      alreadyUsed,
    };
  });
}

// ===========================================================================
// SUBTASKS — Project -> Site -> Main Task -> Subtask.
// A subtask's planning rows live in the same task_* tables with subtask_id set,
// and its transactions carry task_id = main task + subtask_id. Main task budget
// columns always include every subtask's planned budget, so Site / Project
// totals (which sum main tasks) stay correct with no double counting.
// ===========================================================================

const PLAN_CATEGORIES = ['materials', 'tools', 'labour', 'misc'];

/**
 * Replaces one scope's planning rows for the categories present in `payload`
 * and returns the per-category planned totals of that scope (computed from the
 * stored rows, never trusted from the client).
 */
async function writeSubtaskPlanning(conn, { taskId, subtaskId, projectId, siteId, durationDays }, payload) {
  if (Array.isArray(payload.materials)) {
    await conn.query('DELETE FROM task_materials WHERE subtask_id = ?', [subtaskId]);
    for (const m of payload.materials) {
      const materialId = m.material_id || m.materialId;
      if (!materialId) continue;
      const qty = Math.max(0, Number(m.quantity || 0));
      const rate = Math.max(0, Number(m.cost_per_unit ?? m.costPerUnit ?? 0));
      await conn.query(
        `INSERT INTO task_materials (task_id, subtask_id, project_id, site_id, material_id, quantity, cost_per_unit, total_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [taskId, subtaskId, projectId, siteId, Number(materialId), qty, rate, Number((qty * rate).toFixed(2))]
      );
    }
  }

  if (Array.isArray(payload.tools)) {
    await conn.query('DELETE FROM task_tools WHERE subtask_id = ?', [subtaskId]);
    for (const t of payload.tools) {
      const r = normalizeToolRow(t, durationDays);
      if (r.toolName) await insertToolRow(conn, taskId, projectId, siteId, r, subtaskId);
    }
  }

  if (Array.isArray(payload.labour)) {
    await conn.query('DELETE FROM task_labour WHERE subtask_id = ?', [subtaskId]);
    const seen = new Set();
    for (const l of payload.labour) {
      const lType = String(l.labour_type || l.labourType || 'Labour').trim();
      const lName = String(l.labour_name || l.labourName || l.worker_name || l.workerName || '').trim();
      const workerId = l.worker_id || l.workerId ? Number(l.worker_id || l.workerId) : null;
      const workerType = l.worker_type || l.workerType || (lType.toLowerCase().includes('company') ? 'company_labour' : 'labour');
      const key = workerId ? `${workerType}-${workerId}` : (lName ? lName.toLowerCase() : null);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      const isCompany = String(workerType).startsWith('company') || lType.toLowerCase().includes('company');
      const workers = Math.max(0, Number(l.worker_count || l.workerCount || 1));
      const wage = isCompany ? 0 : Math.max(0, Number(l.daily_wage || l.dailyWage || 0));
      const days = Math.max(0, Number(l.working_days || l.workingDays || durationDays || 0));
      await conn.query(
        `INSERT INTO task_labour (
           task_id, subtask_id, project_id, site_id, labour_name, labour_type, worker_count,
           daily_wage, working_days, total_cost, worker_id, worker_type, start_date, end_date, remarks, skill_trade
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          taskId, subtaskId, projectId, siteId, lName || null, lType, workers,
          wage, days, Number((workers * wage * days).toFixed(2)), workerId, workerType,
          l.start_date || l.startDate || null, l.end_date || l.endDate || null,
          String(l.remarks || '').trim() || null,
          String(l.skill_trade || l.skillTrade || l.trade || '').trim() || null,
        ]
      );
    }
  }

  if (Array.isArray(payload.misc)) {
    await conn.query('DELETE FROM task_misc WHERE subtask_id = ?', [subtaskId]);
    for (const mc of payload.misc) {
      const desc = String(mc.description || '').trim();
      if (!desc) continue;
      await conn.query(
        `INSERT INTO task_misc (task_id, subtask_id, project_id, site_id, description, amount) VALUES (?, ?, ?, ?, ?, ?)`,
        [taskId, subtaskId, projectId, siteId, desc, Math.max(0, Number(mc.amount || 0))]
      );
    }
  }

  const sum = async (table) => {
    const col = table === 'task_misc' ? 'amount' : 'total_cost';
    const [[r]] = await conn.query(`SELECT COALESCE(SUM(${col}), 0) AS s FROM ${table} WHERE subtask_id = ?`, [subtaskId]);
    return Number(Number(r.s || 0).toFixed(2));
  };
  const material = await sum('task_materials');
  const tool = await sum('task_tools');
  const labour = await sum('task_labour');
  const misc = await sum('task_misc');
  return { material, tool, labour, misc, total: Number((material + tool + labour + misc).toFixed(2)) };
}

/** Adds a per-category budget delta to the main task (keeps its direct plan untouched). */
async function applyMainTaskBudgetDelta(conn, taskId, d) {
  const delta = {
    material: Number(d.material || 0), tool: Number(d.tool || 0), labour: Number(d.labour || 0), misc: Number(d.misc || 0),
  };
  if (!delta.material && !delta.tool && !delta.labour && !delta.misc) return;
  await conn.query(
    `UPDATE project_tasks
     SET material_budget = GREATEST(0, material_budget + ?), tool_budget = GREATEST(0, tool_budget + ?),
         labour_budget = GREATEST(0, labour_budget + ?), misc_budget = GREATEST(0, misc_budget + ?)
     WHERE id = ?`,
    [delta.material, delta.tool, delta.labour, delta.misc, taskId]
  );
  await conn.query(
    'UPDATE project_tasks SET total_budget = material_budget + tool_budget + labour_budget + misc_budget WHERE id = ?',
    [taskId]
  );
}

/**
 * Re-derives a subtask's stored budget columns from its own planning rows and
 * pushes the difference into the main task. Used after anything that changes a
 * subtask's plan outside the subtask form (e.g. approved excess procurement).
 */
async function recalcSubtaskBudget(conn, subtaskId) {
  const [[st]] = await conn.query('SELECT * FROM task_subtasks WHERE id = ?', [subtaskId]);
  if (!st) return null;
  const sum = async (table) => {
    const col = table === 'task_misc' ? 'amount' : 'total_cost';
    const [[r]] = await conn.query(`SELECT COALESCE(SUM(${col}), 0) AS s FROM ${table} WHERE subtask_id = ?`, [subtaskId]);
    return Number(Number(r.s || 0).toFixed(2));
  };
  const next = {
    material: await sum('task_materials'), tool: await sum('task_tools'),
    labour: await sum('task_labour'), misc: await sum('task_misc'),
  };
  await conn.query(
    `UPDATE task_subtasks SET material_budget = ?, tool_budget = ?, labour_budget = ?, misc_budget = ?,
       total_budget = ? WHERE id = ?`,
    [next.material, next.tool, next.labour, next.misc, next.material + next.tool + next.labour + next.misc, subtaskId]
  );
  return {
    material: next.material - Number(st.material_budget || 0),
    tool: next.tool - Number(st.tool_budget || 0),
    labour: next.labour - Number(st.labour_budget || 0),
    misc: next.misc - Number(st.misc_budget || 0),
  };
}

/**
 * Main task progress follows its subtasks once it has any: budget-weighted
 * average (equal weights when nothing is budgeted). All subtasks completed
 * marks the main task completed.
 */
async function rollupMainTaskProgress(conn, taskId) {
  const [subs] = await conn.query('SELECT progress, status, total_budget FROM task_subtasks WHERE task_id = ?', [taskId]);
  if (!subs.length) return null;

  // The main task spans its subtasks: earliest start to latest end.
  const [[span]] = await conn.query(
    'SELECT MIN(start_date) AS s, MAX(end_date) AS e FROM task_subtasks WHERE task_id = ?',
    [taskId]
  );
  if (span.s || span.e) {
    await conn.query(
      `UPDATE project_tasks
       SET start_date = COALESCE(?, start_date), planned_start = COALESCE(?, planned_start),
           end_date = COALESCE(?, end_date), planned_end = COALESCE(?, planned_end),
           duration_days = CASE WHEN ? IS NOT NULL AND ? IS NOT NULL THEN DATEDIFF(?, ?) + 1 ELSE duration_days END
       WHERE id = ?`,
      [span.s, span.s, span.e, span.e, span.s, span.e, span.e, span.s, taskId]
    );
  }
  const totalWeight = subs.reduce((s, r) => s + Number(r.total_budget || 0), 0);
  const progress = totalWeight > 0
    ? subs.reduce((s, r) => s + Number(r.progress || 0) * Number(r.total_budget || 0), 0) / totalWeight
    : subs.reduce((s, r) => s + Number(r.progress || 0), 0) / subs.length;
  const rounded = Math.min(100, Math.max(0, Math.round(progress)));
  const allDone = subs.every((r) => r.status === 'completed' || Number(r.progress || 0) >= 100);
  if (allDone) {
    await conn.query("UPDATE project_tasks SET progress = 100, status = 'completed' WHERE id = ?", [taskId]);
    return 100;
  }
  await conn.query('UPDATE project_tasks SET progress = ? WHERE id = ?', [rounded, taskId]);
  return rounded;
}

function normalizeSubtaskFields(payload, existing = {}) {
  const pick = (a, b, fallback) => (payload[a] !== undefined ? payload[a] : payload[b] !== undefined ? payload[b] : fallback);
  const startDate = pick('start_date', 'startDate', existing.start_date ?? null) || null;
  const endDate = pick('end_date', 'endDate', existing.end_date ?? null) || null;
  let durationDays = pick('duration_days', 'durationDays', existing.duration_days ?? null);
  durationDays = durationDays != null && durationDays !== '' ? Number(durationDays) : inclusiveDays(startDate, endDate);
  const progress = pick('progress', 'progress', existing.progress ?? 0);
  return {
    name: String(pick('name', 'name', existing.name || '')).trim(),
    description: (() => {
      const d = pick('description', 'description', existing.description ?? null);
      return d ? String(d).trim() : null;
    })(),
    status: pick('status', 'status', existing.status || 'on-track') || 'on-track',
    progress: Math.min(100, Math.max(0, Number(progress || 0))),
    startDate,
    endDate,
    durationDays: Math.max(0, Number(durationDays || 0)),
    sortOrder: Number(pick('sort_order', 'sortOrder', existing.sort_order ?? 0) || 0),
  };
}

/**
 * Makes a main task's subtasks match `subtasks` from the project form (inside the
 * caller's transaction): updates those with an id, creates new ones, and removes
 * the rest. A subtask that already has recorded activity is never removed.
 */
async function syncTaskSubtasks(conn, { id: taskId, projectId, siteId }, subtasks, userId) {
  const wanted = subtasks.filter((st) => String(st.name || '').trim());
  const [existing] = await conn.query('SELECT * FROM task_subtasks WHERE task_id = ?', [taskId]);
  const byId = new Map(existing.map((r) => [Number(r.id), r]));
  const keep = new Set(wanted.filter((st) => st.id && byId.has(Number(st.id))).map((st) => Number(st.id)));

  for (const row of existing) {
    if (keep.has(Number(row.id))) continue;
    const usage = await countSubtaskTransactions(row.id, conn);
    if (Object.values(usage).some((n) => n > 0)) {
      throw ApiError.badRequest(
        `Subtask "${row.name}" already has recorded procurement / work / expenses and cannot be removed. Mark it completed instead.`
      );
    }
    if (Number(row.approved_additional_budget || 0) > 0) {
      await conn.query(
        'UPDATE project_tasks SET approved_additional_budget = GREATEST(0, approved_additional_budget - ?) WHERE id = ?',
        [Number(row.approved_additional_budget), taskId]
      );
    }
    await conn.query('DELETE FROM task_subtasks WHERE id = ?', [row.id]); // plan rows cascade
  }

  let order = 0;
  for (const st of wanted) {
    order += 1;
    const current = st.id ? byId.get(Number(st.id)) : null;
    const f = normalizeSubtaskFields({ ...st, sort_order: order }, current || {});
    let subtaskId;
    if (current) {
      subtaskId = current.id;
      await conn.query(
        `UPDATE task_subtasks SET name = ?, description = ?, status = ?, progress = ?, start_date = ?, end_date = ?,
           duration_days = ?, sort_order = ?, site_id = ? WHERE id = ?`,
        [f.name, f.description, f.status, f.progress, f.startDate, f.endDate, f.durationDays, f.sortOrder, siteId, subtaskId]
      );
    } else {
      const [res] = await conn.query(
        `INSERT INTO task_subtasks
           (task_id, project_id, site_id, name, description, status, progress, start_date, end_date, duration_days, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [taskId, projectId, siteId, f.name, f.description, f.status, f.progress, f.startDate, f.endDate,
          f.durationDays, f.sortOrder, userId || null]
      );
      subtaskId = res.insertId;
    }
    const b = await writeSubtaskPlanning(conn, { taskId, subtaskId, projectId, siteId, durationDays: f.durationDays }, {
      materials: st.materials || [], tools: st.tools || [], labour: st.labour || [], misc: st.misc || [],
    });
    await conn.query(
      'UPDATE task_subtasks SET material_budget = ?, tool_budget = ?, labour_budget = ?, misc_budget = ?, total_budget = ? WHERE id = ?',
      [b.material, b.tool, b.labour, b.misc, b.total, subtaskId]
    );
  }
}

async function findSubtaskRow(subtaskId, conn = pool) {
  const [[row]] = await conn.query('SELECT * FROM task_subtasks WHERE id = ?', [Number(subtaskId)]);
  return row || null;
}

async function createSubtask(taskId, payload, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[task]] = await conn.query('SELECT * FROM project_tasks WHERE id = ? FOR UPDATE', [taskId]);
    if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });

    const f = normalizeSubtaskFields(payload);
    const [[{ nextOrder }]] = await conn.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS nextOrder FROM task_subtasks WHERE task_id = ?',
      [taskId]
    );
    const [res] = await conn.query(
      `INSERT INTO task_subtasks
         (task_id, project_id, site_id, name, description, status, progress, start_date, end_date, duration_days, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, task.project_id, task.site_id, f.name, f.description, f.status, f.progress,
        f.startDate, f.endDate, f.durationDays, f.sortOrder || nextOrder, userId || null]
    );
    const subtaskId = res.insertId;

    const budgets = await writeSubtaskPlanning(conn, {
      taskId, subtaskId, projectId: task.project_id, siteId: task.site_id, durationDays: f.durationDays,
    }, payload);
    await conn.query(
      `UPDATE task_subtasks SET material_budget = ?, tool_budget = ?, labour_budget = ?, misc_budget = ?, total_budget = ?
       WHERE id = ?`,
      [budgets.material, budgets.tool, budgets.labour, budgets.misc, budgets.total, subtaskId]
    );
    await applyMainTaskBudgetDelta(conn, taskId, budgets);
    await refreshProjectEstimate(conn, task.project_id);
    await rollupMainTaskProgress(conn, taskId);

    await conn.commit();
    return subtaskId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * `progressOnly` restricts the update to progress / status (contractor rights).
 */
async function updateSubtask(subtaskId, payload, { progressOnly = false } = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[st]] = await conn.query('SELECT * FROM task_subtasks WHERE id = ? FOR UPDATE', [subtaskId]);
    if (!st) throw Object.assign(new Error('Subtask not found'), { status: 404 });

    const src = progressOnly
      ? { progress: payload.progress, status: payload.status }
      : payload;
    const f = normalizeSubtaskFields(src, st);
    await conn.query(
      `UPDATE task_subtasks SET name = ?, description = ?, status = ?, progress = ?, start_date = ?, end_date = ?,
         duration_days = ?, sort_order = ? WHERE id = ?`,
      [f.name || st.name, f.description, f.status, f.progress, f.startDate, f.endDate, f.durationDays, f.sortOrder, subtaskId]
    );

    if (!progressOnly && PLAN_CATEGORIES.some((k) => Array.isArray(payload[k]))) {
      await writeSubtaskPlanning(conn, {
        taskId: st.task_id, subtaskId, projectId: st.project_id, siteId: st.site_id, durationDays: f.durationDays,
      }, payload);
      const delta = await recalcSubtaskBudget(conn, subtaskId);
      await applyMainTaskBudgetDelta(conn, st.task_id, delta);
      await refreshProjectEstimate(conn, st.project_id);
    }
    await rollupMainTaskProgress(conn, st.task_id);

    await conn.commit();
    return st.task_id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Every transaction booked against a subtask, by kind. A subtask with history is never deleted. */
async function countSubtaskTransactions(subtaskId, conn = pool) {
  const q = async (sql) => Number((await conn.query(sql, [subtaskId]))[0][0].n || 0);
  return {
    procurements: await q("SELECT COUNT(*) AS n FROM procurement_requests WHERE subtask_id = ? AND status NOT IN ('rejected', 'cancelled')"),
    dailyUpdates: await q('SELECT COUNT(*) AS n FROM daily_work_updates WHERE subtask_id = ?'),
    workerLogs: await q('SELECT COUNT(*) AS n FROM task_worker_logs WHERE subtask_id = ?'),
    expenses: await q("SELECT COUNT(*) AS n FROM expenses WHERE subtask_id = ? AND status NOT IN ('rejected', 'cancelled')"),
    assignedWorkers: await q('SELECT COUNT(*) AS n FROM task_assigned_workers WHERE subtask_id = ?'),
    toolAllocations: await q('SELECT COUNT(*) AS n FROM tool_allocations WHERE subtask_id = ?'),
  };
}

async function deleteSubtask(subtaskId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[st]] = await conn.query('SELECT * FROM task_subtasks WHERE id = ? FOR UPDATE', [subtaskId]);
    if (!st) throw Object.assign(new Error('Subtask not found'), { status: 404 });

    const usage = await countSubtaskTransactions(subtaskId, conn);
    const inUse = Object.entries(usage).filter(([, n]) => n > 0);
    if (inUse.length) {
      const err = new Error(
        `"${st.name}" already has recorded activity (${inUse.map(([k, n]) => `${n} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(', ')}). `
        + 'It cannot be deleted; mark it completed instead.'
      );
      err.status = 409;
      throw err;
    }

    await applyMainTaskBudgetDelta(conn, st.task_id, {
      material: -Number(st.material_budget || 0), tool: -Number(st.tool_budget || 0),
      labour: -Number(st.labour_budget || 0), misc: -Number(st.misc_budget || 0),
    });
    // Approved additional budget granted to this subtask was also added to the main task.
    if (Number(st.approved_additional_budget || 0) > 0) {
      await conn.query(
        'UPDATE project_tasks SET approved_additional_budget = GREATEST(0, approved_additional_budget - ?) WHERE id = ?',
        [Number(st.approved_additional_budget), st.task_id]
      );
    }
    await conn.query('DELETE FROM task_subtasks WHERE id = ?', [subtaskId]); // planning rows cascade
    await refreshProjectEstimate(conn, st.project_id, { allowZero: true });
    await rollupMainTaskProgress(conn, st.task_id);

    await conn.commit();
    return st.task_id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function mapPlannedMaterial(m) {
  const originalPlanned = Number(m.quantity || 0);
  const approvedAdditional = Number(m.approved_additional_quantity || 0);
  const revisedApproved = Number((originalPlanned + approvedAdditional).toFixed(2));
  const procured = Number(Number(m.already_procured || 0).toFixed(2));
  const used = Number(Number(m.already_used || 0).toFixed(2));
  return {
    id: m.id,
    subtaskId: m.subtask_id || null,
    materialId: m.material_id,
    materialName: m.material_name,
    materialCode: m.material_code,
    unit: m.material_unit,
    category: m.material_category,
    originalPlanned,
    approvedAdditional,
    revisedApproved,
    quantity: revisedApproved,
    costPerUnit: Number(m.cost_per_unit || 0),
    totalCost: Number(m.total_cost || 0),
    procured,
    used,
    remaining: Math.max(0, Number((revisedApproved - used).toFixed(2))),
    remainingProcured: Math.max(0, Number((procured - used).toFixed(2))),
    excess: Math.max(0, Number((procured - revisedApproved).toFixed(2))),
    pendingApprovals: Number(m.pending_approval_quantity || 0),
  };
}

function utilFromBuckets(budgetRow, rateMaterials, dailyWork, workerLogs, expenses) {
  return computeTaskBudgetUtilization(budgetRow, rateMaterials, dailyWork, workerLogs, expenses);
}

const sameSub = (row, subtaskId) => (subtaskId == null ? row.subtask_id == null : Number(row.subtask_id) === Number(subtaskId));

/**
 * Full per-subtask view for Task Planning -> View Details: own plan with
 * procured / used quantities, linked procurement, workers, daily logs, and a
 * budget-vs-actual block. Also returns the "direct" bucket (records on the main
 * task that are in no subtask) and a reconciliation proving
 *   main task actual = sum(subtask actuals) + direct actual.
 */
async function buildSubtaskBreakdown(task, { allMaterials, dailyWork, workerLogs, expenses, assignedWorkers, procurements }) {
  const taskId = task.id;
  const [subs] = await pool.query('SELECT * FROM task_subtasks WHERE task_id = ? ORDER BY sort_order ASC, id ASC', [taskId]);

  const [planMaterials, planTools, planLabour, planMisc] = await Promise.all([
    pool.query(
      `SELECT tm.*, m.name AS material_name, m.code AS material_code, m.unit AS material_unit, m.category AS material_category
       FROM task_materials tm JOIN materials m ON m.id = tm.material_id
       WHERE tm.task_id = ? AND tm.subtask_id IS NOT NULL ORDER BY tm.id`, [taskId]
    ).then(([r]) => r),
    pool.query(
      `SELECT tt.*, t.code AS tool_code FROM task_tools tt LEFT JOIN tools t ON t.id = tt.tool_id
       WHERE tt.task_id = ? AND tt.subtask_id IS NOT NULL ORDER BY tt.id`, [taskId]
    ).then(([r]) => r),
    pool.query(
      `SELECT tl.*, COALESCE(cw.full_name, e.full_name, tl.labour_name) AS person_name,
              COALESCE(cw.skill_category, e.designation, tl.skill_trade) AS person_trade
       FROM task_labour tl
       LEFT JOIN contractor_workers cw ON cw.id = tl.worker_id AND tl.worker_type = 'labour'
       LEFT JOIN employees e ON e.id = tl.worker_id AND tl.worker_type = 'company_employee'
       WHERE tl.task_id = ? AND tl.subtask_id IS NOT NULL ORDER BY tl.id`, [taskId]
    ).then(([r]) => r),
    pool.query('SELECT * FROM task_misc WHERE task_id = ? AND subtask_id IS NOT NULL ORDER BY id', [taskId]).then(([r]) => r),
  ]);

  const liveProcurements = procurements.filter((p) => !['rejected', 'cancelled'].includes(p.status));
  const sumBy = (rows, subtaskId, materialId, field) => rows
    .filter((r) => sameSub(r, subtaskId) && Number(r.material_id) === Number(materialId))
    .reduce((s, r) => s + Number(r[field] || 0), 0);

  const subtasks = subs.map((st) => {
    const sid = st.id;
    const dw = dailyWork.filter((r) => sameSub(r, sid));
    const wl = workerLogs.filter((r) => sameSub(r, sid));
    const ex = expenses.filter((r) => sameSub(r, sid));
    const util = utilFromBuckets(st, allMaterials, dw, wl, ex);

    const materials = planMaterials.filter((m) => Number(m.subtask_id) === sid).map((m) => mapPlannedMaterial({
      ...m,
      already_procured: sumBy(liveProcurements, sid, m.material_id, 'quantity'),
      already_used: sumBy(dw, sid, m.material_id, 'quantity_used'),
      pending_approval_quantity: sumBy(procurements.filter((p) => p.status === 'pending_approval'), sid, m.material_id, 'quantity'),
    }));

    return {
      id: sid,
      taskId: st.task_id,
      projectId: st.project_id,
      siteId: st.site_id,
      name: st.name,
      description: st.description,
      status: st.status,
      progress: Number(st.progress || 0),
      startDate: st.start_date,
      endDate: st.end_date,
      durationDays: Number(st.duration_days || 0),
      sortOrder: Number(st.sort_order || 0),
      budget: {
        material: Number(st.material_budget || 0),
        tool: Number(st.tool_budget || 0),
        labour: Number(st.labour_budget || 0),
        misc: Number(st.misc_budget || 0),
        total: Number(st.total_budget || 0),
        approvedAdditional: Number(st.approved_additional_budget || 0),
        pendingExcess: Number(st.pending_excess_budget || 0),
      },
      plannedBudget: util.total.effectiveBudget,
      actualCost: util.total.actual,
      remainingBudget: Number((util.total.effectiveBudget - util.total.actual).toFixed(2)),
      budgetUtilization: util,
      materials,
      tools: planTools.filter((t) => Number(t.subtask_id) === sid).map((t) => ({
        id: t.id, toolId: t.tool_id, toolName: t.tool_name, toolCode: t.tool_code, rentalType: t.rental_type,
        quantity: Number(t.quantity || 1), cost: Number(t.cost || 0), workingDays: Number(t.working_days || 1),
        startDate: t.start_date || null, endDate: t.end_date || null, totalCost: Number(t.total_cost || 0),
      })),
      labour: planLabour.filter((l) => Number(l.subtask_id) === sid).map((l) => ({
        id: l.id, labourName: l.person_name || l.labour_name || '', labourType: l.labour_type,
        workerId: l.worker_id, workerType: l.worker_type, skillTrade: l.person_trade || l.skill_trade || null,
        workerCount: Number(l.worker_count || 1), dailyWage: Number(l.daily_wage || 0),
        workingDays: Number(l.working_days || 0), startDate: l.start_date, endDate: l.end_date,
        totalCost: Number(l.total_cost || 0), remarks: l.remarks,
      })),
      misc: planMisc.filter((mc) => Number(mc.subtask_id) === sid).map((mc) => ({
        id: mc.id, description: mc.description, amount: Number(mc.amount || 0),
      })),
      procurements: procurements.filter((p) => sameSub(p, sid)).map(mapProcurementRow),
      assignedWorkers: assignedWorkers.filter((w) => sameSub(w, sid)).map((w) => ({
        id: w.id, workerName: w.worker_name, workerType: w.worker_type, trade: w.trade, status: w.status,
        expectedDays: Number(w.expected_days || 0), dailyWage: Number(w.daily_wage || 0), plannedCost: Number(w.planned_cost || 0),
      })),
      counts: {
        dailyUpdates: dw.length,
        workerLogs: wl.length,
        expenses: ex.length,
        materialsConsumed: dw.filter((u) => u.material_id && Number(u.quantity_used) > 0).length,
      },
    };
  });

  // Direct bucket: what the main task plans / spends outside any subtask.
  const subTotals = subtasks.reduce((acc, s) => {
    acc.material += s.budget.material; acc.tool += s.budget.tool; acc.labour += s.budget.labour;
    acc.misc += s.budget.misc; acc.total += s.budget.total; acc.approvedAdditional += s.budget.approvedAdditional;
    acc.actual += s.actualCost; acc.effective += s.plannedBudget;
    return acc;
  }, { material: 0, tool: 0, labour: 0, misc: 0, total: 0, approvedAdditional: 0, actual: 0, effective: 0 });

  const r2 = (n) => Number(Number(n || 0).toFixed(2));
  const directRow = {
    material_budget: Math.max(0, r2(Number(task.material_budget || 0) - subTotals.material)),
    tool_budget: Math.max(0, r2(Number(task.tool_budget || 0) - subTotals.tool)),
    labour_budget: Math.max(0, r2(Number(task.labour_budget || 0) - subTotals.labour)),
    misc_budget: Math.max(0, r2(Number(task.misc_budget || 0) - subTotals.misc)),
    total_budget: Math.max(0, r2(Number(task.total_budget || 0) - subTotals.total)),
    approved_additional_budget: Math.max(0, r2(Number(task.approved_additional_budget || 0) - subTotals.approvedAdditional)),
  };
  const directUtil = utilFromBuckets(
    directRow,
    allMaterials,
    dailyWork.filter((r) => r.subtask_id == null),
    workerLogs.filter((r) => r.subtask_id == null),
    expenses.filter((r) => r.subtask_id == null)
  );

  const mainUtil = computeTaskBudgetUtilization(task, allMaterials, dailyWork, workerLogs, expenses);
  const reconciledActual = r2(subTotals.actual + directUtil.total.actual);

  return {
    subtasks,
    direct: {
      plannedBudget: directUtil.total.effectiveBudget,
      actualCost: directUtil.total.actual,
      remainingBudget: r2(directUtil.total.effectiveBudget - directUtil.total.actual),
      budgetUtilization: directUtil,
    },
    consolidation: {
      subtaskCount: subtasks.length,
      completedSubtasks: subtasks.filter((s) => s.status === 'completed' || s.progress >= 100).length,
      subtasksPlanned: r2(subTotals.effective),
      directPlanned: directUtil.total.effectiveBudget,
      mainTaskPlanned: mainUtil.total.effectiveBudget,
      subtasksActual: r2(subTotals.actual),
      directActual: directUtil.total.actual,
      mainTaskActual: mainUtil.total.actual,
      mainTaskRemaining: r2(mainUtil.total.effectiveBudget - mainUtil.total.actual),
      // Every record is in exactly one bucket, so these must agree.
      reconciled: Math.abs(reconciledActual - mainUtil.total.actual) < 0.01,
    },
  };
}

function mapProcurementRow(p) {
  return {
    id: p.id,
    requestNumber: p.request_number,
    subtaskId: p.subtask_id || null,
    subtaskName: p.subtask_name || null,
    itemType: p.item_type || (p.tool_id ? 'tool' : 'material'),
    itemName: p.material_name || p.tool_name || '—',
    quantity: Number(p.quantity || 0),
    unit: p.unit || p.material_unit || 'unit',
    status: p.status,
    isExcess: Boolean(p.is_excess),
    amount: Number(p.total_amount != null ? p.total_amount : Number(p.quantity || 0) * Number(p.estimated_rate || 0)),
    vehicleNumber: p.received_vehicle_number || p.vehicle_number || null,
    requestedByName: p.requested_by_name || null,
    createdAt: p.created_at,
  };
}

/** Lightweight per-subtask summaries for list / site / project views (one query set for many tasks). */
async function findSubtaskSummaries(taskIds) {
  const out = new Map();
  if (!taskIds.length) return out;
  const ph = taskIds.map(() => '?').join(',');
  const [subs] = await pool.query(
    `SELECT * FROM task_subtasks WHERE task_id IN (${ph}) ORDER BY sort_order ASC, id ASC`, taskIds
  );
  if (!subs.length) return out;
  const subIds = subs.map((s) => s.id);
  const sph = subIds.map(() => '?').join(',');
  const [[mats], [dws], [wls], [exs]] = await Promise.all([
    pool.query(`SELECT task_id, material_id, cost_per_unit FROM task_materials WHERE task_id IN (${ph})`, taskIds),
    pool.query(`SELECT * FROM daily_work_updates WHERE subtask_id IN (${sph})`, subIds),
    pool.query(`SELECT * FROM task_worker_logs WHERE subtask_id IN (${sph})`, subIds),
    pool.query(`SELECT * FROM expenses WHERE subtask_id IN (${sph}) AND status NOT IN ('rejected', 'cancelled')`, subIds),
  ]);
  for (const st of subs) {
    const util = computeTaskBudgetUtilization(
      st,
      mats.filter((m) => m.task_id === st.task_id),
      dws.filter((r) => r.subtask_id === st.id),
      wls.filter((r) => r.subtask_id === st.id),
      exs.filter((r) => r.subtask_id === st.id)
    );
    if (!out.has(st.task_id)) out.set(st.task_id, []);
    out.get(st.task_id).push({
      id: st.id,
      name: st.name,
      description: st.description,
      status: st.status,
      progress: Number(st.progress || 0),
      startDate: st.start_date,
      endDate: st.end_date,
      durationDays: Number(st.duration_days || 0),
      plannedBudget: util.total.effectiveBudget,
      actualCost: util.total.actual,
      remainingBudget: Number((util.total.effectiveBudget - util.total.actual).toFixed(2)),
      utilization: util.total.utilization,
      isExceeded: util.total.isExceeded,
    });
  }
  return out;
}

/** Subtasks of a task for pickers (procurement, daily work, expenses, labour). */
async function listSubtasksForTask(taskId) {
  const [rows] = await pool.query(
    `SELECT id, task_id, name, status, progress, start_date, end_date, total_budget, approved_additional_budget
     FROM task_subtasks WHERE task_id = ? ORDER BY sort_order ASC, id ASC`,
    [taskId]
  );
  return rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    name: r.name,
    status: r.status,
    progress: Number(r.progress || 0),
    startDate: r.start_date,
    endDate: r.end_date,
    totalBudget: Number(r.total_budget || 0) + Number(r.approved_additional_budget || 0),
  }));
}

module.exports = {
  createTask,
  updateTask,
  deleteTask,
  findTaskById,
  findAllTasks,
  addWorkerLog,
  getTaskLabourSummary,
  normalizeToolRow,
  findPlannedTools,
  saveProjectTasks,
  getTaskAssignments,
  assignWorkerToTask,
  unassignWorkerFromTask,
  createQuickWorker,
  findPlannedMaterials,
  computeTaskBudgetUtilization,
  getTaskBudgetApprovals,
  // subtasks
  subtaskScope,
  toSubtaskId,
  syncTaskSubtasks,
  findSubtaskRow,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  countSubtaskTransactions,
  recalcSubtaskBudget,
  applyMainTaskBudgetDelta,
  refreshProjectEstimate,
  rollupMainTaskProgress,
  findSubtaskSummaries,
  listSubtasksForTask,
};
