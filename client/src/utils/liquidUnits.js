/**
 * Bucket / liquid materials - counted in buckets, drums, cans ... or liquids such as
 * paint, primer and chemicals. For these a procurement can also say how many litres
 * it is, and the litres sent and used are captured.
 * Keep in sync with server/src/config/liquidUnits.js.
 */
const CONTAINER_UNIT = /\b(buckets?|drums?|cans?|tins?|barrels?|pails?|jars?|jerry ?cans?|containers?|carboys?|bottles?|cartons?)\b/i;
const LITRE_UNIT = /^\s*(l|lt|ltr|ltrs|litre|litres|liter|liters)\.?\s*$/i;
const LIQUID_WORD = /\b(liquid|paint|primer|emulsion|enamel|distemper|varnish|lacquer|polish|thinner|solvent|chemical|admixture|plasticiser|plasticizer|waterproof\w*|curing|sealant|adhesive|resin|epoxy|bitumen|oil|diesel|petrol|acid|putty)\b/i;

export const isLitreUnit = (unit) => LITRE_UNIT.test(String(unit || ''));

/** True when litres should be offered for this material / unit. */
export function isLiquidMaterial({ unit, category, name } = {}) {
  if (isLitreUnit(unit)) return true;
  if (CONTAINER_UNIT.test(String(unit || ''))) return true;
  return LIQUID_WORD.test(`${category || ''} ${name || ''}`);
}

/** Litres for a quantity, or null when unknown. */
export function litresFor(quantity, { unit, litresPerUnit } = {}) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) return null;
  if (isLitreUnit(unit)) return Number(q.toFixed(3));
  if (Number(litresPerUnit) > 0) return Number((q * Number(litresPerUnit)).toFixed(3));
  return null;
}

/** "120 L" / "—". */
export function formatLitres(litres) {
  if (litres === null || litres === undefined || litres === '' || !Number.isFinite(Number(litres))) return '—';
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(Number(litres))} L`;
}
