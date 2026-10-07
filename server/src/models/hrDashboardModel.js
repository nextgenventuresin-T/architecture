'use strict';

const { pool } = require('../config/db');

/**
 * Aggregate queries backing the HR dashboard and the Site Workforce view.
 * "Workforce" is read from `labour_assignments` (who is currently posted
 * where), not from attendance — attendance answers "who showed up today",
 * assignment answers "who is on this site's roster".
 *
 * `contractorId` scopes every query to one contractor's own labour when
 * supplied — the service layer passes this for a CONTRACTOR caller.
 */

/** Org-wide (or one contractor's) headline counts for the HR dashboard. */
async function findSummary({ contractorId } = {}) {
  const scopeSql = contractorId ? 'AND a.contractor_id = ?' : '';
  const scopeParams = contractorId ? [contractorId] : [];

  const [[workforce]] = await pool.query(
    `SELECT
       COUNT(DISTINCT CASE WHEN a.labour_type = 'company' THEN a.employee_id END) AS company_count,
       COUNT(DISTINCT CASE WHEN a.labour_type = 'contractor' THEN a.contractor_worker_id END) AS contractor_count,
       COUNT(DISTINCT a.contractor_id) AS contractor_org_count,
       COUNT(DISTINCT a.site_id) AS site_count,
       COUNT(DISTINCT a.project_id) AS project_count
     FROM labour_assignments a
     WHERE a.status = 'active' ${scopeSql}`,
    scopeParams
  );

  const attScopeSql = contractorId ? 'AND contractor_id = ?' : '';
  const [[todayAttendance]] = await pool.query(
    `SELECT
       SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS present,
       SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) AS absent,
       SUM(CASE WHEN status = 'HALF_DAY' THEN 1 ELSE 0 END) AS half_day,
       SUM(CASE WHEN status = 'LEAVE' THEN 1 ELSE 0 END) AS on_leave,
       COUNT(*) AS total
     FROM attendance_records
     WHERE attendance_date = CURDATE() ${attScopeSql}`,
    contractorId ? [contractorId] : []
  );

  const reqScopeSql = contractorId ? 'AND contractor_id = ?' : '';
  const [[requests]] = await pool.query(
    `SELECT
       SUM(CASE WHEN status IN ('SUBMITTED','UNDER_REVIEW') THEN 1 ELSE 0 END) AS pending_review,
       SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved,
       SUM(CASE WHEN status = 'PARTIALLY_ASSIGNED' THEN 1 ELSE 0 END) AS partially_assigned,
       COUNT(*) AS total
     FROM labour_requests
     WHERE 1 = 1 ${reqScopeSql}`,
    contractorId ? [contractorId] : []
  );

  const leaveScopeJoin = contractorId
    ? '' // leave is company-employee only; a contractor scope has none
    : '';
  const [[leave]] = contractorId
    ? [[{ pending: 0 }]]
    : await pool.query(
        `SELECT SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending FROM leave_records`
      );

  return {
    companyLabourCount: Number(workforce.company_count || 0),
    contractorLabourCount: Number(workforce.contractor_count || 0),
    totalWorkforce: Number(workforce.company_count || 0) + Number(workforce.contractor_count || 0),
    contractorOrgCount: Number(workforce.contractor_org_count || 0),
    siteCount: Number(workforce.site_count || 0),
    projectCount: Number(workforce.project_count || 0),
    today: {
      present: Number(todayAttendance.present || 0),
      absent: Number(todayAttendance.absent || 0),
      halfDay: Number(todayAttendance.half_day || 0),
      onLeave: Number(todayAttendance.on_leave || 0),
      total: Number(todayAttendance.total || 0),
    },
    requests: {
      pendingReview: Number(requests.pending_review || 0),
      approved: Number(requests.approved || 0),
      partiallyAssigned: Number(requests.partially_assigned || 0),
      total: Number(requests.total || 0),
    },
    pendingLeave: Number(leave.pending || 0),
  };
}

