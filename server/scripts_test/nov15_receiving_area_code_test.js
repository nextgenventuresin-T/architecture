'use strict';
/**
 * End-to-end test (real Express app + real MySQL) for the 2026-11-15 changes:
 *   1. Editable, unique project code (create / edit / duplicate / blank / format)
 *   2. Project + site area value and unit
 *   3. Multi-item "Central Warehouse -> Site": validation, stock out at dispatch only
 *   4. Site Engineer / Project Manager receiving: scope, vehicle check, over-receipt,
 *      duplicate receipt, stock ledger posted exactly once
 *   5. Vendor order to a site received by its engineer (partial deliveries, no excess)
 *
 * It clones the configured database into <name>_test and ONLY ever touches the clone.
 * Run: node scripts_test/nov15_receiving_area_code_test.js
 */
const path = require('path');
const { execFileSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const liveDb = (process.env.DB_NAME || 'architecture_erp').replace(/_test$/, '');
const testDb = `${liveDb}_test`;
execFileSync('node', [path.join(__dirname, 'clone_test_db.js')], { stdio: 'inherit', env: { ...process.env, DB_NAME: liveDb } });
execFileSync('node', [path.join(__dirname, '..', 'src', 'db', 'migrate.js')], { stdio: 'ignore', env: { ...process.env, DB_NAME: testDb } });
process.env.DB_NAME = testDb;
process.env.NODE_ENV = 'test';

const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/tokens');
const warehouseService = require('../src/services/warehouseService');

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; failures.push(name); console.log(`  FAIL  ${name} ${detail}`); }
}
const section = (t) => console.log(`\n== ${t}`);
let base;
async function api(method, url, token, body) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}/api${url}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, data: json?.data, msg: json?.error?.message || '', details: json?.error?.details || {} };
}
const q = async (sql, params) => (await pool.query(sql, params))[0];
const stock = async (wid, mid) => Number((await q('SELECT COALESCE(SUM(quantity),0) n FROM warehouse_stock WHERE warehouse_id=? AND material_id=?', [wid, mid]))[0].n);
const show = (r) => `${r.status} ${r.msg} ${JSON.stringify(r.details)}`;

async function mkUser(email, roleSlug, name) {
  const [[role]] = await pool.query('SELECT id FROM roles WHERE slug=?', [roleSlug]);
  const hash = await bcrypt.hash('x', 4);
  const [r] = await pool.query('INSERT INTO users (full_name,email,password_hash,role_id,is_active) VALUES (?,?,?,?,1)', [name, email, hash, role.id]);
  return { id: r.insertId, email, role: roleSlug, token: signAccessToken({ id: r.insertId, role: roleSlug, email }) };
}
async function mkEmployee(user, name, designation) {
  const [r] = await pool.query('INSERT INTO employees (full_name, designation, email, user_id) VALUES (?,?,?,?)', [name, designation, user?.email || null, user?.id || null]);
  return r.insertId;
}

