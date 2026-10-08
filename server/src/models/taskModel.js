'use strict';

const { pool } = require('../config/db');

/**
 * Task Data Access Model.
 * Handles Project -> Site -> Task creation, budgeting, tracking,
 * worker logging, material usage, actual expenses, and budget utilization.
 */

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
  const toolExpenseCategories = new Set(['Equipment Rental', 'Tools', 'Machinery', 'Equipment', 'Tools & Equipment']);
  let actualTools = 0;
  expenses.forEach((e) => {
    if (toolExpenseCategories.has(e.category)) {
      actualTools += Number(e.amount || 0);
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
      if (w.worker_type !== 'company_employee' && w.workerType !== 'company_employee') {
        const hours = Number(w.hours_worked || w.hoursWorked || 8);
        const wage = Number(w.daily_wage || w.dailyWage || 0);
        actualLabour += (hours / 8) * wage;
      }
    });
  } else if (dailyWork.length > 0) {
    const distinctDates = new Set(dailyWork.map((d) => (d.work_date || d.workDate ? String(d.work_date || d.workDate).slice(0, 10) : null)).filter(Boolean));
    const completedDays = distinctDates.size;
    const durationDays = Number(task.duration_days || task.durationDays || 0) || 1;
    const dailyLabourCost = budgetedLabour / durationDays;
    actualLabour = completedDays * dailyLabourCost;
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
  expenses.forEach((e) => {
    if (['Miscellaneous', 'Misc', 'Operational Misc'].includes(e.category)) {
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
    `SELECT tba.*, u.full_name AS requested_by_name, du.full_name AS decided_by_name
     FROM task_budget_approvals tba
     LEFT JOIN users u ON u.id = tba.requested_by
     LEFT JOIN users du ON du.id = tba.decided_by
     WHERE tba.task_id = ?
     ORDER BY tba.created_at DESC`,
    [Number(taskId)]
  );
  return rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
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
    const tools = Array.isArray(payload.tools) ? payload.tools : [];
    for (const t of tools) {
      const qty = Number(t.quantity || 1);
      const cost = Number(t.cost || 0);
      const total = t.total_cost != null ? Number(t.total_cost) : qty * cost;
      toolBudget += total;
    }

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

    for (const t of tools) {
      const toolName = (t.tool_name || t.toolName || t.name || '').trim();
      if (toolName) {
        const qty = Number(t.quantity || 1);
        const cost = Number(t.cost || 0);
        const total = t.total_cost != null ? Number(t.total_cost) : qty * cost;
        await connection.query(
          `INSERT INTO task_tools (task_id, project_id, site_id, tool_id, tool_name, rental_type, quantity, cost, total_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [taskId, projectId, siteId, t.tool_id || t.toolId || null, toolName, t.rental_type || t.rentalType || 'Rent', qty, cost, total]
        );
      }
    }

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
      await connection.query('DELETE FROM task_materials WHERE task_id = ?', [taskId]);
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
      await connection.query('DELETE FROM task_tools WHERE task_id = ?', [taskId]);
      for (const t of payload.tools) {
        const toolName = (t.tool_name || t.toolName || t.name || '').trim();
        if (toolName) {
          const qty = Number(t.quantity || 1);
          const cost = Number(t.cost || 0);
          const total = t.total_cost != null ? Number(t.total_cost) : qty * cost;
          toolBudget += total;
          await connection.query(
            `INSERT INTO task_tools (task_id, project_id, site_id, tool_id, tool_name, rental_type, quantity, cost, total_cost)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [taskId, projectId, siteId, t.tool_id || t.toolId || null, toolName, t.rental_type || t.rentalType || 'Rent', qty, cost, total]
          );
        }
      }
    }

    if (hasLabour) {
      labourBudget = 0;
      await connection.query('DELETE FROM task_labour WHERE task_id = ?', [taskId]);
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
      await connection.query('DELETE FROM task_misc WHERE task_id = ?', [taskId]);
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
       WHERE task_id = ? AND status NOT IN ('rejected', 'cancelled')
       GROUP BY material_id
     ) proc ON proc.material_id = tm.material_id
     LEFT JOIN (
       SELECT material_id, SUM(quantity_used) AS used_quantity
       FROM daily_work_updates
       WHERE task_id = ?
       GROUP BY material_id
     ) used ON used.material_id = tm.material_id
     LEFT JOIN (
       SELECT material_id, SUM(quantity) AS pending_approval_quantity
       FROM procurement_requests
       WHERE task_id = ? AND status = 'pending_approval'
       GROUP BY material_id
     ) pend ON pend.material_id = tm.material_id
     WHERE tm.task_id = ? ORDER BY tm.id ASC`,
    [taskId, taskId, taskId, taskId]
  );

  const [tools] = await pool.query(
    `SELECT tt.*, t.code AS tool_code, t.type AS tool_master_type
     FROM task_tools tt
     LEFT JOIN tools t ON t.id = tt.tool_id
     WHERE tt.task_id = ? ORDER BY tt.id ASC`,
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
     WHERE tl.task_id = ? ORDER BY tl.id ASC`,
    [taskId]
  );

  const [misc] = await pool.query(
    `SELECT * FROM task_misc WHERE task_id = ? ORDER BY id ASC`,
    [taskId]
  );

  // Load daily work updates for this task
  const [dailyWork] = await pool.query(
    `SELECT dwu.*, c.name AS contractor_name, m.name AS material_name, m.unit AS material_unit
     FROM daily_work_updates dwu
     LEFT JOIN contractors c ON c.id = dwu.contractor_id
     LEFT JOIN materials m ON m.id = dwu.material_id
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
    `SELECT twl.*, c.name AS contractor_name, u.full_name AS logged_by_name
     FROM task_worker_logs twl
     LEFT JOIN contractors c ON c.id = twl.contractor_id
     LEFT JOIN users u ON u.id = twl.created_by
     WHERE twl.task_id = ?
     ORDER BY twl.work_date DESC, twl.id DESC`,
    [taskId]
  );

  // Calculate actual expenses logged against this task
  const [taskExpenses] = await pool.query(
    `SELECT e.*, c.name AS contractor_name
     FROM expenses e
     LEFT JOIN contractors c ON c.id = e.contractor_id
     WHERE e.task_id = ? OR e.id IN (
       SELECT expense_id FROM daily_work_updates WHERE task_id = ? AND expense_id IS NOT NULL
     )
     ORDER BY e.expense_date DESC`,
    [taskId, taskId]
  );

  // Actual assigned workers for this task
  const [assignedWorkers] = await pool.query(
    `SELECT taw.*,
            COALESCE(taw.phone, cw.phone, e.phone) AS phone,
            COALESCE(taw.aadhaar_number, cw.aadhaar_number) AS aadhaar_number,
            c.name AS contractor_name
     FROM task_assigned_workers taw
     LEFT JOIN contractor_workers cw ON cw.id = taw.worker_id AND taw.worker_type = 'daily_wage'
     LEFT JOIN contractors c ON c.id = cw.contractor_id
     LEFT JOIN employees e ON e.id = taw.worker_id AND taw.worker_type = 'company_employee'
     WHERE taw.task_id = ?
     ORDER BY taw.id ASC`,
    [taskId]
  );

  // Actual labour cost from worker logs + daily labour records
  let actualLabourCost = workerLogs.reduce(
    (sum, w) => sum + (w.worker_type !== 'company_employee' ? (Number(w.daily_wage || 0) * (Number(w.hours_worked || 8) / 8)) : 0),
    0
  );
  if (workerLogs.length === 0 && dailyWork.length > 0) {
    const distinctDates = new Set(dailyWork.map((d) => (d.work_date ? String(d.work_date).slice(0, 10) : null)).filter(Boolean));
    const completedDays = distinctDates.size;
    const durationDays = Number(task.duration_days || 0) || 1;
    const dailyLabourCost = Number(task.labour_budget || 0) / durationDays;
    actualLabourCost = completedDays * dailyLabourCost;
  }

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
    }));

  const budgetUtilization = computeTaskBudgetUtilization(task, materials, dailyWork, workerLogs, taskExpenses);
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
    materials: materials.map((m) => {
      const originalPlanned = Number(m.quantity || 0);
      const approvedAdditional = Number(m.approved_additional_quantity || 0);
      const revisedApproved = Number((originalPlanned + approvedAdditional).toFixed(2));
      const procured = Number(Number(m.already_procured || 0).toFixed(2));
      const used = Number(Number(m.already_used || 0).toFixed(2));
      const remaining = Math.max(0, Number((revisedApproved - used).toFixed(2)));
      const remainingProcured = Math.max(0, Number((procured - used).toFixed(2)));
      const excess = Math.max(0, Number((procured - revisedApproved).toFixed(2)));

      return {
        id: m.id,
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
        remaining,
        remainingProcured,
        excess,
        pendingApprovals: Number(m.pending_approval_quantity || 0),
      };
    }),
    tools: tools.map((t) => ({
      id: t.id,
      toolId: t.tool_id,
      toolName: t.tool_name,
      toolCode: t.tool_code,
      rentalType: t.rental_type,
      quantity: Number(t.quantity || 1),
      cost: Number(t.cost || 0),
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
    })),
    labour: labour.map((l) => ({
      id: l.id,
      labourName: l.labour_name || '',
      labourType: l.labour_type,
      workerCount: Number(l.worker_count || 1),
      dailyWage: Number(l.daily_wage || 0),
      workingDays: Number(l.working_days || 0),
      totalCost: Number(l.total_cost || 0),
    })),
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
    })),
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
            (SELECT COALESCE(SUM(twl.daily_wage * (twl.hours_worked / 8)), 0) FROM task_worker_logs twl WHERE twl.task_id = t.id) AS actual_labour_cost,
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

  return rows.map((r) => {
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
    };
  });
}

async function addWorkerLog({
  task_id,
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
      (task_id, project_id, site_id, contractor_id, daily_work_id,
       worker_id, worker_type,
       worker_name, worker_code, labour_type, work_date,
       hours_worked, daily_wage, work_performed, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task_id,
      project_id,
      site_id || null,
      contractor_id || null,
      daily_work_id || null,
      worker_id ? Number(worker_id) : null,
      worker_type || 'labour',
      worker_name.trim(),
      worker_code ? String(worker_code).trim() : null,
      labour_type ? String(labour_type).trim() : 'Labour',
      work_date,
      hours_worked,
      daily_wage,
      work_performed ? work_performed.trim() : null,
      created_by || null,
    ]
  );
  return result.insertId;
}

async function getTaskLabourSummary(taskId) {
  const [workerLogs] = await pool.query(
    `SELECT twl.*, c.name AS contractor_name
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
    const cost = Number(log.daily_wage || 0) * (Number(log.hours_worked || 8) / 8);
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
      const tools = Array.isArray(t.tools) ? t.tools : [];
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
      tools.forEach((tl) => {
        const qty = Number(tl.quantity || 1);
        const cost = Number(tl.cost || 0);
        toolBudget += Number(tl.totalCost != null ? tl.totalCost : qty * cost);
      });
      labour.forEach((l) => {
        const wc = Number(l.workerCount || l.worker_count || 1);
        const dw = Number(l.dailyWage || l.daily_wage || 0);
        const wd = Number(l.workingDays || l.working_days || durationDays || 0);
        labourBudget += Number(l.totalCost != null ? l.totalCost : wc * dw * wd);
      });
      misc.forEach((mc) => {
        miscBudget += Number(mc.amount || 0);
      });

      const totalBudget = materialBudget + toolBudget + labourBudget + miscBudget;

      let taskId = t.id ? Number(t.id) : null;
      if (taskId && existingIds.includes(taskId)) {
        await connection.query(
          `UPDATE project_tasks
           SET site_id = ?, name = ?, description = ?, status = ?, progress = ?,
               start_date = ?, end_date = ?, planned_start = ?, planned_end = ?, duration_days = ?,
               material_budget = ?, tool_budget = ?, labour_budget = ?, misc_budget = ?, total_budget = ?
           WHERE id = ?`,
          [
            siteId, taskName, description, status, progress,
            startDate, endDate, startDate, endDate, durationDays,
            materialBudget, toolBudget, labourBudget, miscBudget, totalBudget,
            taskId
          ]
        );
        await connection.query('DELETE FROM task_materials WHERE task_id = ?', [taskId]);
        await connection.query('DELETE FROM task_tools WHERE task_id = ?', [taskId]);
        await connection.query('DELETE FROM task_labour WHERE task_id = ?', [taskId]);
        await connection.query('DELETE FROM task_misc WHERE task_id = ?', [taskId]);
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

      for (const tl of tools) {
        const toolName = (tl.toolName || tl.tool_name || tl.name || '').trim();
        if (toolName) {
          const qty = Number(tl.quantity || 1);
          const cost = Number(tl.cost || 0);
          const total = tl.totalCost != null ? Number(tl.totalCost) : qty * cost;
          await connection.query(
            `INSERT INTO task_tools (task_id, project_id, site_id, tool_id, tool_name, rental_type, quantity, cost, total_cost)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [taskId, projectId, siteId, tl.toolId || tl.tool_id || null, toolName, tl.rentalType || tl.rental_type || 'Rent', qty, cost, total]
          );
        }
      }

      const seenWorkers = new Set();
      for (const l of labour) {
        const lType = (l.labourType || l.labour_type || 'Labour').trim();
        const lName = (l.labourName || l.labour_name || l.workerName || l.worker_name || '').trim();
        const workerId = l.workerId || l.worker_id ? Number(l.workerId || l.worker_id) : null;
        const workerType = l.workerType || l.worker_type || (lType.toLowerCase().includes('company') ? 'company_employee' : 'labour');
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
    }

    const [[budgetSum]] = await connection.query(
      'SELECT COALESCE(SUM(total_budget), 0) AS total_sum FROM project_tasks WHERE project_id = ?',
      [projectId]
    );
    if (Number(budgetSum.total_sum) > 0) {
      await connection.query('UPDATE projects SET estimated_budget = ? WHERE id = ?', [
        Number(budgetSum.total_sum),
        projectId,
      ]);
    }

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
            COALESCE(taw.phone, cw.phone, e.phone) AS phone,
            COALESCE(taw.aadhaar_number, cw.aadhaar_number) AS aadhaar_number,
            c.name AS contractor_name
     FROM task_assigned_workers taw
     LEFT JOIN contractor_workers cw ON cw.id = taw.worker_id AND taw.worker_type = 'daily_wage'
     LEFT JOIN contractors c ON c.id = cw.contractor_id
     LEFT JOIN employees e ON e.id = taw.worker_id AND taw.worker_type = 'company_employee'
     WHERE taw.task_id = ?
     ORDER BY taw.id ASC`,
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
    const err = new Error(`${workerName} is already assigned to this task.`);
    err.status = 409;
    throw err;
  }

  const [res] = await pool.query(
    `INSERT INTO task_assigned_workers
      (task_id, project_id, site_id, contractor_id, worker_type, worker_id,
       worker_name, worker_code, phone, aadhaar_number, trade, start_date,
       end_date, expected_days, daily_wage, planned_cost, remarks, assigned_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  const workerCode = `CW-${String(nextId).padStart(4, '0')}`;

  const phone = (payload.phone || payload.mobile || '').trim() || null;
  const aadhaar = (payload.aadhaar_number || payload.aadhaarNumber || payload.aadhaar || '').trim() || null;
  const trade = (payload.skill_category || payload.trade || 'General Labour').trim();
  const dailyRate = Number(payload.daily_rate || payload.dailyRate || payload.daily_wage || 750);
  const notes = (payload.notes || '').trim() || null;

  const [res] = await pool.query(
    `INSERT INTO contractor_workers
      (contractor_id, worker_code, full_name, phone, aadhaar_number, skill_category, daily_rate, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
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

async function findPlannedMaterials(taskId) {
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
       WHERE task_id = ? AND status NOT IN ('rejected', 'cancelled')
       GROUP BY material_id
     ) proc ON proc.material_id = tm.material_id
     LEFT JOIN (
       SELECT material_id, SUM(quantity_used) AS used_quantity
       FROM daily_work_updates
       WHERE task_id = ?
       GROUP BY material_id
     ) used ON used.material_id = tm.material_id
     WHERE tm.task_id = ?
     ORDER BY tm.id ASC`,
    [taskId, taskId, taskId]
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

module.exports = {
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
  createQuickWorker,
  findPlannedMaterials,
  computeTaskBudgetUtilization,
  getTaskBudgetApprovals,
};