/** Per-contractor worker/assignment counts, for the dashboard breakdown. Not
 * scoped by contractorId — this view is Admin/HR only (each contractor sees
 * only their own row through findSummary, not this cross-contractor list). */
async function findContractorBreakdown() {
  const [rows] = await pool.query(
    `SELECT
       c.id AS contractor_id, c.name AS contractor_name,
       COALESCE(w.worker_total, 0) AS worker_total,
       COALESCE(a.active_total, 0) AS active_assignment_total,
       COALESCE(s.site_total, 0) AS site_total
     FROM contractors c
     LEFT JOIN (
       SELECT contractor_id, COUNT(*) AS worker_total
       FROM contractor_workers WHERE status = 'active' GROUP BY contractor_id
     ) w ON w.contractor_id = c.id
     LEFT JOIN (
       SELECT contractor_id, COUNT(*) AS active_total
       FROM labour_assignments WHERE status = 'active' GROUP BY contractor_id
     ) a ON a.contractor_id = c.id
     LEFT JOIN (
       SELECT contractor_id, COUNT(DISTINCT site_id) AS site_total
       FROM labour_assignments WHERE status = 'active' AND site_id IS NOT NULL GROUP BY contractor_id
     ) s ON s.contractor_id = c.id
     WHERE COALESCE(w.worker_total, 0) > 0 OR COALESCE(a.active_total, 0) > 0
     ORDER BY c.name`
  );
  return rows;
}

/** Full workforce breakdown for one site: total, company, contractor,
 * contractor-wise counts and the worker list. */
async function findSiteWorkforce(siteId) {
  const [[totals]] = await pool.query(
    `SELECT
       COUNT(DISTINCT CASE WHEN labour_type = 'company' THEN employee_id END) AS company_count,
       COUNT(DISTINCT CASE WHEN labour_type = 'contractor' THEN contractor_worker_id END) AS contractor_count
     FROM labour_assignments
     WHERE site_id = ? AND status = 'active'`,
    [siteId]
  );

  const [contractorBreakdown] = await pool.query(
    `SELECT a.contractor_id, c.name AS contractor_name, COUNT(DISTINCT a.contractor_worker_id) AS worker_count
     FROM labour_assignments a
     JOIN contractors c ON c.id = a.contractor_id
     WHERE a.site_id = ? AND a.status = 'active' AND a.labour_type = 'contractor'
     GROUP BY a.contractor_id, c.name
     ORDER BY c.name`,
    [siteId]
  );

  const [workers] = await pool.query(
    `SELECT a.id AS assignment_id, a.labour_type, a.start_date, a.end_date,
            e.id AS employee_id, e.full_name AS employee_name, e.designation AS employee_designation,
            w.id AS worker_id, w.full_name AS worker_name, w.skill_category AS worker_skill,
            c.id AS contractor_id, c.name AS contractor_name
     FROM labour_assignments a
     LEFT JOIN employees e ON e.id = a.employee_id
     LEFT JOIN contractor_workers w ON w.id = a.contractor_worker_id
     LEFT JOIN contractors c ON c.id = a.contractor_id
     WHERE a.site_id = ? AND a.status = 'active'
     ORDER BY a.labour_type, COALESCE(e.full_name, w.full_name)`,
    [siteId]
  );

  return {
    companyCount: Number(totals.company_count || 0),
    contractorCount: Number(totals.contractor_count || 0),
    totalWorkforce: Number(totals.company_count || 0) + Number(totals.contractor_count || 0),
    contractorBreakdown: contractorBreakdown.map((row) => ({
      contractorId: row.contractor_id,
      contractorName: row.contractor_name,
      workerCount: Number(row.worker_count || 0),
    })),
    workers,
  };
}

module.exports = { findSummary, findContractorBreakdown, findSiteWorkforce };
