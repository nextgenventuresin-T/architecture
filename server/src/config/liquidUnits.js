'use strict';

/**
 * Bucket / liquid materials: their quantity is counted in containers (bucket, drum,
 * can, tin ...) or they are liquids (paint, primer, chemicals ...), so a procurement
 * can also say how many LITRES that is, and the litres sent and used are captured.
 * Keep in sync with client/src/utils/liquidUnits.js.
 */
const CONTAINER_UNIT = /\b(buckets?|drums?|cans?|tins?|barrels?|pails?|jars?|jerry ?cans?|containers?|carboys?|bottles?|cartons?)\b/i;
const LITRE_UNIT = /^\s*(l|lt|ltr|ltrs|litre|litres|liter|liters)\.?\s*$/i;
const LIQUID_WORD = /\b(liquid|paint|primer|emulsion|enamel|distemper|varnish|lacquer|polish|thinner|solvent|chemical|admixture|plasticiser|plasticizer|waterproof\w*|curing|sealant|adhesive|resin|epoxy|bitumen|oil|diesel|petrol|acid|putty)\b/i;

const isLitreUnit = (unit) => LITRE_UNIT.test(String(unit || ''));

/** True when litres should be offered for this material / unit. */
function isLiquidMaterial({ unit, category, name } = {}) {
  if (isLitreUnit(unit)) return true;
  if (CONTAINER_UNIT.test(String(unit || ''))) return true;
  return LIQUID_WORD.test(`${category || ''} ${name || ''}`);
}

const round3 = (n) => Number(Number(n).toFixed(3));

/** A litres value from a request body: null when blank, a non-negative number otherwise. */
function litresOrNull(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    const ApiError = require('../utils/ApiError');
    throw ApiError.badRequest('Check the highlighted fields.', { [field]: 'Enter the litres as a number (0 or more).' });
  }
  return round3(n);
}

/**
 * Litres for a quantity: the unit itself when it is litres, else quantity x litres
 * per unit when that is known, else null (not tracked in litres).
 */
function litresFor(quantity, { unit, litresPerUnit } = {}) {
  const q = Number(quantity);
  if (!Number.isFinite(q)) return null;
  if (isLitreUnit(unit)) return round3(q);
  if (litresPerUnit != null && Number(litresPerUnit) > 0) return round3(q * Number(litresPerUnit));
  return null;
}

module.exports = { isLiquidMaterial, isLitreUnit, litresOrNull, litresFor };
