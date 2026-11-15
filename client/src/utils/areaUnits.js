/**
 * Units an area measurement of a project / site / subtask can be entered in -
 * keep in sync with AREA_UNITS in server/src/config/areaUnits.js.
 */
export const AREA_UNIT_OPTIONS = [
  { value: 'ft', label: 'Feet', short: 'ft' },
  { value: 'm', label: 'Metres', short: 'm' },
  { value: 'sqft', label: 'Square Feet (sq. ft.)', short: 'sq. ft.' },
  { value: 'sqm', label: 'Square Metres (sq. m.)', short: 'sq. m.' },
  { value: 'rft', label: 'Running Feet (rft)', short: 'rft' },
  { value: 'rmt', label: 'Running Metres (rmt)', short: 'rmt' },
];

export const DEFAULT_AREA_UNIT = 'sqft';

/** "1,250 sq. ft." for an { value, unit } area, or '—' when none is recorded. */
export function formatArea(area) {
  if (!area || area.value === null || area.value === undefined || area.value === '') return '—';
  const unit = AREA_UNIT_OPTIONS.find((u) => u.value === area.unit);
  const n = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(area.value));
  return unit ? `${n} ${unit.short}` : n;
}
