'use strict';

/**
 * Units a project / site / subtask area measurement can be recorded in -
 * keep in sync with client/src/utils/areaUnits.js.
 */
const AREA_UNITS = Object.freeze({
  ft: 'Feet',
  m: 'Metres',
  sqft: 'Square Feet (sq. ft.)',
  sqm: 'Square Metres (sq. m.)',
  rft: 'Running Feet (rft)',
  rmt: 'Running Metres (rmt)',
});
const AREA_UNIT_VALUES = Object.freeze(Object.keys(AREA_UNITS));

module.exports = { AREA_UNITS, AREA_UNIT_VALUES };

/**
 * Request-body rules for an area measurement: a non-negative number (or blank /
 * null to clear it) and, with a value, one of the four units.
 */
function areaRules(body) {
  return [
    body('area_value').optional({ nullable: true, checkFalsy: true })
      .isFloat({ min: 0, max: 999999999999 }).withMessage('Enter the area as a number (0 or more).').toFloat(),
    body('area_unit').optional({ nullable: true, checkFalsy: true })
      .isIn(AREA_UNIT_VALUES).withMessage('Choose a valid unit for the area.'),
    body('area_unit').custom((unit, { req }) => {
      const v = req.body.area_value;
      if (v !== undefined && v !== null && v !== '' && !unit) throw new Error('Choose the unit of the area.');
      return true;
    }),
  ];
}

/**
 * Normalises area fields on a write payload in place: blank value clears both
 * columns, a unit is stored only together with a value. Untouched when absent.
 */
function normaliseArea(payload) {
  if (!payload || (payload.area_value === undefined && payload.area_unit === undefined)) return payload;
  const raw = payload.area_value;
  if (raw === undefined) {
    // Only the unit was sent: keep it as given (validated by areaRules).
    if (payload.area_unit === '') payload.area_unit = null;
    return payload;
  }
  if (raw === null || raw === '') {
    payload.area_value = null;
    payload.area_unit = null;
  } else {
    payload.area_value = Number(Number(raw).toFixed(2));
    payload.area_unit = AREA_UNIT_VALUES.includes(payload.area_unit) ? payload.area_unit : null;
  }
  return payload;
}

module.exports.areaRules = areaRules;
module.exports.normaliseArea = normaliseArea;
