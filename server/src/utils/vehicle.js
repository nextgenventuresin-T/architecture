'use strict';

/**
 * Vehicle numbers are typed by hand at dispatch and again at receipt
 * ("PB11 AB 1234", "pb-11-ab-1234"), so comparisons ignore case, spaces and
 * separators. Both sides always go through the same normaliser.
 */
function normalizeVehicle(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function vehiclesMatch(a, b) {
  const x = normalizeVehicle(a);
  const y = normalizeVehicle(b);
  return x.length > 0 && x === y;
}

/** SQL expression that normalises a column the same way normalizeVehicle does. */
function vehicleSql(column) {
  return `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), '-', ''), '.', ''), '_', ''), '/', ''))`;
}

module.exports = { normalizeVehicle, vehiclesMatch, vehicleSql };
