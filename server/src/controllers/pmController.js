'use strict';

const pmService = require('../services/pmService');
const pmWorkService = require('../services/pmWorkService');

const wrap = (fn) => async (req, res, next) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (err) {
    next(err);
  }
};

const getScope = wrap((req) => pmWorkService.getScope(req.hrScope));
const listWorkers = wrap((req) => pmWorkService.listWorkers(req.query, req.hrScope));
const listExpenses = wrap((req) => pmWorkService.listExpenses(req.query, req.hrScope));
const listAttendance = wrap((req) => pmWorkService.attendance.list(req.query, req.hrScope));
const markAttendance = wrap((req) => pmWorkService.attendance.mark({ ...req.body, labourType: 'contractor' }, req.hrScope, req.user.id));
const updateAttendance = wrap((req) => pmWorkService.attendance.update(req.params.id, req.body, req.hrScope));

async function getDashboard(req, res, next) {
  try {
    const data = await pmService.getDashboard(req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getProjects(req, res, next) {
  try {
    const data = await pmService.getProjects(req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getContractors(req, res, next) {
  try {
    const data = await pmService.getContractors(req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getWorkUpdates(req, res, next) {
  try {
    const data = await pmService.getWorkUpdates(req.query, req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getProcurement(req, res, next) {
  try {
    const data = await pmService.getProcurement(req.query, req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

async function getSiteWarehouse(req, res, next) {
  try {
    const data = await pmService.getSiteWarehouse(req.query, req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getScope, listWorkers, listExpenses, listAttendance, markAttendance, updateAttendance,
  getDashboard,
  getProjects,
  getContractors,
  getWorkUpdates,
  getProcurement,
  getSiteWarehouse,
};
