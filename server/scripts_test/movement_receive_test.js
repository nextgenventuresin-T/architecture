'use strict';
/**
 * Receive leg of the transfer: vehicle-number verification, destination-only
 * receipt, and destination stock credited ONLY here.
 *
 * Run: node scripts_test/movement_receive_test.js
 */

const path = require('path');
const Module = require('module');

const SRC = path.join(__dirname, '..', 'src');
const resolve = (p) => require.resolve(path.join(SRC, p));

let movement;
let stockCalls;
let requestStatus;

function resetWorld() {
  stockCalls = [];
  requestStatus = 'ordered';
  movement = {
    id: 1, movement_number: 'MV-0001', material_id: 5, unit: 'bag',
    source_warehouse_id: 11, destination_warehouse_id: 22,
    source_contractor_id: 1, destination_contractor_id: 2,
    sent_quantity: 10, received_quantity: null, status: 'in_transit',
    vehicle_number: 'PB11 AB 1234', procurement_request_id: 1, reference: 'PR-0001',
  };
}

const stubs = {
  'models/materialMovementModel.js': {
    findById: async () => movement,
    findAll: async () => [movement],
    lockById: async () => ({ id: movement.id, status: movement.status }),
    markReceived: async (id, { receivedQuantity }) => {
      if (movement.status !== 'in_transit') return false;
      movement.status = 'received';
      movement.received_quantity = receivedQuantity;
      return true;
    },
  },
  'services/warehouseService.js': {
    issueStock: async (spec) => { stockCalls.push({ op: 'issue', ...spec }); return { id: 1 }; },
    receiveStock: async (spec) => { stockCalls.push({ op: 'receive', ...spec }); return { id: 2 }; },
    transferStock: async (spec) => { stockCalls.push({ op: 'transfer', ...spec }); return { id: 3 }; },
  },
  'models/procurementModel.js': {
    updateFulfilment: async (id, { status }) => { requestStatus = status; },
  },
  'models/warehouseModel.js': { findScopes: async () => ({ central: [], contractors: [] }), ensureContractorWarehouses: async () => {} },
  'models/materialModel.js': { findById: async () => ({ id: 5, unit: 'bag' }) },
  // receiving is transactional now: the request flip happens on the shared connection
  'config/db.js': {
    pool: {
      query: async () => [[]],
      getConnection: async () => ({
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
        query: async (sql) => {
          if (/UPDATE procurement_requests/.test(sql) && /status = 'received'/.test(sql)) requestStatus = 'received';
          return [[]];
        },
      }),
    },
  },
};

const originalLoad = Module._load;
const stubByPath = new Map(Object.entries(stubs).map(([k, v]) => [resolve(k), v]));
Module._load = function patched(request, parent, isMain) {
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (stubByPath.has(resolved)) return stubByPath.get(resolved);
  } catch { /* real loader */ }
  return originalLoad.apply(this, arguments);
};

const mms = require(resolve('services/materialMovementService.js'));

const c1 = { role: 'contractor', contractorId: 1 };
const c2 = { role: 'contractor', contractorId: 2 };
const admin = { role: 'admin', contractorId: null };

let pass = 0; let fail = 0;
const results = [];
const ok = (label, note = '') => { pass += 1; results.push(['PASS', label, note]); };
const bad = (label, note) => { fail += 1; results.push(['FAIL', label, note]); };

async function expectOk(label, fn, check) {
  try {
    const out = await fn();
    const problem = check ? check(out) : null;
    if (problem) bad(label, problem); else ok(label);
  } catch (e) { bad(label, `threw ${e.statusCode || ''} ${e.message}`); }
}
async function expectReject(label, fn, status, messageLike) {
  try { await fn(); bad(label, 'was ALLOWED but should have been refused'); }
  catch (e) {
    const sOk = !status || e.statusCode === status;
    const mOk = !messageLike || String(e.message).toLowerCase().includes(messageLike.toLowerCase())
      || String(JSON.stringify(e.details || {})).toLowerCase().includes(messageLike.toLowerCase());
    if (sOk && mOk) ok(label, `${e.statusCode} — ${e.message}`);
    else bad(label, `got ${e.statusCode} "${e.message}" ${JSON.stringify(e.details || {})}`);
  }
}

(async () => {
  resetWorld();
  await expectReject('receive — source contractor (C1) refused', () => mms.receiveMaterial(1, {}, c1, 10), 403, 'receiving contractor');
  await expectOk('receive — refused attempt credited nothing', async () => null,
    () => (stockCalls.length === 0 ? null : 'stock moved on a refused receive'));

  resetWorld();
  await expectReject('receive — wrong vehicle number rejected', () => mms.receiveMaterial(1, { vehicle_number: 'DL01 XX 9999' }, c2, 20), 400, 'does not match');
  await expectOk('receive — mismatch credited nothing', async () => null,
    () => (stockCalls.length === 0 ? null : 'stock moved on a vehicle mismatch'));

  resetWorld();
  await expectOk('receive — matching vehicle number accepted (whitespace/case tolerant)',
    () => mms.receiveMaterial(1, { vehicle_number: 'pb11ab1234', received_quantity: 10 }, c2, 20),
    () => (movement.status === 'received' ? null : `movement status is ${movement.status}`));
  await expectOk('receive — credited the DESTINATION warehouse only, once', async () => null, () => {
    if (stockCalls.length !== 1) return `expected 1 stock call, got ${stockCalls.length}`;
    const c = stockCalls[0];
    if (c.op !== 'receive') return `expected a receive, got ${c.op}`;
    if (c.warehouse_id !== 22) return `credited warehouse ${c.warehouse_id}, expected the destination (22)`;
    return null;
  });
  await expectOk('receive — source warehouse not touched on receive', async () => null,
    () => (stockCalls.some((c) => c.warehouse_id === 11) ? 'source debited again on receive' : null));
  await expectOk('receive — procurement request completed', async () => null,
    () => (requestStatus === 'received' ? null : `request status is ${requestStatus}`));

  resetWorld();
  movement.status = 'received';
  await expectReject('receive — double receipt refused', () => mms.receiveMaterial(1, { vehicle_number: 'PB11 AB 1234' }, c2, 20), 400, 'already');

  resetWorld();
  await expectReject('receive — Admin must ALSO enter the vehicle number', () => mms.receiveMaterial(1, { received_quantity: 10 }, admin, 99), 400, 'vehicle');
  resetWorld();
  await expectOk('receive — Admin may receive with the verified vehicle number',
    () => mms.receiveMaterial(1, { received_quantity: 10, vehicle_number: 'PB11 AB 1234' }, admin, 99),
    () => (movement.status === 'received' ? null : 'admin receive failed'));

  const width = Math.max(...results.map((r) => r[1].length));
  for (const [state, label, note] of results) console.log(`${state}  ${label.padEnd(width)}  ${note}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
