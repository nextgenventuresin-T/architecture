/** Shared option lists and label maps for the Procurement Management screens. */

export const PROCUREMENT_STATUSES = [
  'draft', 'requested', 'pending_approval', 'approved', 'source_confirmed', 'rejected',
  'ordered', 'partially_received', 'received', 'cancelled',
];

export const PROCUREMENT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'requested', label: 'Requested' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'source_confirmed', label: 'Confirmed by source' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'partially_received', label: 'Partially received' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const PROCUREMENT_STATUS_LABELS = Object.fromEntries(
  PROCUREMENT_STATUS_OPTIONS.map((s) => [s.value, s.label])
);

export const PROCUREMENT_STATUS_TONE = {
  draft: 'neutral',
  requested: 'brand',
  pending_approval: 'warning',
  approved: 'positive',
  source_confirmed: 'brand',
  rejected: 'danger',
  ordered: 'brand',
  partially_received: 'warning',
  received: 'positive',
  cancelled: 'danger',
};

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const PRIORITY_LABELS = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label]));

export const PRIORITY_TONE = {
  low: 'neutral',
  medium: 'brand',
  high: 'warning',
  urgent: 'danger',
};

/** Procurement flow type (destination-oriented). */
export const PROCUREMENT_KIND_LABELS = {
  project_site: 'Project / site',
  central_purchase: 'Central purchase',
  contractor_supply: 'Contractor supply',
  internal_transfer: 'Internal transfer',
};

export const PROCUREMENT_KIND_TONE = {
  project_site: 'neutral',
  central_purchase: 'brand',
  contractor_supply: 'positive',
  internal_transfer: 'warning',
};

export const PROCUREMENT_KIND_OPTIONS = [
  { value: 'project_site', label: 'Project / site' },
  { value: 'central_purchase', label: 'Central warehouse purchase' },
  { value: 'contractor_supply', label: 'Contractor supply' },
  { value: 'internal_transfer', label: 'Internal transfer' },
];

/**
 * Human-readable "who → whom" for a request, so the Admin UI never has to rely
 * on the raw kind (e.g. "Contractor supply", which could be misread as an
 * outside-supplier purchase). Derived from kind + source, backend value kept.
 */
export function procurementFlowLabel(request) {
  const kind = request?.kind;
  const sourceType = request?.sourceType || request?.source?.type;
  if (kind === 'internal_transfer') return 'Contractor → Contractor';
  if (kind === 'central_purchase') return 'Outside Supplier → Central Warehouse';
  if (kind === 'contractor_supply') {
    return sourceType === 'central_warehouse'
      ? 'Central Warehouse → Contractor'
      : 'Outside Supplier → Contractor';
  }
  return 'Project / site';
}

export const SOURCE_TYPE_OPTIONS = [
  { value: 'supplier', label: 'Outside / third-party supplier' },
  { value: 'central_warehouse', label: 'Central company warehouse' },
  { value: 'contractor', label: 'Another Contractor' },
  { value: 'site', label: 'Another site' },
];

/**
 * Mirrors procurementService.js's TRANSITIONS exactly, so the UI only ever
 * offers a move the API will actually accept. "ordered" and the receiving
 * statuses are reached through their own dedicated actions (Place order /
 * Receive material), never a bare status flip — see STATUS_ACTION_LABELS.
 */
export const STATUS_TRANSITIONS = {
  draft: ['requested', 'cancelled'],
  requested: ['pending_approval', 'draft', 'cancelled'],
  pending_approval: ['approved', 'rejected'],
  // approved -> source_confirmed is NOT a plain flip: it goes through the
  // dedicated "Confirm request" action, which only the source contractor has.
  approved: ['cancelled'],
  source_confirmed: ['cancelled'],
  rejected: [],
  ordered: ['cancelled'],
  partially_received: ['cancelled'],
  received: [],
  cancelled: [],
};

/** Button copy for each plain status transition, keyed "from>to". */
export const STATUS_ACTION_LABELS = {
  'draft>requested': 'Submit request',
  'draft>cancelled': 'Cancel request',
  'requested>pending_approval': 'Submit for approval',
  'requested>draft': 'Revert to draft',
  'requested>cancelled': 'Cancel request',
  'pending_approval>approved': 'Approve',
  'pending_approval>rejected': 'Reject',
  'approved>cancelled': 'Cancel request',
  'source_confirmed>cancelled': 'Cancel request',
  'ordered>cancelled': 'Cancel request',
  'partially_received>cancelled': 'Cancel request',
};

/** A request's fields can only be changed while it hasn't moved past this. */
export const EDITABLE_STATUSES = ['draft', 'requested'];
