'use strict';
/**
 * Contractor -> Another Contractor approval-gate test.
 *
 * Stubs the model/warehouse layer (no MySQL needed) and drives
 * procurementService through every gate the flow depends on, asserting both
 * the outcome AND that no stock moved where it must not.
 *
 * Run: node scripts_test/internal_transfer_gate_test.js
 */

const path = require('path');
const Module = require('module');

const SRC = path.join(__dirname, '..', 'src');
const resolve = (p) => require.resolve(path.join(SRC, p));

// ------------------------------------------------------------------ state
let db;          // id -> raw request row
let stockCalls;  // every warehouseService call made during a scenario
let movements;

function resetWorld() {
  stockCalls = [];
  movements = [];
  db = {
    // Contractor 2 (id 2) raised an internal transfer FROM contractor 1.
    1: {
      id: 1, request_number: 'PR-0001', procurement_kind: 'internal_transfer',
      source_type: 'contractor', destination_type: 'contractor_warehouse',
      source_contractor_id: 1, destination_contractor_id: 2,
      source_warehouse_id: 11, destination_warehouse_id: 22,
      material_id: 5, quantity: 10, unit: 'bag', status: 'approved',
      project_id: null, site_id: null, destination_site_id: null,
      ordered_quantity: null, estimated_rate: 0, warehouse_transaction_id: null,
    },
    // Central warehouse -> Contractor 2. Must keep working exactly as before.
    2: {
      id: 2, request_number: 'PR-0002', procurement_kind: 'contractor_supply',
      source_type: 'central_warehouse', destination_type: 'contractor_warehouse',
      source_contractor_id: null, destination_contractor_id: 2,
      source_warehouse_id: 99, destination_warehouse_id: 22,
      material_id: 5, quantity: 10, unit: 'bag', status: 'approved',
      project_id: null, site_id: null, destination_site_id: null,
      ordered_quantity: null, estimated_rate: 0, warehouse_transaction_id: null,
    },
  };
}

// ------------------------------------------------------------------ stubs
const stubs = {
  'models/procurementModel.js': {
    findRawById: async (id) => db[id] || null,
    findById: async (id) => db[id] || null,
    findReceipts: async () => [],
    updateStatus: async (id, status) => { db[id].status = status; },
    updateFulfilment: async (id, { status, warehouseTransactionId }) => {
      db[id].status = status;
      db[id].warehouse_transaction_id = warehouseTransactionId;
    },
  },
  'services/warehouseService.js': {
    issueStock: async (spec) => { stockCalls.push({ op: 'issue', ...spec }); return { id: 900 + stockCalls.length }; },
    receiveStock: async (spec) => { stockCalls.push({ op: 'receive', ...spec }); return { id: 900 + stockCalls.length }; },
    transferStock: async (spec) => { stockCalls.push({ op: 'transfer', ...spec }); return { id: 900 + stockCalls.length }; },
  },
  'services/materialMovementService.js': {
    getByRequest: async () => null,
    dispatchForRequest: async (request, payload, userId) => {
      // Mirror the real thing: one issue leg out of source, nothing at dest.
      await stubs['services/warehouseService.js'].issueStock({
        material_id: request.material_id,
        warehouse_id: request.source_warehouse_id,
        quantity: payload.sent_quantity ?? request.quantity,
      }, userId);
      const mv = {
        id: movements.length + 1,
        status: 'in_transit',
        vehicleNumber: payload.vehicle_number ?? null,
        sentQuantity: payload.sent_quantity ?? request.quantity,
        procurementRequestId: request.id,
      };
      movements.push(mv);
      // The real implementation flips the request to 'ordered' inside the dispatch transaction.
      db[request.id].status = 'ordered';
      return mv;
    },
  },
};

const originalLoad = Module._load;
const stubByPath = new Map(Object.entries(stubs).map(([k, v]) => [resolve(k), v]));
Module._load = function patched(request, parent, isMain) {
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (stubByPath.has(resolved)) return stubByPath.get(resolved);
  } catch { /* fall through to the real loader */ }
  return originalLoad.apply(this, arguments);
};

const procurementService = require(resolve('services/procurementService.js'));

// ------------------------------------------------------------------ actors
const admin = { role: 'admin', isAdmin: true, contractorId: null };
const procurement = { role: 'procurement', contractorId: null };
const warehouse = { role: 'warehouse', contractorId: null };
const c1 = { role: 'contractor', contractorId: 1 }; // SOURCE
const c2 = { role: 'contractor', contractorId: 2 }; // DESTINATION

// ------------------------------------------------------------------ runner
let pass = 0; let fail = 0;
const results = [];

