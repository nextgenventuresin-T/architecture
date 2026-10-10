'use strict';
/**
 * End-to-end test (real Express app + real MySQL) for:
 *   1. Admin vendor procurement -> Central Warehouse, vehicle verification, no double receipt
 *   2. Contractor request WITHOUT vehicle number; vehicle required at dispatch and at receiving
 *   3. Contractor receiving: fetch by vehicle, verify, confirm once, stock correct
 *   4. Project Manager: requests, attendance, daily work, site restrictions
 *   5. Serial-numbered machines: uniqueness, health history, allocation, reassignment, overlap
 *   6. Usage-day maths, rental allocation, unavailable-machine request
 *   7. Finance: Budget vs Actual material actual, ledger types, no double counting
 *
 * It clones the live database into <name>_test first and ONLY ever touches the clone.
 *
 * Run: node scripts_test/serial_receipts_finance_test.js
 */
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const liveDb = process.env.DB_NAME || 'architecture_erp';
const testDb = liveDb.endsWith('_test') ? liveDb : `${liveDb}_test`;
execFileSync('node', [path.join(__dirname, 'clone_test_db.js')], { stdio: 'inherit', env: { ...process.env, DB_NAME: liveDb.replace(/_test$/, '') } });
process.env.DB_NAME = testDb;
process.env.NODE_ENV = 'test';

const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/tokens');
const warehouseModel = require('../src/models/warehouseModel');
const { up: migrate } = require('../src/db/migrations/20261009_serials_receipts_cost');
const toolUnitService = require('../src/services/toolUnitService');

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; failures.push(name); console.log(`  FAIL  ${name} ${detail}`); }
}
const section = (t) => console.log(`\n== ${t}`);
const near = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) <= eps;