(async () => {
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const stamp = Date.now().toString(36).toUpperCase();

  const [[adminRow]] = await pool.query("SELECT u.id, u.email FROM users u JOIN roles r ON r.id=u.role_id WHERE r.slug='admin' AND u.is_active=1 ORDER BY u.id LIMIT 1");
  const admin = { ...adminRow, token: signAccessToken({ id: adminRow.id, role: 'admin', email: adminRow.email }) };
  const [[material]] = await pool.query('SELECT id, name, unit FROM materials ORDER BY id LIMIT 1');

  // ------------------------------------------------------------ 1. project code
  section('1. Editable project code');
  const code = `TST-${stamp}`;
  const projectBody = { name: `Nov15 Test ${stamp}`, location: 'Test City', start_date: '2026-11-15', expected_completion: '2027-05-15', project_type: 'residential' };
  let r = await api('POST', '/projects', admin.token, { ...projectBody, code, area_value: 2400.5, area_unit: 'sqft' });
  check('create with a typed code', r.status === 201 && r.data?.project?.code === code, show(r));
  const projectId = r.data?.project?.id;
  check('project area saved with unit', r.data?.project?.area?.value === 2400.5 && r.data?.project?.area?.unit === 'sqft', JSON.stringify(r.data?.project?.area));
  r = await api('POST', '/projects', admin.token, { ...projectBody, name: `${projectBody.name} dup`, code: code.toLowerCase() });
  check('duplicate code rejected (case-insensitive)', r.status === 400 && /already in use/.test(r.details.code || ''), show(r));
  r = await api('POST', '/projects', admin.token, { ...projectBody, name: `${projectBody.name} bad`, code: 'BAD CODE!' });
  check('code with spaces / symbols rejected', r.status === 400 && r.details.code, show(r));
  r = await api('POST', '/projects', admin.token, { ...projectBody, name: `${projectBody.name} auto`, area_value: 10, area_unit: 'acre' });
  check('invalid area unit rejected', r.status === 400 && r.details.area_unit, show(r));
  r = await api('POST', '/projects', admin.token, { ...projectBody, name: `${projectBody.name} auto` });
  check('blank code auto-generates a PRJ code', r.status === 201 && /^PRJ-\d{4,}$/.test(r.data?.project?.code || ''), show(r));
  const autoId = r.data?.project?.id;
  r = await api('PATCH', `/projects/${autoId}`, admin.token, { code });
  check('editing to another project\'s code rejected', r.status === 400 && r.details.code, show(r));
  const newCode = `${code}-B`;
  r = await api('PATCH', `/projects/${projectId}`, admin.token, { code: newCode, area_value: 120, area_unit: 'sqm' });
  check('code + area updated', r.status === 200 && r.data?.project?.code === newCode && r.data?.project?.area?.unit === 'sqm', show(r));
  r = await api('PATCH', `/projects/${projectId}`, admin.token, { code: '' });
  check('blank code on edit keeps the existing code', r.status === 200 && r.data?.project?.code === newCode, show(r));

  // ------------------------------------------------------------ fixtures
  const cUser = await mkUser(`c-${stamp}@t.local`, 'contractor', 'Contractor N15');
  const [cr] = await pool.query("INSERT INTO contractors (user_id,name,type,status) VALUES (?,?, 'other','active')", [cUser.id, `Contractor N15 ${stamp}`]);
  const contractorId = cr.insertId;
  const engUser = await mkUser(`eng-${stamp}@t.local`, 'employee', 'Site Engineer A');
  const engId = await mkEmployee(engUser, 'Site Engineer A', 'Site Engineer');
  const otherUser = await mkUser(`emp-${stamp}@t.local`, 'employee', 'Clerk');
  await mkEmployee(otherUser, 'Clerk', 'Accountant');
  const pmUser = await mkUser(`pm-${stamp}@t.local`, 'project_manager', 'PM N15');
  const pmEmp = await mkEmployee(pmUser, 'PM N15', 'Project Manager');
  await pool.query('UPDATE projects SET project_manager_id=? WHERE id=?', [pmEmp, projectId]);

  // ------------------------------------------------------------ 2. sites + area
  section('2. Site area');
  r = await api('POST', `/projects/${projectId}/sites`, admin.token, { name: 'Site A', address: 'Plot 1', contractor_id: contractorId, site_engineer_id: engId, area_value: 800, area_unit: 'sqm' });
  const siteA = r.data?.site?.id || r.data?.id;
  check('site A created with area', r.status === 201 && siteA, show(r));
  r = await api('POST', `/projects/${projectId}/sites`, admin.token, { name: 'Site B', address: 'Plot 2' });
  const siteB = r.data?.site?.id || r.data?.id;
  check('site B (no contractor, PM-run) created', r.status === 201 && siteB, show(r));
  const [[sa]] = await pool.query('SELECT area_value, area_unit FROM sites WHERE id=?', [siteA]);
  check('site area stored', Number(sa.area_value) === 800 && sa.area_unit === 'sqm', JSON.stringify(sa));
  r = await api('PATCH', `/sites/${siteB}`, admin.token, { area_value: 1500, area_unit: 'ft' });
  check('admin edits site area', r.status === 200, show(r));
  r = await api('PATCH', `/sites/${siteB}`, engUser.token, { area_value: 1 });
  check('employee cannot edit a site', r.status === 403, show(r));
  // The PM (now assigned to the project) must have its scope resolved on each request.

  // ------------------------------------------------------------ 3. central -> site batch
  section('3. Multi-item Central Warehouse -> Site');
  const [[central]] = await pool.query("SELECT id FROM warehouses WHERE type='central' AND status='active' ORDER BY id LIMIT 1");
  await warehouseService.receiveStock({ material_id: material.id, warehouse_id: central.id, quantity: 100, unit: material.unit, reference: `T-${stamp}`, unit_cost: 50, total_cost: 5000, vehicle_number: 'PB01 SEED 0001', notes: 'test stock' }, admin.id);

  r = await api('POST', '/procurement/batches', admin.token, { flow: 'central_site', status: 'requested', items: [{ item_type: 'material', material_id: material.id, quantity: 4, project_id: projectId }] });
  check('line without a site rejected', r.status === 400 && r.details['items.0.site_id'], show(r));
  r = await api('POST', '/procurement/batches', cUser.token, { flow: 'central_site', status: 'requested', items: [{ item_type: 'material', material_id: material.id, quantity: 4, project_id: projectId, site_id: siteA }] });
  check('contractor cannot raise Central -> Site', r.status === 403, show(r));

  r = await api('POST', '/procurement/batches', admin.token, {
    flow: 'central_site', status: 'requested', items: [
      { item_type: 'material', material_id: material.id, quantity: 10, project_id: projectId, site_id: siteA },
      { item_type: 'material', material_id: material.id, quantity: 5, project_id: projectId, site_id: siteB },
    ],
  });
  check('batch created', r.status === 201 || r.status === 200, show(r));
  const batchId = r.data?.batch?.id;
  check('flow label', r.data?.batch?.flowLabel === 'Central Warehouse → Site', r.data?.batch?.flowLabel);
  const items = await q('SELECT * FROM procurement_requests WHERE batch_id=? ORDER BY id', [batchId]);
  const [itemA, itemB] = items;
  const [[cWh]] = await pool.query('SELECT id FROM warehouses WHERE contractor_id=? LIMIT 1', [contractorId]);
  const [[storeB]] = await pool.query("SELECT id FROM warehouses WHERE type='site' AND site_id=? LIMIT 1", [siteB]);
  check('item A goes to the site contractor\'s warehouse', itemA?.procurement_kind === 'contractor_supply' && itemA.source_type === 'central_warehouse'
    && Number(itemA.destination_contractor_id) === contractorId && Number(itemA.destination_warehouse_id) === Number(cWh?.id), JSON.stringify(itemA && { k: itemA.procurement_kind, d: itemA.destination_warehouse_id }));
  check('item B goes to the PM-run Site Store', itemB?.destination_type === 'site_store' && Number(itemB.destination_warehouse_id) === Number(storeB?.id), JSON.stringify(itemB && { t: itemB.destination_type, d: itemB.destination_warehouse_id }));
  const srcWh = Number(itemA.source_warehouse_id);
  const srcBefore = await stock(srcWh, material.id);
  const destABefore = await stock(cWh.id, material.id);
  const financeBefore = Number((await q('SELECT COUNT(*) n FROM expenses'))[0].n);

  r = await api('POST', `/procurement/batches/${batchId}/submit`, admin.token, {});
  check('submit', r.status === 200 && r.data.results.every((x) => x.ok), show(r));
  r = await api('POST', `/procurement/batches/${batchId}/approve`, admin.token, {});
  check('approve', r.status === 200 && r.data.results.every((x) => x.ok), show(r));
  check('approval moved no stock', (await stock(srcWh, material.id)) === srcBefore);
  r = await api('POST', `/procurement/batches/${batchId}/dispatch`, admin.token, {});
  check('dispatch needs a vehicle number', r.status === 400 && r.details.vehicle_number, show(r));
  r = await api('POST', `/procurement/batches/${batchId}/dispatch`, admin.token, { vehicle_number: 'PB10 TS 1515', driver_name: 'Ravi', driver_phone: '9800000000' });
  check('dispatch both items', r.status === 200 && r.data.results.length === 2 && r.data.results.every((x) => x.ok), show(r));
  check('Central stock reduced by exactly 15 at dispatch', near(await stock(srcWh, material.id), srcBefore - 15), `${srcBefore} -> ${await stock(srcWh, material.id)}`);
  check('site stock unchanged until received', (await stock(cWh.id, material.id)) === destABefore);
  const [mvA] = await q('SELECT * FROM material_movements WHERE procurement_request_id=?', [itemA.id]);
  const [mvB] = await q('SELECT * FROM material_movements WHERE procurement_request_id=?', [itemB.id]);

  // ------------------------------------------------------------ 4. engineer / PM receiving
  section('4. Site Engineer and Project Manager receiving');
  r = await api('GET', '/site-receiving/incoming', engUser.token);
  const engList = r.data?.deliveries || [];
  check('engineer sees site A shipment', engList.some((d) => d.kind === 'movement' && d.id === mvA.id), show(r));
  check('engineer does not see site B shipment', !engList.some((d) => d.id === mvB.id));
  check('plate number not exposed to receiver', engList.every((d) => d.vehicleNumber === undefined && typeof d.vehicleRecorded === 'boolean'));
  r = await api('GET', '/site-receiving/incoming', otherUser.token);
  check('non-engineer employee has no sites', r.status === 200 && r.data.sites.length === 0 && r.data.deliveries.length === 0, show(r));
  r = await api('GET', '/site-receiving/incoming', cUser.token);
  check('contractor cannot use the engineer endpoint', r.status === 403, show(r));
  r = await api('POST', `/site-receiving/movements/${mvB.id}/receive`, engUser.token, { vehicle_number: 'PB10 TS 1515', received_quantity: 5 });
  check('engineer cannot receive at a site they are not on', r.status === 403, show(r));
  r = await api('POST', `/site-receiving/movements/${mvA.id}/receive`, otherUser.token, { vehicle_number: 'PB10 TS 1515', received_quantity: 10 });
  check('unassigned employee cannot receive', r.status === 403, show(r));
  r = await api('POST', `/site-receiving/movements/${mvA.id}/receive`, engUser.token, { vehicle_number: 'PB10 XX 9999', received_quantity: 10 });
  check('wrong vehicle rejected', r.status === 400 && r.details.vehicle_number, show(r));
  r = await api('POST', `/site-receiving/movements/${mvA.id}/receive`, engUser.token, { vehicle_number: 'PB10 TS 1515', received_quantity: 11 });
  check('over-receiving rejected', r.status === 400 && r.details.received_quantity, show(r));
  r = await api('POST', `/site-receiving/movements/${mvA.id}/receive`, engUser.token, { vehicle_number: 'pb10ts1515', received_quantity: 10, receiving_date: '2026-11-15' });
  check('engineer receives with the verified vehicle', r.status === 200 && r.data.status === 'received', show(r));
  check('site contractor stock +10', near(await stock(cWh.id, material.id), destABefore + 10), `${destABefore} -> ${await stock(cWh.id, material.id)}`);
  r = await api('POST', `/site-receiving/movements/${mvA.id}/receive`, engUser.token, { vehicle_number: 'PB10 TS 1515', received_quantity: 10 });
  check('second receipt of the same shipment rejected', r.status === 400, show(r));
  check('site stock posted only once', near(await stock(cWh.id, material.id), destABefore + 10));
  const ledgerA = await q("SELECT COUNT(*) n FROM warehouse_transactions WHERE warehouse_id=? AND procurement_request_id=? AND transaction_type IN ('receipt','in','receive','inward')", [cWh.id, itemA.id]).catch(() => [{ n: -1 }]);
  const ledgerAll = await q('SELECT COUNT(*) n FROM warehouse_transactions WHERE warehouse_id=? AND procurement_request_id=?', [cWh.id, itemA.id]);
  check('one ledger row at the site warehouse for item A', Number(ledgerAll[0].n) === 1, `rows=${ledgerAll[0].n} (typed=${ledgerA[0].n})`);
  const [[reqA]] = await pool.query('SELECT status FROM procurement_requests WHERE id=?', [itemA.id]);
  check('request A closed as received', reqA.status === 'received', reqA.status);

  const storeBefore = await stock(storeB.id, material.id);
  r = await api('GET', '/site-receiving/incoming', pmUser.token);
  check('PM sees site B shipment', (r.data?.deliveries || []).some((d) => d.id === mvB.id), show(r));
  r = await api('POST', `/site-receiving/movements/${mvB.id}/receive`, pmUser.token, { vehicle_number: 'PB10 TS 1515', received_quantity: 5 });
  check('PM receives into Site Store', r.status === 200 && r.data.status === 'received', show(r));
  check('Site Store stock +5', near(await stock(storeB.id, material.id), storeBefore + 5));
  check('internal stock move created no expense', Number((await q('SELECT COUNT(*) n FROM expenses'))[0].n) === financeBefore);

  // ------------------------------------------------------------ 5. vendor order to site A
  section('5. Vendor order received by the site engineer');
  const [vr] = await pool.query("INSERT INTO vendors (name, status) VALUES (?, 'active')", [`Vendor N15 ${stamp}`]);
  r = await api('POST', '/procurement', admin.token, {
    procurement_kind: 'project_site', item_type: 'material', material_id: material.id, quantity: 8, unit: material.unit,
    project_id: projectId, site_id: siteA, vendor_id: vr.insertId, supplier: 'Vendor N15', estimated_rate: 40, priority: 'medium', status: 'requested',
    required_date: '2026-11-30',
  });
  check('single-item vendor request still works', r.status === 201, show(r));
  const vreqId = r.data?.request?.id || r.data?.id;
  for (const st of ['pending_approval', 'approved']) {
    r = await api('PATCH', `/procurement/${vreqId}/status`, admin.token, { status: st });
  }
  check('approved', r.status === 200, show(r));
  r = await api('POST', `/procurement/${vreqId}/order`, admin.token, { vehicle_number: 'HR26 AB 0001', driver_name: 'Sonu' });
  check('order placed', r.status === 200, show(r));
  const destBeforeV = await stock(cWh.id, material.id);
  r = await api('GET', '/site-receiving/incoming', engUser.token);
  check('engineer sees the vendor order', (r.data?.deliveries || []).some((d) => d.kind === 'vendor_order' && d.id === vreqId && d.remainingQuantity === 8), show(r));
  r = await api('POST', `/site-receiving/orders/${vreqId}/receive`, engUser.token, { vehicle_number: 'HR26 AB 0001', received_quantity: 3 });
  check('partial delivery 3 of 8', r.status === 200 && r.data.status === 'partially_received' && r.data.remainingQuantity === 5, show(r));
  r = await api('POST', `/site-receiving/orders/${vreqId}/receive`, engUser.token, { vehicle_number: 'HR26 AB 0001', received_quantity: 6 });
  check('cannot receive more than remains', r.status === 400 && r.details.received_quantity, show(r));
  r = await api('POST', `/site-receiving/orders/${vreqId}/receive`, engUser.token, { vehicle_number: 'HR26 AB 0001', received_quantity: 5 });
  check('rest delivered, order received', r.status === 200 && r.data.status === 'received', show(r));
  r = await api('POST', `/site-receiving/orders/${vreqId}/receive`, engUser.token, { vehicle_number: 'HR26 AB 0001', received_quantity: 1 });
  check('no receipt after fully received', r.status === 400, show(r));
  check('site stock +8 in total', near(await stock(cWh.id, material.id), destBeforeV + 8));
  const receipts = await q('SELECT COUNT(*) n, SUM(transport_cost) t FROM procurement_receipts WHERE procurement_request_id=?', [vreqId]);
  check('two receipt rows, no freight booked by the engineer', Number(receipts[0].n) === 2 && Number(receipts[0].t || 0) === 0, JSON.stringify(receipts[0]));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log('Failed:', failures.join(' | '));
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('TEST HARNESS ERROR', e); process.exit(1); });

function near(a, b, eps = 0.001) { return Math.abs(Number(a) - Number(b)) <= eps; }
