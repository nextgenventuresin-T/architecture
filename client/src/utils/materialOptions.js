/** Shared option lists and label maps for the Materials Management screens. */

/**
 * Interface 6's canonical categories. The API merges these with any category
 * already present in the catalogue (Masonry, Finishing, Concrete and so on
 * from the Interface 3 seed) so existing materials stay filterable.
 */
export const MATERIAL_CATEGORIES = [
  'Cement',
  'Steel/Sariya',
  'Stone/Patthar',
  'Sand',
  'Bricks',
  'Aggregate',
  'Tiles',
  'Paint',
  'Other',
];

export const MATERIAL_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'discontinued', label: 'Discontinued' },
];

export const STOCK_STATUSES = [
  { value: 'all', label: 'All stock levels' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'healthy', label: 'In stock' },
];

/** Common units offered on the form; the API also returns units already in use. */
export const MATERIAL_UNITS = [
  'bags', 'tonnes', 'kg', 'cu.m', 'cu.ft', 'sq.m', 'sq.ft',
  'thousand', 'nos', 'sets', 'litres', 'rolls',
];

export const MATERIAL_STATUS_TONE = {
  active: 'positive',
  inactive: 'neutral',
  discontinued: 'danger',
};

export const STOCK_STATUS_TONE = {
  healthy: 'positive',
  low: 'warning',
  out: 'danger',
};

export const STOCK_STATUS_LABELS = {
  healthy: 'In stock',
  low: 'Low stock',
  out: 'Out of stock',
};

export const MATERIAL_STATUS_LABELS = Object.fromEntries(
  MATERIAL_STATUSES.map((s) => [s.value, s.label])
);
