'use strict';

/**
 * One spelling per material unit. Variants (KGS, Kgs, PCS, LTR, ...) map to the
 * standard short form the material form offers; anything not listed is kept as
 * typed. Units are labels only (no conversion), so renaming one is safe.
 */
const UNIT_ALIASES = {
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
  nos: 'nos', no: 'nos', 'no.': 'nos', number: 'nos', numbers: 'nos',
  pcs: 'nos', pc: 'nos', piece: 'nos', pieces: 'nos',
  set: 'sets', sets: 'sets',
  bag: 'bags', bags: 'bags',
  ltr: 'litres', ltrs: 'litres', litre: 'litres', litres: 'litres', liter: 'litres', liters: 'litres',
  mtr: 'm', mtrs: 'm', m: 'm', metre: 'm', metres: 'm', meter: 'm', meters: 'm',
  feet: 'ft', ft: 'ft', foot: 'ft',
  sqm: 'sq.m', 'sq.m': 'sq.m', 'sq m': 'sq.m',
  sqf: 'sq.ft', sqft: 'sq.ft', 'sq.ft': 'sq.ft', 'sq ft': 'sq.ft',
  ton: 'tonnes', tons: 'tonnes', tonne: 'tonnes', tonnes: 'tonnes',
  pack: 'packs', packs: 'packs',
  pair: 'pairs', pairs: 'pairs',
  coil: 'coils', coils: 'coils',
  drum: 'drums', drums: 'drums',
  roll: 'rolls', rolls: 'rolls',
  'cu.m': 'cu.m', cum: 'cu.m', 'cu m': 'cu.m',
  'cu.ft': 'cu.ft', cft: 'cu.ft', 'cu ft': 'cu.ft',
  thousand: 'thousand',
};

function normalizeUnit(unit) {
  if (unit == null) return unit;
  const trimmed = String(unit).trim();
  return UNIT_ALIASES[trimmed.toLowerCase()] || trimmed;
}

module.exports = { UNIT_ALIASES, normalizeUnit };
