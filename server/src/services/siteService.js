'use strict';

const ApiError = require('../utils/ApiError');
const siteModel = require('../models/siteModel');

async function getById(id) {
  const site = await siteModel.findById(id);
  if (!site) throw ApiError.notFound('That site does not exist.');
  return site;
}

/** Site detail: the record plus its activity, labour, materials and issues. */
async function getDetail(id) {
  const site = await getById(id);
  const snapshot = await siteModel.findSnapshot(id);

  const formattedTasks = (snapshot.tasks || []).map((t) => {
    const actualLabourCost = Number(t.actual_labour_cost || 0);
    const actualMaterialCost = Number(t.actual_material_cost || 0);
    const actualTaskExpenses = Number(t.actual_task_expenses || 0);
    const totalActualCost = Number((actualLabourCost + actualMaterialCost + actualTaskExpenses).toFixed(2));
    const totalBudget = Number(t.total_budget || 0);
    return {
      id: t.id,
      projectId: t.project_id,
      siteId: t.site_id,
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
      totalBudget,
      actualLabourCost,
      actualMaterialCost,
      actualTaskExpenses,
      actualCost: totalActualCost,
      variance: Number((totalBudget - totalActualCost).toFixed(2)),
      workerCount: Number(t.worker_count || 0),
      updatesCount: Number(t.updates_count || 0),
    };
  });

  const plannedMaterialBudget = formattedTasks.reduce((sum, t) => sum + t.materialBudget, 0);
  const plannedLabourBudget = formattedTasks.reduce((sum, t) => sum + t.labourBudget, 0);
  const plannedToolBudget = formattedTasks.reduce((sum, t) => sum + t.toolBudget, 0);
  const plannedMiscBudget = formattedTasks.reduce((sum, t) => sum + t.miscBudget, 0);
  const plannedTotalBudget = plannedMaterialBudget + plannedLabourBudget + plannedToolBudget + plannedMiscBudget;

  const actualLabourCost = formattedTasks.reduce((sum, t) => sum + t.actualLabourCost, 0);
  const actualMaterialCost = formattedTasks.reduce((sum, t) => sum + t.actualMaterialCost, 0);
  const actualToolCost = formattedTasks.reduce((sum, t) => sum + (t.toolBudget > 0 ? t.actualTaskExpenses : 0), 0);
  const actualMiscCost = formattedTasks.reduce((sum, t) => sum + (t.toolBudget === 0 ? t.actualTaskExpenses : 0), 0);
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
