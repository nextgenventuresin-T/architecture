'use strict';

const ApiError = require('../utils/ApiError');
const hrDashboardModel = require('../models/hrDashboardModel');
const siteModel = require('../models/siteModel');

/** Dashboard summary, scoped to the caller's own contractor when they are one. */
async function getSummary(hrScope) {
  const contractorId = hrScope.role === 'contractor' ? hrScope.contractorId : null;
  const summary = await hrDashboardModel.findSummary({ contractorId });

  // Cross-contractor breakdown is an Admin/HR oversight view. A contractor
  // sees only their own row (above); any other role (e.g. EMPLOYEE) gets
  // the org-wide totals but not a per-contractor breakdown, which is HR
  // business information, not something every login needs to see.
  if (hrScope.role !== 'admin' && hrScope.role !== 'hr') return summary;

  const contractorBreakdown = await hrDashboardModel.findContractorBreakdown();
  return {
    ...summary,
    contractorBreakdown: contractorBreakdown.map((row) => ({
      contractorId: row.contractor_id,
      contractorName: row.contractor_name,
      workerTotal: Number(row.worker_total || 0),
      activeAssignmentTotal: Number(row.active_assignment_total || 0),
      siteTotal: Number(row.site_total || 0),
    })),
  };
}

/**
 * Total/company/contractor/contractor-wise workforce for one site.
 * A CONTRACTOR may only view this for a site they are themselves assigned
 * to — otherwise it 404s rather than confirming the site exists to someone
 * with no relationship to it.
 */
async function getSiteWorkforce(siteId, hrScope) {
  const site = await siteModel.findById(siteId);
  if (!site) throw ApiError.notFound('That site does not exist.');

  if (hrScope.role === 'contractor' && site.contractor_id !== hrScope.contractorId) {
    throw ApiError.notFound('That site does not exist.');
  }

  const workforce = await hrDashboardModel.findSiteWorkforce(siteId);
  return {
    site: { id: site.id, name: site.name, projectId: site.project_id, projectName: site.project_name },
    ...workforce,
  };
}

module.exports = { getSummary, getSiteWorkforce };