let base;
async function api(method, url, token, body, { form = false } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (form) {
    payload = new FormData();
    Object.entries(body || {}).forEach(([k, v]) => payload.append(k, String(v)));
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}/api${url}`, { method, headers, body: payload });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json, data: json?.data, msg: json?.error?.message || json?.message || '', details: json?.error?.details };
}

const q = async (sql, params) => (await pool.query(sql, params))[0];
const stock = async (warehouseId, materialId) => Number((await q('SELECT COALESCE(SUM(quantity),0) AS n FROM warehouse_stock WHERE warehouse_id=? AND material_id=?', [warehouseId, materialId]))[0].n);

async function mkUser(email, roleSlug, name) {
  const [[role]] = await pool.query('SELECT id FROM roles WHERE slug=?', [roleSlug]);
  const hash = await bcrypt.hash('x', 4);
  const [r] = await pool.query('INSERT INTO users (full_name,email,password_hash,role_id,is_active) VALUES (?,?,?,?,1)', [name, email, hash, role.id]);
  return { id: r.insertId, email, role: roleSlug, token: signAccessToken({ id: r.insertId, role: roleSlug, email }) };
}

(async () => {
  await migrate(await pool.getConnection(), () => {});
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  // ------------------------------------------------------------ fixtures
  const admin = { id: 1, role: 'admin', email: 'admin@architectureerp.com', token: signAccessToken({ id: 1, role: 'admin', email: 'admin@architectureerp.com' }) };
  const [[c1row]] = await pool.query('SELECT id, user_id FROM contractors WHERE id = 1');
  const [[c1u]] = await pool.query('SELECT id, email FROM users WHERE id = ?', [c1row.user_id]);
  const c1 = { id: c1u.id, role: 'contractor', email: c1u.email, token: signAccessToken({ id: c1u.id, role: 'contractor', email: c1u.email }), contractorId: 1 };
  const contractors = { 1: c1 };
  for (const n of [2, 3, 4]) {
    const u = await mkUser(`c${n}@t.local`, 'contractor', `Contractor ${n}`);
    const [r] = await pool.query("INSERT INTO contractors (user_id,name,type,status) VALUES (?,?, 'other','active')", [u.id, `Test Contractor ${n}`]);
    contractors[n] = { ...u, contractorId: r.insertId };
  }
  await warehouseModel.ensureContractorWarehouses();
  const pmA = await mkUser('pma@t.local', 'project_manager', 'PM A');
  const pmB = await mkUser('pmb@t.local', 'project_manager', 'PM B');
  const emp = await mkUser('emp@t.local', 'employee', 'Emp');
  await pool.query('INSERT INTO user_project_access (user_id, project_id) VALUES (?, 1)', [pmA.id]);

  // a second project the PM is NOT assigned to
  const [p2] = await pool.query("INSERT INTO projects (code,name,location,start_date,expected_completion,contractor_id) VALUES ('TP2','Other Project','X','2026-01-01','2027-01-01',?)", [contractors[2].contractorId]);
  const [s2] = await pool.query("INSERT INTO sites (project_id,name,address,contractor_id) VALUES (?, 'Other Site','X',?)", [p2.insertId, contractors[2].contractorId]);
  const [t2] = await pool.query("INSERT INTO project_tasks (project_id,site_id,name) VALUES (?,?, 'Other Task')", [p2.insertId, s2.insertId]);
  const [w1] = await pool.query("INSERT INTO contractor_workers (contractor_id,full_name,skill_category,worker_code) VALUES (1,'Worker A1','mason','TW-A1')");
  const [w2] = await pool.query("INSERT INTO contractor_workers (contractor_id,full_name,skill_category,worker_code) VALUES (?, 'Worker B1','mason','TW-B1')", [contractors[2].contractorId]);

  const BRICKS = 4;
  const [[cw]] = await pool.query("SELECT id FROM warehouses WHERE type='central' LIMIT 1");
  const CENTRAL = cw.id;
  const [[tw]] = await pool.query('SELECT id FROM warehouses WHERE contractor_id = 1');
  const C1WH = tw.id;

  // ============================================================ 1. VENDOR -> CENTRAL
  section('1. Admin vendor procurement into Central Warehouse');
  const centralBefore = await stock(CENTRAL, BRICKS);
  let r = await api('POST', '/procurement', admin.token, {
    procurement_kind: 'central_purchase', item_type: 'material', material_id: BRICKS, vendor_id: 1, supplier: 'Babu',
    quantity: 100, unit: 'nos', purchase_rate: 25, estimated_rate: 25, vehicle_number: 'PB10 AA 1111',
    driver_name: 'Ram Singh', driver_phone: '9999900000', status: 'requested',
  });
  check('vendor purchase created with vehicle + driver', r.status === 201 && r.data.request.vehicleNumber === 'PB10 AA 1111' && r.data.request.driverName === 'Ram Singh', r.msg);
  const vp = r.data.request;
  check('actual cost per unit and total retained on request', Number(vp.purchaseRate) === 25 && Number(vp.totalAmount) === 2500, JSON.stringify([vp.purchaseRate, vp.totalAmount]));
  await api('PATCH', `/procurement/${vp.id}/status`, admin.token, { status: 'pending_approval' });
  r = await api('PATCH', `/procurement/${vp.id}/status`, admin.token, { status: 'approved' });
  check('vendor purchase approved', r.status === 200, r.msg);

  r = await api('GET', '/material-movements/lookup?vehicle_number=pb-10-aa-1111', admin.token);
  const hit = r.data?.shipments?.[0];
  check('lookup by vehicle number returns the vendor dispatch (driver, qty, source, destination)',
    r.status === 200 && hit && hit.kind === 'vendor_purchase' && hit.driverName === 'Ram Singh' && hit.driverPhone === '9999900000' && hit.quantity === 100 && hit.source === 'Babu' && /Central/.test(hit.destination), JSON.stringify(r.data));
  r = await api('GET', '/material-movements/lookup?vehicle_number=ZZ99ZZ9999', admin.token);
  check('lookup of an unknown vehicle returns nothing', r.status === 200 && r.data.shipments.length === 0);

  r = await api('POST', `/procurement/${vp.id}/fulfil`, admin.token, {});
  check('receipt WITHOUT vehicle number is refused', r.status === 400 && /vehicle/i.test(JSON.stringify(r.details || r.msg)), r.msg);
  r = await api('POST', `/procurement/${vp.id}/fulfil`, admin.token, { vehicle_number: 'MH12AB0000' });
  check('receipt with the WRONG vehicle number is refused', r.status === 400 && /match/i.test(JSON.stringify(r.details || r.msg)), r.msg);
  check('stock untouched by refused receipts', (await stock(CENTRAL, BRICKS)) === centralBefore);

  // two simultaneous confirmations: exactly one may post stock
  const [a, b] = await Promise.all([
    api('POST', `/procurement/${vp.id}/fulfil`, admin.token, { vehicle_number: 'pb 10 aa 1111' }),
    api('POST', `/procurement/${vp.id}/fulfil`, admin.token, { vehicle_number: 'PB10AA1111' }),
  ]);
  check('concurrent double-confirm: exactly one succeeds', [a.status, b.status].filter((s) => s === 200).length === 1, `${a.status}/${b.status}`);
  check('stock increased by exactly the dispatched quantity (once)', (await stock(CENTRAL, BRICKS)) === centralBefore + 100);
  const reqRow = (await q('SELECT * FROM procurement_requests WHERE id=?', [vp.id]))[0];
  check('request is received and linked to its warehouse transaction', reqRow.status === 'received' && reqRow.warehouse_transaction_id && reqRow.received_by === 1);
  const tx = (await q('SELECT * FROM warehouse_transactions WHERE id=?', [reqRow.warehouse_transaction_id]))[0];
  check('ledger row keeps quantity, actual cost per unit and total cost', Number(tx.quantity) === 100 && Number(tx.unit_cost) === 25 && Number(tx.total_cost) === 2500 && tx.procurement_request_id === vp.id && tx.procurement_receipt_id, JSON.stringify(tx));
  r = await api('POST', `/procurement/${vp.id}/fulfil`, admin.token, { vehicle_number: 'PB10 AA 1111' });
  check('a later duplicate receipt is refused', r.status === 400 && /already/i.test(r.msg));
  r = await api('POST', `/procurement/${vp.id}/receiving`, admin.token, { received_quantity: 100, receiving_date: '2026-10-09', vehicle_number: 'PB10 AA 1111' });
  check('legacy receiving path cannot add the same delivery again', r.status === 400, r.msg);
  check('stock still exactly +100', (await stock(CENTRAL, BRICKS)) === centralBefore + 100);
  r = await api('GET', `/procurement/${vp.id}`, admin.token);
  check('request detail now shows the received quantity', Number(r.data.request.receiving.receivedQuantity) === 100 && r.data.receipts.length === 1);

  // ============================================================ 2. CONTRACTOR REQUEST
  section('2. Contractor request has NO vehicle requirement; dispatch/receipt do');
  r = await api('POST', '/procurement', c1.token, {
    procurement_kind: 'contractor_supply', source_type: 'central_warehouse', item_type: 'material', material_id: BRICKS,
    quantity: 10, unit: 'nos', project_id: 1, site_id: 1, task_id: 1, status: 'requested', excess_reason: 'test supply',
  });
  check('contractor can request from Central Warehouse with NO vehicle/driver details', r.status === 201, `${r.msg} ${JSON.stringify(r.details)}`);
  const creq = r.data.request;
  check('request stores requester, project, site, task and contractor', creq.requestedBy.id === c1.id && creq.project.id === 1 && creq.site.id === 1 && creq.task.id === 1 && creq.responsibleContractor.id === 1 && creq.requesterRole === 'contractor');
  if (creq.status === 'requested') await api('PATCH', `/procurement/${creq.id}/status`, c1.token, { status: 'pending_approval' });
  r = await api('PATCH', `/procurement/${creq.id}/status`, c1.token, { status: 'approved' });
  check('contractor cannot approve their own request', r.status === 403, r.msg);
  r = await api('PATCH', `/procurement/${creq.id}/status`, admin.token, { status: 'approved' });
  check('admin approves', r.status === 200, r.msg);

  r = await api('POST', `/procurement/${creq.id}/dispatch`, admin.token, { sent_quantity: 10 });
  check('dispatch without a vehicle number is refused', r.status === 400, r.msg);
  const centralMid = await stock(CENTRAL, BRICKS);
  const c1Before = await stock(C1WH, BRICKS);
  r = await api('POST', `/procurement/${creq.id}/dispatch`, admin.token, { sent_quantity: 10, vehicle_number: 'PB11 CD 2222', driver_name: 'Shyam', driver_phone: '8888800000' });
  check('admin dispatch with vehicle + driver succeeds', r.status === 200, r.msg);
  check('source stock reduced at dispatch, destination NOT yet increased', (await stock(CENTRAL, BRICKS)) === centralMid - 10 && (await stock(C1WH, BRICKS)) === c1Before);
  const mv = r.data.movement;
  check('movement is costed at the actual stock cost (weighted average of central receipts)', mv.costPerUnit > 20 && mv.costPerUnit < 25, String(mv.costPerUnit));
  r = await api('POST', `/procurement/${creq.id}/dispatch`, admin.token, { sent_quantity: 10, vehicle_number: 'PB11 CD 2222' });
  check('a request cannot be dispatched twice', r.status === 400, r.msg);

  // ============================================================ 3. CONTRACTOR RECEIVING
  section('3. Contractor receiving: fetch by vehicle, verify, confirm once');
  r = await api('GET', '/material-movements/lookup?vehicle_number=pb11cd2222', c1.token);
  const sh = r.data?.shipments?.[0];
  check('receiving contractor fetches driver, material, quantity, source, destination, project, site',
    sh && sh.driverName === 'Shyam' && sh.quantity === 10 && /Central/.test(sh.source) && sh.project && sh.site && sh.material === 'Bricks', JSON.stringify(r.data));
  r = await api('GET', '/material-movements/lookup?vehicle_number=pb11cd2222', contractors[2].token);
  check('another contractor cannot see this shipment', r.status === 200 && r.data.shipments.length === 0);
  r = await api('POST', `/material-movements/${mv.id}/receive`, c1.token, {});
  check('receive without vehicle number is refused', r.status === 400, r.msg);
  r = await api('POST', `/material-movements/${mv.id}/receive`, c1.token, { vehicle_number: 'WRONG1234' });
  check('receive with a wrong vehicle number is refused', r.status === 400 && /match/i.test(JSON.stringify(r.details || r.msg)));
  r = await api('POST', `/material-movements/${mv.id}/receive`, contractors[2].token, { vehicle_number: 'PB11 CD 2222' });
  check('a different contractor cannot receive it', r.status === 403 || r.status === 404, String(r.status));
  check('stock unchanged by refused receives', (await stock(C1WH, BRICKS)) === c1Before);
  const [x, y] = await Promise.all([
    api('POST', `/material-movements/${mv.id}/receive`, c1.token, { vehicle_number: 'pb 11 cd 2222' }),
    api('POST', `/material-movements/${mv.id}/receive`, c1.token, { vehicle_number: 'PB11CD2222' }),
  ]);
  check('concurrent double receive: exactly one succeeds', [x.status, y.status].filter((s) => s === 200).length === 1, `${x.status}/${y.status}`);
  check('destination stock increased exactly once by the received quantity', (await stock(C1WH, BRICKS)) === c1Before + 10);
  const mvRow = (await q('SELECT * FROM material_movements WHERE id=?', [mv.id]))[0];
  check('movement received, verified vehicle recorded', mvRow.status === 'received' && /PB/.test(mvRow.received_vehicle_number) && Number(mvRow.received_quantity) === 10);
  check('procurement request flipped to received with the receipt transaction linked',
    (await q('SELECT status, warehouse_transaction_id FROM procurement_requests WHERE id=?', [creq.id]))[0].status === 'received');
  const rtx = (await q('SELECT * FROM warehouse_transactions WHERE id=?', [mvRow.receive_transaction_id]))[0];
  check('receipt ledger row carries the actual cost', Number(rtx.unit_cost) > 0 && near(rtx.unit_cost, mv.costPerUnit, 0.001), JSON.stringify(rtx));
  r = await api('POST', `/material-movements/${mv.id}/receive`, c1.token, { vehicle_number: 'PB11 CD 2222' });
  check('receiving an already-received shipment is refused', r.status === 400 && /already/i.test(r.msg));

  // ============================================================ 4. PROJECT MANAGER
  section('4. Project Manager: requests, attendance, daily work, restrictions');
  r = await api('POST', '/procurement', pmA.token, {
    procurement_kind: 'project_site', item_type: 'material', material_id: BRICKS, quantity: 5, unit: 'nos',
    project_id: 1, site_id: 1, task_id: 1, status: 'requested', excess_reason: 'pm need',
  });
  check('PM (assigned) can raise a material request', r.status === 201, `${r.msg} ${JSON.stringify(r.details)}`);
  const pmReq = r.data?.request;
  check('PM request is linked to requester, role, project, site, task and the responsible contractor',
    pmReq && pmReq.requestedBy.id === pmA.id && pmReq.requesterRole === 'project_manager' && pmReq.project.id === 1 && pmReq.site.id === 1 && pmReq.task.id === 1 && pmReq.responsibleContractor.id === 1);
  r = await api('POST', '/procurement', pmB.token, { procurement_kind: 'project_site', item_type: 'material', material_id: BRICKS, quantity: 5, unit: 'nos', project_id: 1, site_id: 1, task_id: 1, status: 'requested', excess_reason: 'x' });
  check('PM without assignment is refused', r.status === 404, String(r.status));
  r = await api('POST', '/procurement', pmA.token, { procurement_kind: 'project_site', item_type: 'material', material_id: BRICKS, quantity: 5, unit: 'nos', project_id: p2.insertId, site_id: s2.insertId, task_id: t2.insertId, status: 'requested', excess_reason: 'x' });
  check('PM cannot raise a request on a project they are not assigned to', r.status === 404, String(r.status));
  r = await api('POST', '/procurement', pmA.token, { procurement_kind: 'central_purchase', item_type: 'material', material_id: BRICKS, quantity: 5, unit: 'nos', vehicle_number: 'A1', status: 'requested' });
  check('PM cannot buy from vendors into the central warehouse', r.status === 403, String(r.status));
  if (pmReq.status === 'requested') await api('PATCH', `/procurement/${pmReq.id}/status`, pmA.token, { status: 'pending_approval' });
  r = await api('PATCH', `/procurement/${pmReq.id}/status`, pmA.token, { status: 'approved' });
  check('PM cannot approve (approval stays with Admin)', r.status === 403, String(r.status));
  await api('POST', '/procurement', admin.token, { procurement_kind: 'project_site', item_type: 'material', material_id: BRICKS, quantity: 1, unit: 'nos', project_id: p2.insertId, site_id: s2.insertId, task_id: t2.insertId, status: 'requested', excess_reason: 'o' });
  r = await api('GET', '/procurement?pageSize=50', pmA.token);
  check('PM sees only requests on their assigned project', r.status === 200 && r.data.requests.length > 0 && r.data.requests.every((x) => x.project?.id === 1), JSON.stringify(r.data?.requests?.map((x) => x.project?.id)));
  r = await api('GET', '/procurement?pageSize=50', pmB.token);
  check('unassigned PM sees nothing', r.status === 200 && r.data.requests.length === 0);
  r = await api('GET', '/material-movements', pmA.token);
  check('PM can view movements for assigned projects', r.status === 200 && r.data.movements.length >= 1 && r.data.movements.every((m) => m.project?.id === 1));
  r = await api('GET', '/material-movements', pmB.token);
  check('unassigned PM sees no movements', r.status === 200 && r.data.movements.length === 0);
  r = await api('GET', '/material-movements/lookup?vehicle_number=PB11CD2222', pmA.token);
  check('PM cannot use the receiving lookup', r.status === 403);

  r = await api('GET', `/pm/workers?projectId=1&siteId=1`, pmA.token);
  check('PM lists the responsible contractor labour for an assigned site', r.status === 200 && r.data.workers.some((w) => w.id === w1.insertId), r.msg);
  r = await api('POST', '/pm/attendance', pmA.token, { contractorWorkerId: w1.insertId, projectId: 1, siteId: 1, taskId: 1, date: '2026-10-09', status: 'PRESENT' });
  check('PM records labour attendance at an assigned site', r.status === 200, `${r.status} ${r.msg}`);
  const att = (await q('SELECT * FROM attendance_records WHERE contractor_worker_id=?', [w1.insertId]))[0];
  check('attendance is linked to user, project, site, task and contractor', att && att.recorded_by === pmA.id && att.project_id === 1 && att.site_id === 1 && att.task_id === 1 && att.contractor_id === 1);
  r = await api('POST', '/pm/attendance', pmA.token, { contractorWorkerId: w2.insertId, projectId: 1, siteId: 1, date: '2026-10-09' });
  check("PM cannot mark another contractor's worker at this site", r.status === 403, String(r.status));
  r = await api('POST', '/pm/attendance', pmA.token, { contractorWorkerId: w2.insertId, projectId: p2.insertId, siteId: s2.insertId, date: '2026-10-09' });
  check('PM cannot mark attendance at a site outside their assignment', r.status === 404, String(r.status));
  r = await api('POST', '/pm/attendance', pmB.token, { contractorWorkerId: w1.insertId, projectId: 1, siteId: 1, date: '2026-10-10' });
  check('unassigned PM cannot mark attendance', r.status === 404, String(r.status));
  r = await api('POST', '/hr/attendance', pmA.token, { labourType: 'contractor', contractorWorkerId: w1.insertId, projectId: 1, siteId: 1 });
  check('HR attendance endpoint stays closed to PM', r.status === 403);

  r = await api('POST', '/daily-work', pmA.token, { project_id: 1, site_id: 1, task_id: 2, work_done: 'PM site inspection progress', progress_percentage: 20, work_status: 'in-progress' }, { form: true });
  check('PM records daily work/progress on an assigned site', r.status === 201 || r.status === 200, `${r.status} ${r.msg}`);
  const dw = (await q('SELECT * FROM daily_work_updates WHERE work_done LIKE ? ORDER BY id DESC LIMIT 1', ['PM site inspection%']))[0];
  check('daily work is linked to PM user, project, site, task and the responsible contractor', dw && dw.created_by === pmA.id && dw.project_id === 1 && dw.site_id === 1 && dw.task_id === 2 && dw.contractor_id === 1);
  r = await api('POST', '/daily-work', pmB.token, { project_id: 1, site_id: 1, task_id: 2, work_done: 'x', progress_percentage: 5 }, { form: true });
  check('unassigned PM cannot record daily work', r.status === 404, String(r.status));
  r = await api('POST', '/daily-work', emp.token, { project_id: 1, site_id: 1, work_done: 'x' }, { form: true });
  check('an Employee cannot post daily work', r.status === 403);
  r = await api('GET', '/pm/expenses', pmA.token);
  check('PM can view expense records for assigned projects', r.status === 200 && Array.isArray(r.data.expenses));
  r = await api('GET', '/pm/expenses', pmB.token);
  check('unassigned PM sees no expenses', r.status === 200 && r.data.expenses.length === 0);
  r = await api('GET', '/finance/project-costs', c1.token);
  check('contractor cannot read company finance tabs', r.status === 403);

  // ============================================================ 5. SERIAL MACHINES
  section('5. Serial-numbered machines');
  const BBM = 5; // Bar Bending Machine type
  const reg = (serial, extra = {}) => api('POST', '/tools/units', admin.token, { tool_id: BBM, serial_number: serial, purchase_date: '2026-01-10', purchase_cost: 45000, expiry_date: '2031-01-10', vendor_id: 1, health: 'excellent', ...extra });
  r = await reg('SR001');
  check('register SR001', r.status === 201 && r.data.unit.serialNumber === 'SR001' && r.data.unit.availabilityStatus === 'available', r.msg);
  const sr1 = r.data.unit.id;
  const sr2 = (await reg('SR002')).data.unit.id;
  const sr3 = (await reg('SR003')).data.unit.id;
  r = await reg('sr001');
  check('duplicate serial (even different case) is refused', r.status === 400 && /serial/i.test(JSON.stringify(r.details || r.msg)), r.msg);
  r = await api('POST', '/tools/units', admin.token, { tool_id: BBM, serial_number: '   ' });
  check('blank serial is refused', r.status === 400);
  r = await api('POST', '/tools/units', contractors[2].token, { tool_id: BBM, serial_number: 'SRX' });
  check('only Admin can register machines', r.status === 403);
  r = await api('GET', `/tools/units?toolId=${BBM}`, admin.token);
  check('three physical machines of one type, each with its own serial', r.data.units.length === 3 && new Set(r.data.units.map((u) => u.serialNumber)).size === 3);
  r = await api('PATCH', `/tools/units/${sr2}`, admin.token, { serial_number: 'SR001' });
  check('renaming to an existing serial is refused', r.status === 400);
  const unit1 = r.data;
  const u1 = (await q('SELECT * FROM tool_units WHERE id=?', [sr1]))[0];
  check('unit keeps purchase date, expiry, actual cost, health, location', u1.purchase_date && u1.expiry_date && Number(u1.purchase_cost) === 45000 && u1.health === 'excellent' && u1.warehouse_id === CENTRAL && u1.health_updated_by === 1);

  const allocBody = (extra = {}) => ({ contractor_id: 1, project_id: 1, site_id: 1, task_id: 1, start_date: '2026-10-01', ...extra });
  r = await api('POST', `/tools/units/${sr1}/allocate`, admin.token, allocBody({ charge_policy: 'fixed_total', usage_charge_total: 10000, usage_charge_days: 5 }));
  check('allocate owned SR001 to Contractor 1 (approved charge 10,000 / 5 days)', r.status === 201 && r.data.allocation.dailyChargeRate === 2000, r.msg);
  const al1 = r.data.allocation;
  check('allocating an owned machine creates NO expense', (await q("SELECT COUNT(*) n FROM expenses WHERE tool_unit_id=?", [sr1]))[0].n === 0);
  r = await api('POST', `/tools/units/${sr1}/allocate`, admin.token, allocBody({ contractor_id: 2 }));
  check('the same serial cannot be allocated twice at once', r.status === 400, r.msg);
  r = await api('GET', `/tools/${BBM}`, admin.token);
  check('availability counts per serial: 2 free of 3', r.data.availability.available === 2 && r.data.availability.allocated === 1 && r.data.availability.holders[0].serialNumber === 'SR001');

  // health
  r = await api('PATCH', `/tools/units/${sr1}/health`, pmA.token, { health: 'average', notes: 'bearing noise' });
  check('authorised PM updates health of a machine on their project', r.status === 200 && r.data.unit.health === 'average', r.msg);
  r = await api('PATCH', `/tools/units/${sr1}/health`, pmB.token, { health: 'poor' });
  check('unassigned PM cannot update health', r.status === 403, String(r.status));
  r = await api('PATCH', `/tools/units/${sr1}/health`, contractors[1].token, { health: 'poor' });
  check('contractor cannot update health', r.status === 403);
  r = await api('PATCH', `/tools/units/${sr1}/health`, admin.token, { health: 'good', notes: 'serviced' });
  r = await api('GET', `/tools/units/${sr1}`, admin.token);
  const hh = r.data.healthHistory;
  check('health audit trail keeps who/when/old/new', hh.length >= 3 && hh[0].newValue === 'good' && hh[0].oldValue === 'average' && hh[0].actor.id === 1 && hh[1].actor.id === pmA.id && hh[1].at);

  // return with usage-day maths
  r = await api('POST', `/tools/allocations/${al1.id}/return`, admin.token, { returned_date: '2026-10-03', notes: 'finished early' });
  check('Contractor 1 returns after 3 days: usage 3 days, charge 6,000, 4,000 released', r.status === 200 && r.data.allocation.usageDays === 3 && r.data.allocation.usageCharge === 6000 && r.data.allocation.unbilledBalance === 4000, JSON.stringify(r.data?.allocation));
  const ex1 = (await q("SELECT * FROM expenses WHERE source_type='tool_usage' AND source_id=?", [al1.id]))[0];
  check('usage charge booked once to Task/Project/Contractor (6,000)', ex1 && Number(ex1.amount) === 6000 && ex1.task_id === 1 && ex1.project_id === 1 && ex1.contractor_id === 1 && ex1.category === 'Machine / Tool' && ex1.tool_unit_id === sr1);
  r = await api('POST', `/tools/allocations/${al1.id}/return`, admin.token, { returned_date: '2026-10-03' });
  check('an allocation cannot be returned (and charged) twice', r.status === 400);
  check('SR001 is available again and back in the central warehouse', (await q('SELECT availability_status, warehouse_id FROM tool_units WHERE id=?', [sr1]))[0].availability_status === 'available');
  r = await api('POST', `/tools/units/${sr1}/allocate`, admin.token, allocBody({ contractor_id: 4, task_id: 2, start_date: '2026-10-03' }));
  check('new holder cannot start on a day already used by the previous holder', r.status === 400, r.msg);
  r = await api('POST', `/tools/units/${sr1}/allocate`, admin.token, allocBody({ contractor_id: 4, task_id: 2, start_date: '2026-10-04', charge_policy: 'per_day_rate', usage_charge_rate: 2000 }));
  check('Contractor 4 can take SR001 the day after (own rate)', r.status === 201, r.msg);
  const al1b = r.data.allocation;

  // reassignment while still in use
  r = await api('POST', `/tools/units/${sr2}/allocate`, admin.token, allocBody({ contractor_id: 2, start_date: '2026-10-01', charge_policy: 'per_day_rate', usage_charge_rate: 1500 }));
  const al2 = r.data.allocation;
  r = await api('POST', `/tools/units/${sr2}/transfer`, contractors[2].token, { contractor_id: 3 });
  check('only Admin may authorise a reassignment', r.status === 403);
  r = await api('POST', `/tools/units/${sr2}/transfer`, admin.token, { contractor_id: 3, project_id: 1, site_id: 1, task_id: 2, return_date: '2026-10-02', charge_policy: 'per_day_rate', usage_charge_rate: 1000 });
  check('Admin reassigns SR002 from Contractor 2 to Contractor 3', r.status === 200 && r.data.allocation.contractor.id === contractors[3].contractorId && r.data.allocation.startDate === '2026-10-03' && r.data.allocation.previousAllocationId === al2.id, `${r.msg} ${JSON.stringify(r.data)}`);
  const prev = (await q('SELECT * FROM tool_allocations WHERE id=?', [al2.id]))[0];
  check('previous holder charged for exactly their 2 actual days (3,000), new holder starts after', prev.status === 'returned' && Number(prev.usage_days) === 2 && Number(prev.usage_charge) === 3000);
  const hist = (await api('GET', `/tools/units/${sr2}`, admin.token)).data;
  check('allocation history lists both holders with dates', hist.allocations.length === 2 && hist.history.some((h) => h.type === 'transferred'));

  // ---- unavailable machine -> Admin request / reassignment
  r = await api('POST', `/tools/units/${sr3}/allocate`, admin.token, allocBody({ contractor_id: contractors[3].contractorId, task_id: 3, start_date: '2026-10-04' }));
  check('SR003 allocated; all three Bar Bending Machines are now out', r.status === 201);
  r = await api('POST', '/procurement', c1.token, { procurement_kind: 'project_site', item_type: 'tool', tool_id: BBM, tool_procurement_type: 'purchased_owned', quantity: 1, project_id: 1, site_id: 1, task_id: 1, status: 'requested', required_date: '2026-10-20' });
  check('Contractor requests a machine (no vehicle asked)', r.status === 201, `${r.msg} ${JSON.stringify(r.details)}`);
  const toolReq = r.data.request;
  check('with no unit free the request is NOT auto-approved - it waits for Admin', toolReq.status === 'pending_approval', toolReq.status);
  check('request carries no purchase value (owned allocation is not a purchase)', toolReq.totalAmount == null || Number(toolReq.totalAmount) === 0 || toolReq.estimatedTotal === 0, JSON.stringify([toolReq.totalAmount, toolReq.estimatedTotal]));
  const note = await q("SELECT * FROM notifications WHERE title LIKE 'Machine unavailable%' ORDER BY id DESC LIMIT 1");
  check('Admin is notified, with who holds each serial', note.length && /SR00[123]/.test(note[0].message) && /Test Contractor|Tisha/.test(note[0].message), note[0]?.message);
  r = await api('GET', `/procurement/${toolReq.id}`, admin.token);
  check('request detail lists current holders per serial for the Admin decision', r.data.request.toolAvailability.available === 0 && r.data.request.toolAvailability.holders.length === 3);
  r = await api('GET', `/procurement/${toolReq.id}`, c1.token);
  check("requesting contractor does not see other contractors' holdings", r.data.request.toolAvailability.holders.length === 0);
  r = await api('POST', `/procurement/${toolReq.id}/tool-fulfil`, admin.token, { unit_id: sr3 });
  check('cannot complete an unapproved machine request', r.status === 400, r.msg);
  await api('PATCH', `/procurement/${toolReq.id}/status`, admin.token, { status: 'approved' });
  r = await api('POST', `/procurement/${toolReq.id}/tool-fulfil`, admin.token, { unit_id: sr3 });
  check('a serial held by someone else needs an explicit reassignment', r.status === 400 && /reassign/i.test(r.msg), r.msg);
  r = await api('POST', `/procurement/${toolReq.id}/tool-fulfil`, admin.token, { unit_id: sr3, reassign: true, return_date: '2026-10-06', start_date: '2026-10-07' });
  check('Admin authorises the reassignment of SR003 to the requesting contractor', r.status === 200 && r.data.request.status === 'received' && r.data.request.toolUnit.serialNumber === 'SR003', r.msg);
  const sr3now = (await q('SELECT * FROM tool_units WHERE id=?', [sr3]))[0];
  check('SR003 now sits with Contractor 1 on the requested project/site/task', sr3now.current_contractor_id === 1 && sr3now.current_project_id === 1 && sr3now.current_site_id === 1 && sr3now.current_task_id === 1);
  r = await api('POST', `/procurement/${toolReq.id}/tool-fulfil`, admin.token, { unit_id: sr3 });
  check('machine request cannot be fulfilled twice', r.status === 400);

  // ---- rented
  r = await api('POST', '/procurement', c1.token, { procurement_kind: 'project_site', item_type: 'tool', tool_id: BBM, tool_procurement_type: 'rented', rental_cost: 5000, rental_days: 2, quantity: 1, project_id: 1, site_id: 1, task_id: 1, status: 'requested' });
  const rentReq = r.data.request;
  check('rented machine request recorded with rate/day', r.status === 201 && rentReq.rentalCost === 5000, r.msg);
  if (rentReq.status === 'requested') await api('PATCH', `/procurement/${rentReq.id}/status`, c1.token, { status: 'pending_approval' });
  await api('PATCH', `/procurement/${rentReq.id}/status`, admin.token, { status: 'approved' });
  r = await api('POST', `/procurement/${rentReq.id}/tool-fulfil`, admin.token, { vendor_id: 1, serial_number: 'RENT-001', rate_per_day: 5000, rental_start_date: '2026-10-05', expected_return_date: '2026-10-06' });
  check('rental registered (vendor, serial, rate, period) and allocated', r.status === 200 && r.data.request.toolUnit.serialNumber === 'RENT-001', r.msg);
  check('planned rental total = 5,000 x 2 days = 10,000 on the vendor payable', Number(r.data.request.totalAmount) === 10000);
  const rentUnit = (await q("SELECT * FROM tool_units WHERE serial_number='RENT-001'"))[0];
  const rentAlloc = (await q('SELECT * FROM tool_allocations WHERE unit_id=? AND status="active"', [rentUnit.id]))[0];
  check('rented unit is tracked per serial like an owned one', rentUnit.ownership_type === 'rented' && rentAlloc);
  r = await api('POST', `/tools/allocations/${rentAlloc.id}/return`, admin.token, { returned_date: '2026-10-06', end_rental: true });
  check('rental cost allocated by actual use: 2 days x 5,000 = 10,000', r.status === 200 && r.data.allocation.rentalCostAllocated === 10000 && r.data.allocation.usageCharge === 0, JSON.stringify(r.data?.allocation));
  const rexp = (await q("SELECT * FROM expenses WHERE source_type='tool_rental' AND source_id=?", [rentAlloc.id]))[0];
  check('actual rental expense booked once to the Task/Project (Equipment Rental)', rexp && Number(rexp.amount) === 10000 && rexp.task_id === 1 && rexp.category === 'Equipment Rental');
  const rental = (await q('SELECT * FROM tool_rentals WHERE unit_id=?', [rentUnit.id]))[0];
  check('rental closed with actual dates and total', rental.status === 'returned' && Number(rental.total_cost) === 10000 && Number(rental.allocated_cost) === 10000);
  check("rented unit leaves the fleet after the rental ends", (await q('SELECT availability_status s FROM tool_units WHERE id=?', [rentUnit.id]))[0].s === 'retired');

  // ---- to be purchased
  r = await api('POST', '/procurement', c1.token, { procurement_kind: 'project_site', item_type: 'tool', tool_id: BBM, tool_procurement_type: 'to_be_purchased', estimated_rate: 50000, quantity: 1, project_id: 1, site_id: 1, task_id: 1, status: 'requested' });
  const buyReq = r.data.request;
  check('to-be-purchased request is not treated as rented or allocated', r.status === 201 && buyReq.toolProcurementType === 'to_be_purchased');
  if (buyReq.status === 'requested') await api('PATCH', `/procurement/${buyReq.id}/status`, c1.token, { status: 'pending_approval' });
  await api('PATCH', `/procurement/${buyReq.id}/status`, admin.token, { status: 'approved' });
  r = await api('POST', `/procurement/${buyReq.id}/tool-fulfil`, admin.token, { vendor_id: 1, serial_number: 'SR004', purchase_cost: 52000, purchase_date: '2026-10-08' });
  check('purchased machine registered as a company asset with actual cost and unique serial', r.status === 200 && Number(r.data.request.totalAmount) === 52000, r.msg);
  r = await api('POST', '/procurement', c1.token, { procurement_kind: 'project_site', item_type: 'tool', tool_id: BBM, tool_procurement_type: 'to_be_purchased', quantity: 1, project_id: 1, site_id: 1, task_id: 1, status: 'requested' });
  const buy2 = r.data.request;
  if (buy2.status === 'requested') await api('PATCH', `/procurement/${buy2.id}/status`, c1.token, { status: 'pending_approval' });
  await api('PATCH', `/procurement/${buy2.id}/status`, admin.token, { status: 'approved' });
  r = await api('POST', `/procurement/${buy2.id}/tool-fulfil`, admin.token, { vendor_id: 1, serial_number: 'SR004', purchase_cost: 100 });
  check('registering a purchase with an existing serial is refused', r.status === 400);

  // ---- the contractor form's existing Source options also work for machines
  const TROLLEY = 11;
  const trUnit = (await api('POST', '/tools/units', admin.token, { tool_id: TROLLEY, serial_number: 'TR-001', purchase_cost: 4000, purchase_date: '2026-02-01' })).data.unit.id;
  r = await api('POST', '/procurement', c1.token, { procurement_kind: 'contractor_supply', source_type: 'central_warehouse', item_type: 'tool', tool_id: TROLLEY, quantity: 1, project_id: 1, site_id: 1, task_id: 1, status: 'requested' });
  check('contractor requests a machine with Source = Central Warehouse (no vehicle asked)', r.status === 201 && r.data.request.toolProcurementType === 'purchased_owned', `${r.status} ${r.msg}`);
  const cwReq = r.data.request;
  check('machine request exposes no dispatch / confirm actions', !cwReq.canDispatch && !cwReq.canConfirmSource && !cwReq.canReceiveMovement);
  if (cwReq.status === 'requested') await api('PATCH', `/procurement/${cwReq.id}/status`, c1.token, { status: 'pending_approval' });
  await api('PATCH', `/procurement/${cwReq.id}/status`, admin.token, { status: 'approved' });
  r = await api('POST', `/procurement/${cwReq.id}/dispatch`, admin.token, { vehicle_number: 'X1' });
  check('a machine is never dispatched like stock', r.status === 400, r.msg);
  r = await api('POST', `/procurement/${cwReq.id}/fulfil`, admin.token, { vehicle_number: 'X1' });
  check('a machine is never received into material stock', r.status === 400, r.msg);
  r = await api('POST', `/procurement/${cwReq.id}/tool-fulfil`, admin.token, { unit_id: trUnit, start_date: '2026-10-09' });
  check('Admin allocates the chosen serial to the requester', r.status === 200 && r.data.request.toolUnit.serialNumber === 'TR-001', r.msg);
  check('no purchase value or vendor payable was created for the owned allocation', Number((await q('SELECT total_amount t FROM procurement_requests WHERE id=?', [cwReq.id]))[0].t || 0) === 0);
  r = await api('POST', `/tools/${TROLLEY}/allocate`, c1.token, { unit_id: trUnit, project_id: 1 });
  check('a contractor can never allocate a machine directly - it becomes an Admin request', r.status === 200 && r.data.status === 'pending_approval');

  // ============================================================ 7. FINANCE
  section('7. Finance: Budget vs Actual, ledger, no double counting');
  const bva0 = (await api('GET', '/finance/budget-vs-actual?projectId=1', admin.token)).data;
  const t1 = (rows) => rows.find((x) => x.taskId === 1);
  const matBefore = t1(bva0).materialActual;
  const costsBefore = (await api('GET', '/finance/project-costs?projectId=1', admin.token)).data[0];
  const unitCostExpected = Number((await q('SELECT AVG(unit_cost) a FROM warehouse_transactions WHERE warehouse_id=? AND material_id=? AND transaction_type="receipt" AND unit_cost>0', [C1WH, BRICKS]))[0].a);
  r = await api('POST', '/daily-work', c1.token, { project_id: 1, site_id: 1, task_id: 1, material_id: BRICKS, quantity_used: 5, work_done: 'laid bricks', progress_percentage: 30, excess_reason: 'test' }, { form: true });
  check('contractor consumes 5 bricks via daily work', r.status === 201 || r.status === 200, `${r.status} ${r.msg}`);
  const cons = (await q('SELECT * FROM daily_work_updates WHERE work_done = ? ORDER BY id DESC LIMIT 1', ['laid bricks']))[0];
  const consExp = (await q('SELECT * FROM expenses WHERE id=?', [cons.expense_id]))[0];
  check('consumption is costed at the actual linked unit cost x quantity', cons && Number(cons.material_cost) > 0 && near(cons.material_cost, 5 * Number(cons.unit_cost), 0.02) && near(cons.unit_cost, 20.01, 0.05), JSON.stringify([cons?.unit_cost, cons?.material_cost, unitCostExpected]));
  check('its expense carries the Task and source link', consExp && consExp.task_id === 1 && consExp.source_type === 'daily_work_material' && consExp.source_id === cons.id && near(consExp.amount, cons.material_cost));
  const bva1 = (await api('GET', '/finance/budget-vs-actual?projectId=1', admin.token)).data;
  check('Budget vs Actual: Material Actual is no longer missing (historic 6,000 for Task 1 preserved)', matBefore === 6000, String(matBefore));
  check('Budget vs Actual: new consumption adds exactly its cost once', near(t1(bva1).materialActual - matBefore, cons.material_cost, 0.01), `${t1(bva1).materialActual} - ${matBefore}`);
  const row1 = t1(bva1);
  check('Budget vs Actual exposes Material Budget, Actual, Remaining and Variance', row1.materialBudget === 70000 && near(row1.materialRemaining, row1.materialBudget - row1.materialActual) && near(row1.materialVariance, row1.materialBudget - row1.materialActual));
  const costsAfter = (await api('GET', '/finance/project-costs?projectId=1', admin.token)).data[0];
  check('Project Summary material moved by the same single amount (no double count)', near(costsAfter.materialCost - costsBefore.materialCost, cons.material_cost, 0.01));
  check('Project Summary machine/tool cost includes the usage charges + rental (6,000 + ...)', costsAfter.machineToolCost >= 16000, String(costsAfter.machineToolCost));
  const act = (await api('GET', '/finance/actual-expenses?projectId=1&pageSize=50', admin.token)).data;
  check('Actual Expenses lists each consumption exactly once', act.rows.filter((x) => x.sourceTransaction === `DWU-MAT-${cons.id}`).length === 1 && !act.rows.some((x) => x.sourceTransaction === consExp.expense_number));
  check('Actual Expenses total equals Project Summary total actual', near(act.totalAmount, costsAfter.totalActualCost, 0.02), `${act.totalAmount} vs ${costsAfter.totalActualCost}`);

  const led = (await api('GET', '/finance/procurement-ledger?pageSize=50', admin.token)).data;
  const types = new Set(led.rows.map((x) => x.transactionType));
  check('ledger has clear transaction types (purchase, transfer, consumption, machine allocation/usage/rental)', ['vendor_purchase', 'internal_transfer', 'material_consumption', 'machine_allocation', 'machine_usage_charge', 'machine_rental', 'machine_purchase'].every((t) => types.has(t)), [...types].join(','));
  check('internal transfers never count as an expense', led.rows.filter((x) => x.transactionType === 'internal_transfer').every((x) => x.affectsExpense === false));
  check('vendor purchases are inventory/payable only, not expense', led.rows.filter((x) => x.transactionType === 'vendor_purchase').every((x) => x.affectsExpense === false && x.affectsInventory));
  check('owned machine allocation creates no expense and no value', led.rows.filter((x) => x.transactionType === 'machine_allocation').every((x) => x.affectsExpense === false && x.value === 0));
  const tr = led.rows.find((x) => x.transactionType === 'internal_transfer');
  check('transfer shows source, destination, quantity and actual value', tr && tr.source && tr.destination && tr.quantity === 10 && tr.value > 0, JSON.stringify(tr));
  const vpEntry = led.rows.find((x) => x.transactionType === 'vendor_purchase' && x.referenceNumber === vp.requestNumber);
  check('vendor purchase value recorded once at the actual cost (100 x 25)', vpEntry && vpEntry.value === 2500 && vpEntry.costPerUnit === 25);
  const ledProj = (await api('GET', '/finance/procurement-ledger?projectId=1&pageSize=50', admin.token)).data;
  const ledExpense = ledProj.rows.filter((x) => x.affectsExpense).reduce((s, x) => s + x.value, 0);
  check('ledger project expense (consumption + machine) equals Project Summary material + machine', near(ledProj.summary.projectExpenseTotal, ledExpense, 0.02) && near(ledExpense, costsAfter.materialCost + costsAfter.machineToolCost, 0.05), `${ledExpense} vs ${costsAfter.materialCost + costsAfter.machineToolCost}`);
  const sample = led.rows.find((x) => x.transactionType === 'machine_usage_charge');
  r = await api('GET', `/finance/ledger-entry?type=${sample.transactionType}&id=${sample.sourceId}`, admin.token);
  check('a ledger entry opens down to its source transaction', r.status === 200 && r.data.related.allocation && r.data.entry.machineSerial);
  r = await api('GET', `/finance/ledger-entry?type=internal_transfer&id=${mv.id}`, admin.token);
  check('transfer entry shows the movement and its issue/receive ledger rows', r.status === 200 && r.data.related.movement.issue_tx && r.data.related.movement.receive_tx);
  const pay = (await api('GET', '/finance/vendor-payables', admin.token)).data;
  check('Vendor Payables still work and exclude cancelled/owned allocations', pay.rows.length >= 2 && !pay.rows.some((x) => x.paymentStatus === undefined));
  r = await api('POST', '/finance/vendor-payments', admin.token, { procurementRequestId: vp.id, amount: 1000, paymentDate: '2026-10-09' });
  check('recording a vendor payment works and stays separate from the purchase', [200, 201].includes(r.status) && r.data.amountDue === 1500, JSON.stringify(r.data));
  const led2 = (await api('GET', '/finance/procurement-ledger?type=vendor_payment&pageSize=10', admin.token)).data;
  check('vendor payment appears as its own non-expense entry', led2.rows.length === 1 && led2.rows[0].value === 1000 && led2.rows[0].affectsExpense === false);
  check('Client payments + profitability still respond', (await api('GET', '/finance/client-payments', admin.token)).status === 200 && (await api('GET', '/finance/profitability', admin.token)).status === 200);

  // ---------------------------------------------------------------- pure maths
  section('Usage-day maths (pure)');
  const c = toolUnitService.computeUsage({ startDate: '2026-10-01', returnedDate: '2026-10-03', chargePolicy: 'fixed_total', chargeTotal: 10000, chargeDays: 5 });
  check('10,000 / 5 days, used 3 days = 6,000 (4,000 unbilled)', c.usageDays === 3 && c.usageCharge === 6000 && c.unbilledBalance === 4000 && c.dailyChargeRate === 2000);
  const c2 = toolUnitService.computeUsage({ startDate: '2026-10-01', returnedDate: '2026-10-03', chargePolicy: 'fixed_total', chargeTotal: 10000, chargeDays: 5, unusedPolicy: 'full_amount' });
  check('full_amount policy charges the whole approved amount', c2.usageCharge === 10000 && c2.unbilledBalance === 0);
  const c3 = toolUnitService.computeUsage({ startDate: '2026-10-01', returnedDate: '2026-10-01', chargePolicy: 'per_day_rate', chargeRate: 1500 });
  check('same-day return counts one day', c3.usageDays === 1 && c3.usageCharge === 1500);
  const c4 = toolUnitService.computeUsage({ startDate: '2026-10-05', returnedDate: '2026-10-06', rentalRatePerDay: 5000 });
  check('rental: 5,000/day x 2 days = 10,000', c4.rentalCostAllocated === 10000 && c4.usageCharge === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log('Failed:\n - ' + failures.join('\n - '));
  server.close();
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('TEST HARNESS ERROR', e);
  process.exit(2);
});
