/** Site area types - mirror AREA_TYPES in server/src/services/areaService.js. */
export const AREA_TYPE_OPTIONS = [
  { value: 'floor', label: 'Floor' },
  { value: 'room', label: 'Room' },
  { value: 'area', label: 'Area' },
  { value: 'zone', label: 'Zone' },
  { value: 'block', label: 'Block' },
  { value: 'wing', label: 'Wing' },
  { value: 'unit', label: 'Unit / Flat' },
];

export const AREA_TYPE_LABELS = Object.fromEntries(AREA_TYPE_OPTIONS.map((o) => [o.value, o.label]));

/**
 * Areas usable for a task / request on `siteId`: project-wide areas plus that site's
 * own. Returns { value, label } options, rooms listed under their floor.
 */
export function areaOptionsFor(areas = [], siteId = null) {
  return areas
    .filter((a) => !siteId || !a.siteId || String(a.siteId) === String(siteId))
    .map((a) => ({ value: String(a.id), label: a.label + (a.areaType ? ` · ${AREA_TYPE_LABELS[a.areaType] ?? a.areaType}` : '') }));
}
