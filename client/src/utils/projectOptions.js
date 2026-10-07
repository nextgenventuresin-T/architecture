/** Shared option lists and label maps for project screens. */

export const PROJECT_STATUSES = [
  { value: 'on-track', label: 'On track' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'on-hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
];

export const PROJECT_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'institutional', label: 'Institutional' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'renovation', label: 'Renovation' },
];

export const SAFETY_STATUSES = [
  { value: 'safe', label: 'Safe' },
  { value: 'caution', label: 'Caution' },
  { value: 'incident', label: 'Incident reported' },
];

export const SAFETY_TONE = { safe: 'positive', caution: 'warning', incident: 'danger' };
export const SEVERITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' };

export const REQUEST_TYPE_LABELS = {
  'material-request': 'Material request',
  'payment-request': 'Payment request',
  'purchase-request': 'Purchase request',
  'expense-claim': 'Expense claim',
  'contractor-request': 'Contractor request',
};

export const EXPENSE_CATEGORY_LABELS = {
  material: 'Materials',
  labour: 'Labour',
  contractor: 'Contractor',
  equipment: 'Equipment',
  overhead: 'Overheads',
  other: 'Other',
};

export const toOptions = (items, labelKey = 'name') =>
  items.map((item) => ({ value: String(item.id), label: item[labelKey] }));

const titleCase = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');
export const labelFor = (map, value) => map[value] ?? titleCase(value);
