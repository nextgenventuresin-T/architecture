'use strict';

const phaseBudgetModel = require('../models/phaseBudgetModel');

async function getPhases(projectId) {
  return phaseBudgetModel.getPhasesWithDetails(projectId);
}

async function updatePhases(projectId, phasesData) {
  return phaseBudgetModel.savePhases(projectId, phasesData);
}

module.exports = {
  getPhases,
  updatePhases,
  savePhases: updatePhases,
  getPhasesWithDetails: phaseBudgetModel.getPhasesWithDetails,
};