async function expectOk(label, fn, check) {
  try {
    const out = await fn();
    const problem = check ? check(out) : null;
    if (problem) { fail += 1; results.push(['FAIL', label, problem]); }
    else { pass += 1; results.push(['PASS', label, '']); }
  } catch (e) {
    fail += 1;
    results.push(['FAIL', label, `threw ${e.statusCode || ''} ${e.message}`]);
  }
}

async function expectReject(label, fn, expectedStatus, messageLike) {
  try {
    await fn();
    fail += 1;
    results.push(['FAIL', label, 'was ALLOWED but should have been refused']);
  } catch (e) {
    const statusOk = !expectedStatus || e.statusCode === expectedStatus;
    const msgOk = !messageLike || String(e.message).toLowerCase().includes(messageLike.toLowerCase());
    if (statusOk && msgOk) { pass += 1; results.push(['PASS', label, `${e.statusCode} — ${e.message}`]); }
    else { fail += 1; results.push(['FAIL', label, `got ${e.statusCode} "${e.message}"`]); }
  }
}

const noStock = () => (stockCalls.length === 0 ? null : `stock moved: ${JSON.stringify(stockCalls)}`);

(async () => {
  // === Req 2/3: only the SOURCE contractor confirms, and confirming is inert
  resetWorld();
  await expectReject('confirm — destination contractor (C2) refused', () => procurementService.confirmSource(1, c2, 20), 403, 'supplying contractor');
  await expectReject('confirm — Admin refused', () => procurementService.confirmSource(1, admin, 99), 403, 'supplying contractor');
  await expectReject('confirm — Procurement refused', () => procurementService.confirmSource(1, procurement, 98), 403);
  await expectReject('confirm — Warehouse refused', () => procurementService.confirmSource(1, warehouse, 97), 403);
  await expectOk('confirm — no stock touched by any refused attempt', async () => null, noStock);

  await expectOk('confirm — source contractor (C1) allowed', () => procurementService.confirmSource(1, c1, 10),
    () => (db[1].status === 'source_confirmed' ? null : `status is ${db[1].status}`));
  await expectOk('confirm — moved NO stock', async () => null, noStock);
  await expectOk('confirm — created NO material movement', async () => null,
    () => (movements.length === 0 ? null : 'a movement was created'));
  await expectOk('confirm — no Finance fields stamped', async () => null,
    () => (db[1].total_amount == null && db[1].purchase_rate == null && db[1].bill_reference == null
      ? null : 'finance fields were written'));

  await expectReject('confirm — second confirm refused (already confirmed)', () => procurementService.confirmSource(1, c1, 10), 400);

  // === Req 1: bare status PATCH can never reach source_confirmed
  resetWorld();
  await expectReject('PATCH /status to source_confirmed refused (C1)', () => procurementService.updateStatus(1, 'source_confirmed', 'contractor', c1, 10), 400, 'confirm request');
  await expectReject('PATCH /status to source_confirmed refused (Admin)', () => procurementService.updateStatus(1, 'source_confirmed', 'admin', admin, 99), 400);
  await expectOk('PATCH attempts moved no stock', async () => null, noStock);

  // === Req 4: dispatch gating on internal_transfer
  resetWorld();
  await expectReject('send — refused while only approved (not yet confirmed)', () => procurementService.dispatch(1, {}, c1, 10), 400, 'Confirm this request');
  await expectOk('send — premature attempt moved no stock', async () => null, noStock);

  db[1].status = 'source_confirmed';
  await expectReject('send — Admin refused', () => procurementService.dispatch(1, {}, admin, 99), 403, 'supplying contractor');
  await expectReject('send — Procurement refused', () => procurementService.dispatch(1, {}, procurement, 98), 403);
  await expectReject('send — Warehouse refused', () => procurementService.dispatch(1, {}, warehouse, 97), 403);
  await expectReject('send — destination contractor (C2) refused', () => procurementService.dispatch(1, {}, c2, 20), 403);
  await expectOk('send — every refused attempt moved no stock', async () => null, noStock);

  await expectOk('send — source contractor (C1) allowed', () => procurementService.dispatch(1, { sent_quantity: 10, vehicle_number: 'PB11AB1234' }, c1, 10),
    () => (db[1].status === 'ordered' ? null : `status is ${db[1].status}`));

  // === Req 6: source stock out on Send; destination untouched
  await expectOk('send — issued exactly one leg, OUT of the source warehouse', async () => null, () => {
    if (stockCalls.length !== 1) return `expected 1 stock call, got ${stockCalls.length}`;
    const c = stockCalls[0];
    if (c.op !== 'issue') return `expected an issue, got ${c.op}`;
    if (c.warehouse_id !== 11) return `issued from warehouse ${c.warehouse_id}, expected the source (11)`;
    return null;
  });
  await expectOk('send — destination warehouse NOT credited', async () => null,
    () => (stockCalls.some((c) => c.op === 'receive' || c.warehouse_id === 22) ? 'destination was credited on send' : null));
  await expectOk('send — vehicle number carried onto the movement', async () => null,
    () => (movements[0]?.vehicleNumber === 'PB11AB1234' ? null : 'vehicle number lost'));

  // === Req 5: /fulfil must refuse internal_transfer outright
  for (const [label, actor, uid] of [['Admin', admin, 99], ['Procurement', procurement, 98], ['Warehouse', warehouse, 97]]) {
    for (const status of ['approved', 'source_confirmed', 'ordered']) {
      resetWorld();
      db[1].status = status;
      await expectReject(`fulfil — ${label} refused on internal_transfer (status ${status})`,
        () => procurementService.fulfil(1, {}, uid), 400, 'cannot be fulfilled directly');
      await expectOk(`fulfil — no stock transferred (${label}, ${status})`, async () => null, noStock);
    }
  }

  // === Req 8: Central Warehouse -> Contractor unchanged
  resetWorld();
  await expectReject('central supply — contractor cannot send company stock', () => procurementService.dispatch(2, {}, c2, 20), 403);
  await expectOk('central supply — Admin can still send from approved', () => procurementService.dispatch(2, { sent_quantity: 10 }, admin, 99),
    () => (db[2].status === 'ordered' ? null : `status is ${db[2].status}`));
  await expectOk('central supply — issued out of the central warehouse (99)', async () => null,
    () => (stockCalls.length === 1 && stockCalls[0].op === 'issue' && stockCalls[0].warehouse_id === 99
      ? null : `unexpected stock calls: ${JSON.stringify(stockCalls)}`));

  resetWorld();
  await expectOk('central supply — Warehouse role can still send', () => procurementService.dispatch(2, {}, warehouse, 97),
    () => (db[2].status === 'ordered' ? null : `status is ${db[2].status}`));

  resetWorld();
  await expectReject('central supply — /fulfil is refused: it must be dispatched, then received with the vehicle verified',
    () => procurementService.fulfil(2, { vehicle_number: 'PB11AB1234' }, 99), 400, 'send material');
  await expectOk('central supply — refused fulfil moved no stock', async () => null,
    () => (stockCalls.length === 0 ? null : 'stock moved'));

  // === Req 7 support: viewer-scoped action flags
  resetWorld();
  const forC1 = await procurementService.getById(1, c1, 10);
  const forC2 = await procurementService.getById(1, c2, 20);
  const forAdmin = await procurementService.getById(1, admin, 99);
  await expectOk('flags — C1 (source) sees Confirm, not Send, at approved', async () => null,
    () => (forC1.canConfirmSource && !forC1.canDispatch ? null : JSON.stringify(forC1)));
  await expectOk('flags — C2 (destination) sees neither Confirm nor Send', async () => null,
    () => (!forC2.canConfirmSource && !forC2.canDispatch ? null : JSON.stringify(forC2)));
  await expectOk('flags — Admin sees neither Confirm nor Send on internal_transfer', async () => null,
    () => (!forAdmin.canConfirmSource && !forAdmin.canDispatch ? null : JSON.stringify(forAdmin)));

  db[1].status = 'source_confirmed';
  const c1Confirmed = await procurementService.getById(1, c1, 10);
  const c2Confirmed = await procurementService.getById(1, c2, 20);
  const adminConfirmed = await procurementService.getById(1, admin, 99);
  await expectOk('flags — C1 sees Send once confirmed', async () => null,
    () => (c1Confirmed.canDispatch && !c1Confirmed.canConfirmSource ? null : JSON.stringify(c1Confirmed)));
  await expectOk('flags — C2 still never sees Send', async () => null,
    () => (!c2Confirmed.canDispatch ? null : 'destination offered Send'));
  await expectOk('flags — Admin/Procurement/Warehouse never see Send on internal_transfer', async () => null,
    () => (!adminConfirmed.canDispatch ? null : 'admin offered Send'));

  db[1].status = 'ordered';
  const c2InTransit = await procurementService.getById(1, c2, 20);
  const c1InTransit = await procurementService.getById(1, c1, 10);
  await expectOk('flags — C2 (destination) sees Receive once in transit', async () => null,
    () => (c2InTransit.canReceiveMovement ? null : 'destination not offered Receive'));
  await expectOk('flags — C1 (source) never sees Receive on its own send', async () => null,
    () => (!c1InTransit.canReceiveMovement ? null : 'source offered Receive'));

  // ---------------------------------------------------------------- report
  const width = Math.max(...results.map((r) => r[1].length));
  for (const [state, label, note] of results) {
    console.log(`${state}  ${label.padEnd(width)}  ${note}`);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
