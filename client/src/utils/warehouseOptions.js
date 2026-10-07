/** Shared option lists and label maps for the Warehouse / Inventory screens. */

export const WAREHOUSE_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export const WAREHOUSE_STATUS_LABELS = Object.fromEntries(
  WAREHOUSE_STATUS_OPTIONS.map((s) => [s.value, s.label])
);

export const WAREHOUSE_STATUS_TONE = {
  active: 'positive',
  inactive: 'neutral',
};

/** Matches the CASE expression in warehouseModel.js so badge and filter agree. */
export const STOCK_STATUS_OPTIONS = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
];

export const STOCK_STATUS_LABELS = Object.fromEntries(
  STOCK_STATUS_OPTIONS.map((s) => [s.value, s.label])
);

export const STOCK_STATUS_TONE = {
  in_stock: 'positive',
  low: 'warning',
  out: 'danger',
};

export const TRANSACTION_TYPE_OPTIONS = [
  { value: 'receipt', label: 'Receipt' },
  { value: 'issue', label: 'Issue' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'adjustment', label: 'Adjustment' },
];

export const TRANSACTION_TYPE_LABELS = Object.fromEntries(
  TRANSACTION_TYPE_OPTIONS.map((t) => [t.value, t.label])
);

export const TRANSACTION_TYPE_TONE = {
  receipt: 'positive',
  issue: 'brand',
  transfer: 'warning',
  adjustment: 'neutral',
};

export const ADJUSTMENT_TYPE_OPTIONS = [
  { value: 'increase', label: 'Increase' },
  { value: 'decrease', label: 'Decrease' },
];

/**
 * Sign shown against a movement in the history table. A transfer moves stock
 * without changing the overall total, so it gets a neutral arrow rather than a
 * plus or minus that would misrepresent it.
 */
export function transactionSign(transaction) {
  if (transaction.type === 'receipt') return '+';
  if (transaction.type === 'issue') return '−';
  if (transaction.type === 'adjustment') return transaction.adjustmentType === 'decrease' ? '−' : '+';
  return '→';
}
