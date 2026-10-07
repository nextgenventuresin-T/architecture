/** Shared option lists and label maps for the Approvals Management screens. */

/**
 * Normalised statuses. The API collapses each module's own vocabulary
 * (SUBMITTED / pending_approval / pending) down to these three so one filter
 * works across every module. The module's real status still travels alongside
 * as `sourceStatus` and is shown next to it, so nothing is hidden.
 */
export const APPROVAL_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export const APPROVAL_STATUS_LABELS = Object.fromEntries(
  APPROVAL_STATUS_OPTIONS.map((s) => [s.value, s.label])
);

export const APPROVAL_STATUS_TONE = {
  pending: 'warning',
  approved: 'positive',
  rejected: 'danger',
  other: 'neutral',
};

/**
 * Fallback module labels. The API sends the authoritative list through
 * /approvals/lookups (scoped to what the signed-in user may see), so these
 * are only used to label a row before lookups have loaded.
 */
export const MODULE_LABELS = {
  general: 'General',
  hr_labour: 'HR & Labour',
  procurement: 'Procurement',
  finance: 'Finance',
};

export const MODULE_TONE = {
  general: 'neutral',
  hr_labour: 'brand',
  procurement: 'brand',
  finance: 'brand',
};

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const PRIORITY_LABELS = Object.fromEntries(PRIORITY_OPTIONS.map((p) => [p.value, p.label]));

export const PRIORITY_TONE = {
  low: 'neutral',
  medium: 'brand',
  high: 'warning',
  urgent: 'danger',
};

/** History actions, as written by the server's audit trail. */
export const ACTION_LABELS = {
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  COMMENTED: 'Comment added',
};

export const ACTION_TONE = {
  SUBMITTED: 'brand',
  APPROVED: 'positive',
  REJECTED: 'danger',
  COMMENTED: 'neutral',
};

/**
 * Turns a module's own status into something readable without pretending it
 * is one of the normalised three: `pending_approval` -> "Pending approval",
 * `PARTIALLY_ASSIGNED` -> "Partially assigned".
 */
export function formatSourceStatus(status) {
  if (!status) return '—';
  const spaced = String(status).replace(/[_-]+/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Where a given approval lives in its own module, for the "open in module" link. */
export function sourceLinkFor(approval, basePath = '/admin') {
  if (!approval) return null;
  switch (approval.module) {
    case 'procurement':
      return `${basePath}/procurement/${approval.sourceId}`;
    case 'finance':
      return `${basePath}/finance/expenses/${approval.sourceId}`;
    case 'hr_labour':
      // HR labour requests are reviewed inside the HR dashboard's tabbed
      // workspace rather than on a page of their own, so this points at the
      // tab rather than at a per-request route that does not exist.
      return `${basePath}/hr`;
    default:
      // Interface 3's generic approval_requests have no standalone screen —
      // the approvals detail dialog is the only place they are shown.
      return null;
  }
}

export const INITIAL_APPROVAL_FILTERS = {
  search: '',
  status: 'pending',
  module: 'all',
  projectId: 'all',
  siteId: 'all',
  priority: 'all',
  dateFrom: '',
  dateTo: '',
  page: 1,
};
