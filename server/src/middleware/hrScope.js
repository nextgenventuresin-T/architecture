'use strict';

const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/roles');
const contractorModel = require('../models/contractorModel');
const employeeModel = require('../models/employeeModel');
const pmScopeService = require('../services/pmScopeService');

/**
 * HR & Labour Management (Interface 11) needs one more kind of scoping than
 * `authorize.js` already provides: not "which projects/sites can this user
 * see" but "which contractor/employee record IS this user". A CONTRACTOR
 * must only ever touch their own workers, requests and attendance — never
 * whatever contractor_id happens to arrive in a request body or query
 * string, since that would let Contractor A read or edit Contractor B's
 * data just by changing an id.
 *
 * This middleware resolves that identity once per request, from the
 * database, and attaches it as `req.hrScope`. Services then filter every
 * query through it rather than trusting client-supplied ids.
 */
async function attachHrScope(req, res, next) {
  try {
    if (!req.user) return next(ApiError.unauthorized());

    const scope = {
      role: req.user.role,
      isAdmin: req.user.role === ROLES.ADMIN,
      isHr: req.user.role === ROLES.HR,
      // Non-null only for a signed-in CONTRACTOR whose account is linked to
      // a contractor record. Every contractor-owned-data query is filtered
      // by this, never by a client-supplied contractor id.
      contractorId: null,
      // Non-null only for a signed-in EMPLOYEE whose account is linked to an
      // employee record.
      employeeId: null,
      // Non-null arrays only for a PROJECT MANAGER: the projects/sites they are
      // assigned to (deny-by-default - an empty list means no access).
      pmProjectIds: null,
      pmSiteIds: null,
    };

    if (req.user.role === ROLES.CONTRACTOR) {
      const contractor = await contractorModel.findByUserId(req.user.id);
      if (!contractor) {
        return next(ApiError.forbidden('This account is not linked to a contractor profile.'));
      }
      scope.contractorId = contractor.id;
      scope.contractorName = contractor.name;
    }

    if (req.user.role === ROLES.EMPLOYEE) {
      const employee = await employeeModel.findByUserId(req.user.id);
      // An EMPLOYEE account with no linked employee row can still view HR
      // dashboards/read-only content; anything requiring "my own record"
      // (leave, attendance) 403s at the point it is actually needed.
      if (employee) scope.employeeId = employee.id;
    }

    if (req.user.role === ROLES.PROJECT_MANAGER) {
      const pm = await pmScopeService.resolve(req.user.id);
      scope.pmProjectIds = pm.projectIds;
      scope.pmSiteIds = pm.siteIds;
      scope.employeeId = pm.employeeId;
    }

    req.hrScope = scope;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { attachHrScope };
