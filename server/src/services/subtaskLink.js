'use strict';

const ApiError = require('../utils/ApiError');
const taskModel = require('../models/taskModel');

/**
 * Validates the optional subtask on any record (procurement, daily work,
 * expense, worker log, assignment) against its main task. Returns the subtask
 * row, or null when the record is booked directly on the main task.
 */
async function resolveSubtask(taskId, rawSubtaskId) {
  const subtaskId = rawSubtaskId && Number(rawSubtaskId) > 0 ? Number(rawSubtaskId) : null;
  if (!subtaskId) return null;
  if (!taskId) {
    throw ApiError.badRequest('Check the highlighted fields.', { subtask_id: 'Select the main task before choosing a subtask.' });
  }
  const row = await taskModel.findSubtaskRow(subtaskId);
  if (!row || Number(row.task_id) !== Number(taskId)) {
    throw ApiError.badRequest('Check the highlighted fields.', { subtask_id: 'That subtask does not belong to the selected task.' });
  }
  return row;
}

/** Reads subtask_id / subtaskId from a request payload. */
function subtaskIdFrom(payload = {}) {
  const raw = payload.subtask_id ?? payload.subtaskId;
  return raw && Number(raw) > 0 ? Number(raw) : null;
}

module.exports = { resolveSubtask, subtaskIdFrom };
