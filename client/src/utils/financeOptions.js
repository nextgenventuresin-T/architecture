/** Shared option lists and label maps for the Finance Management screens. */

export const EXPENSE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const EXPENSE_STATUS_LABELS = Object.fromEntries(
  EXPENSE_STATUS_OPTIONS.map((s) => [s.value, s.label])
);

export const EXPENSE_STATUS_TONE = {
  pending: 'warning',
  approved: 'brand',
  paid: 'positive',
  rejected: 'danger',
  cancelled: 'neutral',
};

export const CONTRACTOR_EXPENSE_CATEGORY_OPTIONS = [
  { value: 'Material Consumption', label: 'Material Consumption' },
  { value: 'Local Conveyance', label: 'Local Conveyance' },
  { value: 'Meal / Food', label: 'Meal / Food' },
  { value: 'Vehicle Running', label: 'Vehicle Running' },
  { value: 'Accommodation', label: 'Accommodation' },
  { value: 'Repairs & Maintenance', label: 'Repairs & Maintenance' },
  { value: 'Site Consumables', label: 'Site Consumables' },
  { value: 'Site Expense', label: 'Site Expense' },
  { value: 'Loading', label: 'Loading' },
  { value: 'Unloading', label: 'Unloading' },
  { value: 'Freight', label: 'Freight' },
  { value: 'Advance Wages', label: 'Advance Wages' },
  { value: 'Printing & Stationery', label: 'Printing & Stationery' },
  { value: 'Invoice Payment', label: 'Invoice Payment' },
  { value: 'Travelling', label: 'Travelling' },
  { value: 'Room Rent', label: 'Room Rent' },
  { value: 'Head Office', label: 'Head Office' },
  { value: 'Site Visit', label: 'Site Visit' },
  { value: 'Safety Items', label: 'Safety Items' },
  { value: 'Labour Room Rent', label: 'Labour Room Rent' },
  { value: 'Notary & Stamp Paper', label: 'Notary & Stamp Paper' },
  { value: 'BOQ Material', label: 'BOQ Material' },
  { value: 'Consumable Material', label: 'Consumable Material' },
  { value: 'Labour Expense', label: 'Labour Expense' },
  { value: 'Labour Conveyance', label: 'Labour Conveyance' },
];

export const EXPENSE_CATEGORY_OPTIONS = [
  ...CONTRACTOR_EXPENSE_CATEGORY_OPTIONS,
  { value: 'material', label: 'Material' },
  { value: 'labour', label: 'Labour' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'transport', label: 'Transport' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'site', label: 'Site expense' },
  { value: 'office', label: 'Office' },
  { value: 'overhead', label: 'Overhead' },
  { value: 'other', label: 'Other' },
];

export const EXPENSE_CATEGORY_LABELS = Object.fromEntries(
  EXPENSE_CATEGORY_OPTIONS.map((c) => [c.value, c.label])
);

/** Turns a stored value with no entry above into readable text rather than a raw slug. */
export const categoryLabel = (value) =>
  EXPENSE_CATEGORY_LABELS[value] ?? (value ? value.charAt(0).toUpperCase() + value.slice(1) : '—');

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_METHOD_LABELS = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((m) => [m.value, m.label])
);

export const PAYMENT_TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'contractor', label: 'Contractor payment' },
  { value: 'procurement', label: 'Procurement payment' },
];

export const PAYMENT_TYPE_LABELS = Object.fromEntries(
  PAYMENT_TYPE_OPTIONS.map((t) => [t.value, t.label])
);

export const PAYMENT_TYPE_TONE = {
  expense: 'brand',
  contractor: 'warning',
  procurement: 'positive',
};

/**
 * Mirrors financeService.js's STATUS_TRANSITIONS exactly, so the UI only ever
 * offers a move the API will accept.
 */
export const STATUS_TRANSITIONS = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['paid', 'rejected', 'cancelled'],
  paid: [],
  rejected: [],
  cancelled: [],
};

export const STATUS_ACTION_LABELS = {
  'pending>approved': 'Approve',
  'pending>rejected': 'Reject',
  'pending>cancelled': 'Cancel',
  'approved>paid': 'Mark as paid',
  'approved>rejected': 'Reject',
  'approved>cancelled': 'Cancel',
};

/** An expense's fields can only be changed while it has not been settled. */
export const EDITABLE_STATUSES = ['pending', 'approved', 'rejected'];
