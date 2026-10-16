'use strict';

/**
 * Which cost bucket (Material / Labour / Machines & Tools / Miscellaneous) an
 * expense category belongs to. Every rollup - Project Summary, Budget vs Actual,
 * Profitability, task utilization and drill-downs - reads these lists, so an
 * expense is always counted in exactly ONE bucket.
 *
 * Transport is allocated to what was transported:
 *   Material Transport -> Material     (freight on material deliveries)
 *   Machine Transport  -> Machines     (freight on machine / tool shipments)
 *   Labour Transport   -> Labour       (moving workers to / between sites)
 */
const TRANSPORT_CATEGORIES = Object.freeze({
  material: 'Material Transport',
  machine: 'Machine Transport',
  labour: 'Labour Transport',
});

const MATERIAL_EXPENSE_CATEGORIES = Object.freeze([TRANSPORT_CATEGORIES.material]);

const LABOUR_EXPENSE_CATEGORIES = Object.freeze([
  'Labour Expense', 'Advance Wages', 'Labour Room Rent', 'Labour Conveyance', TRANSPORT_CATEGORIES.labour,
]);

const MACHINE_EXPENSE_CATEGORIES = Object.freeze([
  'Machine / Tool', 'Equipment Rental', 'Tools', 'Machinery', 'Tools & Equipment', TRANSPORT_CATEGORIES.machine,
]);

const MISC_EXPENSE_CATEGORIES = Object.freeze(['Miscellaneous', 'Misc', 'Operational Misc']);

/** Everything that is NOT miscellaneous (consumption is material, measured separately). */
const NON_MISC_CATEGORIES = Object.freeze([
  'Material Consumption', ...MATERIAL_EXPENSE_CATEGORIES, ...LABOUR_EXPENSE_CATEGORIES, ...MACHINE_EXPENSE_CATEGORIES,
]);

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
/** SQL IN-list body for a constant category list, e.g. `'A', 'B'`. */
const sqlList = (list) => list.map(quote).join(', ');

/** Transport category for a shipment, by what it carries. */
function transportCategoryFor(itemType) {
  if (itemType === 'tool' || itemType === 'machine') return TRANSPORT_CATEGORIES.machine;
  if (itemType === 'labour') return TRANSPORT_CATEGORIES.labour;
  return TRANSPORT_CATEGORIES.material;
}

/** 'material' | 'labour' | 'machine' | 'misc' for one expense category. */
function bucketForCategory(category) {
  if (category === 'Material Consumption' || MATERIAL_EXPENSE_CATEGORIES.includes(category)) return 'material';
  if (LABOUR_EXPENSE_CATEGORIES.includes(category)) return 'labour';
  if (MACHINE_EXPENSE_CATEGORIES.includes(category)) return 'machine';
  return 'misc';
}

module.exports = {
  TRANSPORT_CATEGORIES,
  ALL_TRANSPORT_CATEGORIES: Object.freeze(Object.values(TRANSPORT_CATEGORIES)),
  MATERIAL_EXPENSE_CATEGORIES,
  LABOUR_EXPENSE_CATEGORIES,
  MACHINE_EXPENSE_CATEGORIES,
  MISC_EXPENSE_CATEGORIES,
  NON_MISC_CATEGORIES,
  sqlList,
  transportCategoryFor,
  bucketForCategory,
};
