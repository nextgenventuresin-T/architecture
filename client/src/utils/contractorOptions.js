/** Shared option lists and label maps for the Contractor Management screens. */

export const CONTRACTOR_TYPES = [
  { value: 'civil', label: 'Civil' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'finishing', label: 'Finishing' },
  { value: 'labour-supply', label: 'Labour supply' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'specialized', label: 'Specialized' },
  { value: 'other', label: 'Other' },
];

export const CONTRACTOR_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'blacklisted', label: 'Blacklisted' },
];

export const CONTRACTOR_STATUS_TONE = {
  active: 'positive',
  inactive: 'neutral',
  blacklisted: 'danger',
};

export const CONTRACTOR_TYPE_LABELS = Object.fromEntries(CONTRACTOR_TYPES.map((t) => [t.value, t.label]));
