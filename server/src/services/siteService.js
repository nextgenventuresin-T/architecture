'use strict';

const ApiError = require('../utils/ApiError');
const siteModel = require('../models/siteModel');
const taskModel = require('../models/taskModel');
const { pool } = require('../config/db');

async function getById(id) {
  const site = await siteModel.findById(id);
  if (!site) throw ApiError.notFound('That site does not exist.');
  return site;
}

/** Site detail: the record plus its activity, labour, materials and issues. */
async function getDetail(id) {
  const site = await getById(id);
  const snapshot = await siteModel.findSnapshot(id);

  let taskMaterials = [];
  let taskTools = [];
  let taskLabour = [];
  let taskMisc = [];
  let taskWorkerLogs = [];
  let taskDailyWork = [];

  const taskIds = (snapshot.tasks || []).map((t) => t.id);
  if (taskIds.length) {
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

  const subtaskMap = await taskModel.findSubtaskSummaries(taskIds);
  // Task-linked expenses (machine usage, transport, misc, ...) are part of each
  // task's actual cost here exactly as in the task detail and task list.
  let taskExpenses = snapshot.expenses || [];
  if (taskIds.length && !snapshot.expenses) {
    const [exRows] = await pool.query(
      `SELECT * FROM expenses WHERE task_id IN (${taskIds.map(() => '?').join(',')}) AND status NOT IN ('rejected', 'cancelled')`,
      taskIds
    );
    taskExpenses = exRows;
  }

  const formattedTasks = (snapshot.tasks || []).map((t) => {
    const subtasks = subtaskMap.get(t.id) || [];
    const tMaterials = taskMaterials.filter((m) => m.task_id === t.id);
    const tTools = taskTools.filter((tl) => tl.task_id === t.id);
    const tLabour = taskLabour.filter((l) => l.task_id === t.id);
    const tMisc = taskMisc.filter((mc) => mc.task_id === t.id);
    const tWorkerLogs = taskWorkerLogs.filter((w) => w.task_id === t.id);
    const tDailyWork = taskDailyWork.filter((dw) => dw.task_id === t.id);
    const tExpenses = taskExpenses.filter((e) => e.task_id === t.id && !['rejected', 'cancelled'].includes(e.status));

    const budgetUtilization = taskModel.computeTaskBudgetUtilization(t, tMaterials, tDailyWork, tWorkerLogs, tExpenses);
    const actualLabourCost = budgetUtilization.labour.actual;
    const actualMaterialCost = budgetUtilization.materials.actual;
    const actualToolCost = budgetUtilization.tools.actual;
    const actualMiscCost = budgetUtilization.misc.actual;
    const totalActualCost = budgetUtilization.total.actual;
    const effectiveBudget = budgetUtilization.total.effectiveBudget;

    return {
      id: t.id,
      projectId: t.project_id,
      siteId: t.site_id,
      siteName: site.name,
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
      actualLabourCost,
      actualMaterialCost,
      actualToolCost,
      actualMiscCost,
      actualCost: totalActualCost,
      variance: Number((effectiveBudget - totalActualCost).toFixed(2)),
      workerCount: Number(t.worker_count || 0),
      workerEntriesCount: Number(t.worker_count || 0),
      uniqueWorkersCount: Number(t.unique_workers_count || 0),
      updatesCount: Number(t.updates_count || 0),
      dailyUpdatesCount: Number(t.updates_count || 0),
      // Subtask spend is already inside this main task's actuals (same task_id).
      subtaskCount: subtasks.length,
      subtasks,
    };
  });

  const plannedMaterialBudget = formattedTasks.reduce((sum, t) => sum + t.materialBudget, 0);
  const plannedLabourBudget = formattedTasks.reduce((sum, t) => sum + t.labourBudget, 0);
  const plannedToolBudget = formattedTasks.reduce((sum, t) => sum + t.toolBudget, 0);
  const plannedMiscBudget = formattedTasks.reduce((sum, t) => sum + t.miscBudget, 0);
  const plannedTotalBudget = plannedMaterialBudget + plannedLabourBudget + plannedToolBudget + plannedMiscBudget;

  const actualLabourCost = formattedTasks.reduce((sum, t) => sum + t.actualLabourCost, 0);
  const actualMaterialCost = formattedTasks.reduce((sum, t) => sum + t.actualMaterialCost, 0);
  const actualToolCost = formattedTasks.reduce((sum, t) => sum + t.actualToolCost, 0);
  const actualMiscCost = formattedTasks.reduce((sum, t) => sum + t.actualMiscCost, 0);
  const actualTotalCost = actualMaterialCost + actualLabourCost + actualToolCost + actualMiscCost;
  const remainingTotalBudget = plannedTotalBudget - actualTotalCost;
  const utilizationPercentage = plannedTotalBudget > 0 ? Math.min(100, Math.round((actualTotalCost / plannedTotalBudget) * 100)) : 0;

  const budgetSummary = {
    plannedBudget: plannedTotalBudget,
    usedBudget: actualTotalCost,
    remainingBudget: remainingTotalBudget,
    utilizationPercentage,
    categories: [
      { name: 'Materials', planned: plannedMaterialBudget, used: actualMaterialCost, remaining: plannedMaterialBudget - actualMaterialCost },
      { name: 'Labour', planned: plannedLabourBudget, used: actualLabourCost, remaining: plannedLabourBudget - actualLabourCost },
      { name: 'Machines / Tools', planned: plannedToolBudget, used: actualToolCost, remaining: plannedToolBudget - actualToolCost },
      { name: 'Miscellaneous', planned: plannedMiscBudget, used: actualMiscCost, remaining: plannedMiscBudget - actualMiscCost },
      { name: 'Total', planned: plannedTotalBudget, used: actualTotalCost, remaining: remainingTotalBudget },
    ],
    taskBreakdown: formattedTasks.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      plannedBudget: t.totalBudget,
      actualCost: t.actualCost,
      variance: t.variance,
      subtasks: t.subtasks,
    })),
  };

  return {
    site,
    ...snapshot,
    tasks: formattedTasks,
    budgetSummary,
    stats: {
      todayAttendance: Number(snapshot.stats.today_attendance || 0),
      totalWorkers: Number(snapshot.stats.total_workers || 0),
      totalDailyExpenses: Number(snapshot.stats.total_daily_expenses || 0),
      materialsReceived: Number(snapshot.stats.materials_received || 0),
      materialsConsumed: Number(snapshot.stats.materials_consumed || 0),
      openIssues: Number(snapshot.stats.open_issues || 0),
    },
  };
}

async function update(id, payload) {
  await getById(id);
  await siteModel.update(id, payload);
  return getById(id);
}

async function remove(id) {
  await getById(id);
  await siteModel.remove(id);
}

/** Records the daily log. One entry per site per day, enforced in the DB too. */
async function logActivity(siteId, payload, userId) {
  await getById(siteId);

  if (new Date(payload.activity_date) > new Date()) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      activity_date: 'You cannot log activity for a future date.',
    });
  }
  if (await siteModel.findActivityByDate(siteId, payload.activity_date)) {
    throw ApiError.badRequest('Check the highlighted fields.', {
      activity_date: 'A log already exists for this site on that date.',
    });
  }

  const id = await siteModel.createActivity({ ...payload, site_id: siteId, recorded_by: userId ?? null });
  return siteModel.findActivityById(id);
}

module.exports = { getById, getDetail, update, remove, logActivity };
