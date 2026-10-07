'use strict';

const { ROLES } = require('./roles');

/**
 * The approval-type registry for Interface 12.
 *
 * Interface 12 does not own any approval workflow. It is a central view and
 * processing layer over workflows that already exist in other modules, and
 * this file is the one place that describes them: where an approvable item
 * lives, which of its statuses count as pending/approved/rejected, who may
 * decide it, and who may see it.
 *
 * Adding a future approval type is one entry here plus one SELECT branch in
 * approvalModel.buildSourceSelect — no new table, no new decision endpoint,
 * and no change to the frontend.
 *
 * ---------------------------------------------------------------------------
 * AUTHORITY MODEL
 * ---------------------------------------------------------------------------
 * A user may decide an item in a module when EITHER
 *   (a) their role is listed in that module's `decideRoles`, or
 *   (b) they hold that module's own `<module>:approve` permission.
 *
 * (a) is the brief's role matrix: HR processes labour approvals, Procurement
 * processes procurement approvals, Finance processes finance approvals, Admin
 * processes everything. (b) keeps the existing permission matrix meaningful —
 * FINANCE is seeded with `procurement:approve` by schema_user_access.sql and
 * has always been able to approve purchase requests, so removing that here
 * would be a regression in a module this interface is not supposed to redesign.
 *
 * CONTRACTOR and EMPLOYEE appear in no `decideRoles` list and are seeded with
 * no `*:approve` permission, so neither can ever decide anything. On top of
 * that, `approvalService` separately refuses to let anybody decide a request
 * they raised themselves, whatever their role.
 *
 * ---------------------------------------------------------------------------
 * VISIBILITY MODEL
 * ---------------------------------------------------------------------------
 *   'all'  — every item in the module (subject to the caller's project/site
 *            scope, which authorize.js resolves per request)
 *   'own'  — only items the caller raised, identified server-side from their
 *            user id / linked contractor record, never from a query parameter
 *   'none' — the module is not queried at all for this caller
 */

const ACTIONS = Object.freeze({
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

/** Normalised statuses the central layer reasons about, whatever the source calls them. */
const NORMALISED = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  // Cancelled/withdrawn items: kept queryable under the "all" filter, but
  // never counted as awaiting a decision.
  OTHER: 'other',
});

const APPROVAL_MODULES = Object.freeze({
  general: {
    key: 'general',
    label: 'General',
    description: 'Requests raised directly against a project or site.',
    // Interface 3's approval_requests table — the ERP's original generic queue.
    sourceTable: 'approval_requests',
    decideRoles: [ROLES.ADMIN, ROLES.FINANCE],
    approvePermission: { module: 'approvals', action: 'approve' },
    viewAllRoles: [ROLES.ADMIN, ROLES.FINANCE],
    // approval_requests.requested_by is a free-text name, not a user id, so
    // there is no reliable way to say "this row is yours". Contractors and
    // employees therefore see nothing here rather than something wrong.
    ownable: false,
  },

  hr_labour: {
    key: 'hr_labour',
    label: 'HR & Labour',
    description: 'Labour requests raised by contractors for a site.',
    sourceTable: 'labour_requests',
    decideRoles: [ROLES.ADMIN, ROLES.HR],
    approvePermission: { module: 'hr', action: 'approve' },
    viewAllRoles: [ROLES.ADMIN, ROLES.HR],
    ownable: true,
    // A contractor owns a labour request through the contractor record their
    // account is linked to; an employee through having raised it.
    ownedByContractor: true,
    ownerColumn: 'requested_by',
  },

  procurement: {
    key: 'procurement',
    label: 'Procurement',
    description: 'Purchase requests and purchase orders for materials.',
    sourceTable: 'procurement_requests',
    decideRoles: [ROLES.ADMIN, ROLES.PROCUREMENT],
    approvePermission: { module: 'procurement', action: 'approve' },
    // WAREHOUSE is listed here but, out of the box, still cannot open the
    // approvals screen: schema_user_access.sql never granted it
    // `approvals:view`, and this interface does not grant it either — the
    // brief's role matrix does not mention Warehouse, and widening another
    // module's permissions unasked is not this interface's job. The entry
    // means "if an admin does grant Warehouse `approvals:view` from the
    // existing Users & Access matrix, procurement is what they should see",
    // read-only, with no code change needed.
    viewAllRoles: [ROLES.ADMIN, ROLES.PROCUREMENT, ROLES.FINANCE, ROLES.WAREHOUSE],
    ownable: true,
    ownerColumn: 'requested_by',
  },

  finance: {
    key: 'finance',
    label: 'Finance',
    description: 'Expense claims awaiting sign-off.',
    sourceTable: 'expenses',
    decideRoles: [ROLES.ADMIN, ROLES.FINANCE],
    approvePermission: { module: 'finance', action: 'approve' },
    viewAllRoles: [ROLES.ADMIN, ROLES.FINANCE],
    ownable: true,
    ownerColumn: 'created_by',
  },
});

const MODULE_KEYS = Object.freeze(Object.keys(APPROVAL_MODULES));

const isValidModule = (key) => Object.prototype.hasOwnProperty.call(APPROVAL_MODULES, key);

const getModule = (key) => (isValidModule(key) ? APPROVAL_MODULES[key] : null);

/**
 * How much of `moduleKey` this caller may see: 'all', 'own' or 'none'.
 * Resolved from the role alone — never from anything the client sent.
 */
function visibilityFor(role, moduleKey) {
  const module = getModule(moduleKey);
  if (!module) return 'none';
  if (role === ROLES.ADMIN) return 'all';
  if (module.viewAllRoles.includes(role)) return 'all';
  if (module.ownable && (role === ROLES.CONTRACTOR || role === ROLES.EMPLOYEE)) return 'own';
  return 'none';
}

/** Modules this caller may see at all, with the visibility that applies to each. */
function visibleModules(role) {
  return MODULE_KEYS
    .map((key) => ({ key, visibility: visibilityFor(role, key) }))
    .filter((entry) => entry.visibility !== 'none');
}

/**
 * Whether this caller may approve/reject in `moduleKey`.
 *
 * `permissions` is the Set that authorize.js resolves from the database for
 * this request, so a permission revoked a second ago is already gone.
 */
function canDecideModule(role, permissions, moduleKey) {
  const module = getModule(moduleKey);
  if (!module) return false;
  if (role === ROLES.ADMIN) return true;
  if (module.decideRoles.includes(role)) return true;
  const { module: permModule, action } = module.approvePermission;
  return Boolean(permissions?.has(`${permModule}:${action}`));
}

/** Every module key this caller may decide in — drives "My pending approvals". */
function decidableModules(role, permissions) {
  return MODULE_KEYS.filter((key) => canDecideModule(role, permissions, key));
}

module.exports = {
  ACTIONS,
  NORMALISED,
  APPROVAL_MODULES,
  MODULE_KEYS,
  isValidModule,
  getModule,
  visibilityFor,
  visibleModules,
  canDecideModule,
  decidableModules,
};
