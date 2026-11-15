'use strict';
/**
 * End-to-end test (real Express app + real MySQL) for the 2026-11-15 (part 2) changes:
 *   1. Area measurement (value + unit) on subtasks
 *   2. Litres for bucket / liquid material: litres per unit on the procurement,
 *      litres sent on a movement, litres received, litres used in daily work
 *   3. Vendor purchases without a vehicle number; "vendor confirmed" records the
 *      dispatch (vehicle mandatory) and nothing can be received before that
 *
 * It clones the configured database into <name>_test and ONLY ever touches the clone.
 * Run: node scripts_test/nov15b_litres_vendor_subtask_area_test.js
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
const one = async (sql, params) => (await q(sql, params))[0];
const stock = async (wid, mid) => Number((await one('SELECT COALESCE(SUM(quantity),0) n FROM warehouse_stock WHERE warehouse_id=? AND material_id=?', [wid, mid])).n);
const show = (r) => `${r.status} ${r.msg} ${JSON.stringify(r.details)}`;
const near = (a, b, eps = 0.001) => Math.abs(Number(a) - Number(b)) <= eps;

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
async function approve(id, token) {
  let r;
  for (const st of ['pending_approval', 'approved']) r = await api('PATCH', `/procurement/${id}/status`, token, { status: st });
  return r;
}

(async () => {
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const stamp = Date.now().toString(36).toUpperCase();

  const [[adminRow]] = await pool.query("SELECT u.id, u.email FROM users u JOIN roles r ON r.id=u.role_id WHERE r.slug='admin' AND u.is_active=1 ORDER BY u.id LIMIT 1");
  const admin = { ...adminRow, token: signAccessToken({ id: adminRow.id, role: 'admin', email: adminRow.email }) };

  // ------------------------------------------------------------ fixtures
  let r = await api('POST', '/projects', admin.token, { name: `Nov15b ${stamp}`, location: 'Test City', start_date: '2026-11-15', expected_completion: '2027-05-15', project_type: 'residential' });
  const projectId = r.data?.project?.id;
  check('project created', r.status === 201 && projectId, show(r));
  const cUser = await mkUser(`c-${stamp}@t.local`, 'contractor', 'Contractor N15b');
  const [cr] = await pool.query("INSERT INTO contractors (user_id,name,type,status) VALUES (?,?, 'other','active')", [cUser.id, `Contractor N15b ${stamp}`]);
  const contractorId = cr.insertId;
  const cToken = signAccessToken({ id: cUser.id, role: 'contractor', email: cUser.email });
  const engUser = await mkUser(`eng-${stamp}@t.local`, 'employee', 'Site Engineer B');
  const engId = await mkEmployee(engUser, 'Site Engineer B', 'Site Engineer');
  r = await api('POST', `/projects/${projectId}/sites`, admin.token, { name: 'Site P', address: 'Plot 9', contractor_id: contractorId, site_engineer_id: engId });
  const siteId = r.data?.site?.id || r.data?.id;
  check('site with contractor + engineer', r.status === 201 && siteId, show(r));
  await pool.query('UPDATE projects SET contractor_id=? WHERE id=?', [contractorId, projectId]);
  const [mr] = await pool.query(
    "INSERT INTO materials (name, code, category, unit, default_rate) VALUES (?, ?, 'Paint', 'bucket', 1500)",
    [`Wall Emulsion ${stamp}`, `PNT-${stamp}`]
  );
  const paintId = mr.insertId;
  const [[bags]] = await pool.query("SELECT id, unit FROM materials WHERE unit='bags' ORDER BY id LIMIT 1");
  const [vr] = await pool.query("INSERT INTO vendors (name, status) VALUES (?, 'active')", [`Vendor N15b ${stamp}`]);
  const vendorId = vr.insertId;

  // ------------------------------------------------------------ 1. subtask area
  section('1. Area on subtasks');
  r = await api('POST', '/tasks', admin.token, { project_id: projectId, site_id: siteId, name: 'Painting', start_date: '2026-11-16', end_date: '2026-12-16', duration_days: 31 });
  const taskId = r.data?.task?.id || r.data?.id;
  check('main task created', r.status === 201 && taskId, show(r));
  r = await api('POST', `/tasks/${taskId}/subtasks`, admin.token, {
    name: 'Ground floor walls', area_value: 1200, area_unit: 'sqft',
    materials: [{ material_id: paintId, quantity: 20, cost_per_unit: 1500 }],
  });
  const sub = r.data?.subtasks?.find((s) => s.name === 'Ground floor walls');
  check('subtask created with area', r.status === 201 && sub?.areaMeasure?.value === 1200 && sub.areaMeasure.unit === 'sqft', `${show(r)} ${JSON.stringify(sub?.areaMeasure)}`);
  const subtaskId = sub?.id;
  r = await api('POST', `/tasks/${taskId}/subtasks`, admin.token, { name: 'Bad unit', area_value: 10, area_unit: 'acre' });
  check('invalid subtask area unit rejected', r.status === 400 && r.details.area_unit, show(r));
  r = await api('POST', `/tasks/${taskId}/subtasks`, admin.token, { name: 'Negative', area_value: -5, area_unit: 'sqm' });
  check('negative subtask area rejected', r.status === 400 && r.details.area_value, show(r));
  r = await api('PUT', `/tasks/${taskId}/subtasks/${subtaskId}`, admin.token, { area_value: 111.5, area_unit: 'sqm' });
  let s2 = r.data?.subtasks?.find((s) => s.id === subtaskId);
  check('subtask area updated', r.status === 200 && s2?.areaMeasure?.value === 111.5 && s2.areaMeasure.unit === 'sqm', `${show(r)} ${JSON.stringify(s2?.areaMeasure)}`);
  r = await api('PUT', `/tasks/${taskId}/subtasks/${subtaskId}`, admin.token, { progress: 10 });
  s2 = r.data?.subtasks?.find((s) => s.id === subtaskId);
  check('area kept when not sent', s2?.areaMeasure?.value === 111.5, JSON.stringify(s2?.areaMeasure));
  r = await api('GET', `/tasks/${taskId}/subtasks`, admin.token);
  const picker = (Array.isArray(r.data) ? r.data : r.data?.subtasks || []).find((s) => s.id === subtaskId);
  check('subtask picker list carries the area', picker?.areaMeasure?.unit === 'sqm', show(r));
  r = await api('PUT', `/tasks/${taskId}/subtasks/${subtaskId}`, admin.token, { area_value: null });
  s2 = r.data?.subtasks?.find((s) => s.id === subtaskId);
  check('subtask area cleared', r.status === 200 && s2 && s2.areaMeasure === null, `${show(r)} ${JSON.stringify(s2?.areaMeasure)}`);
  await api('PUT', `/tasks/${taskId}/subtasks/${subtaskId}`, admin.token, { area_value: 1200, area_unit: 'sqft' });
  const dbSub = await one('SELECT area_value, area_unit FROM task_subtasks WHERE id=?', [subtaskId]);
  check('subtask area stored in task_subtasks', Number(dbSub.area_value) === 1200 && dbSub.area_unit === 'sqft', JSON.stringify(dbSub));
  r = await api('PUT', `/tasks/${taskId}/subtasks/${subtaskId}`, cToken, { area_value: 5, area_unit: 'sqm' });
  const dbSub2 = await one('SELECT area_value FROM task_subtasks WHERE id=?', [subtaskId]);
  check('contractor cannot change a subtask area', Number(dbSub2.area_value) === 1200, `${show(r)} now=${dbSub2.area_value}`);

  // ------------------------------------------------------------ 2. vendor -> central, no vehicle
  section('2. Vendor -> Central Warehouse without a vehicle, then vendor confirms');
  const [[central]] = await pool.query("SELECT id FROM warehouses WHERE type='central' AND status='active' ORDER BY id LIMIT 1");
  r = await api('POST', '/procurement', admin.token, {
    procurement_kind: 'central_purchase', source_type: 'supplier', item_type: 'material', material_id: paintId, quantity: 10, unit: 'bucket',
    vendor_id: vendorId, supplier: 'Vendor N15b', estimated_rate: 1500, purchase_rate: 1500, litres_per_unit: 20, status: 'requested',
  });
  const cpId = r.data?.request?.id;
  check('central purchase raised with NO vehicle number', r.status === 201 && cpId && !r.data.request.vehicleNumber, show(r));
  check('litres per unit + total litres stored', r.data?.request?.isLiquid === true && r.data.request.litresPerUnit === 20 && r.data.request.totalLitres === 200, JSON.stringify(r.data?.request && { l: r.data.request.isLiquid, p: r.data.request.litresPerUnit, t: r.data.request.totalLitres }));
  r = await approve(cpId, admin.token);
  check('approved and awaiting vendor confirmation', r.status === 200 && r.data.request.awaitingVendorDispatch === true && r.data.request.canRecordVendorDispatch === true, show(r));
  r = await api('POST', `/procurement/${cpId}/fulfil`, admin.token, { vehicle_number: 'MH12 AB 1111', purchase_rate: 1500, receiving_date: '2026-11-15' });
  check('cannot receive before the vendor dispatch is recorded', r.status === 400 && /not confirmed/.test(r.details.vehicle_number || ''), show(r));
  r = await api('POST', `/procurement/${cpId}/vendor-dispatch`, admin.token, { driver_name: 'Raju' });
  check('vendor confirmation needs the vehicle number', r.status === 400 && r.details.vehicle_number, show(r));
  r = await api('POST', `/procurement/${cpId}/vendor-dispatch`, cToken, { vehicle_number: 'MH12 AB 1111' });
  check('contractor cannot record a vendor dispatch', r.status === 403, show(r));
  r = await api('POST', `/procurement/${cpId}/vendor-dispatch`, admin.token, { vehicle_number: 'MH12 AB 1111', driver_name: 'Raju', driver_phone: '9811111111', challan_number: 'DC-77' });
  check('vendor confirmed - vehicle recorded', r.status === 200 && r.data.request.vehicleNumber === 'MH12 AB 1111' && r.data.request.vendorConfirmedAt && r.data.request.awaitingVendorDispatch === false && r.data.request.challanNumber === 'DC-77', show(r));
  const centralBefore = await stock(central.id, paintId);
  r = await api('POST', `/procurement/${cpId}/fulfil`, admin.token, { vehicle_number: 'MH12 XX 0000', purchase_rate: 1500, receiving_date: '2026-11-15' });
  check('wrong vehicle still rejected', r.status === 400 && r.details.vehicle_number, show(r));
  r = await api('POST', `/procurement/${cpId}/fulfil`, admin.token, { vehicle_number: 'mh12ab1111', purchase_rate: 1500, receiving_date: '2026-11-15', bill_reference: 'INV-1' });
  check('received after the vehicle is verified', r.status === 200 || r.status === 201, show(r));
  check('central stock +10 buckets', near(await stock(central.id, paintId), centralBefore + 10), `${centralBefore} -> ${await stock(central.id, paintId)}`);
  r = await api('POST', `/procurement/${cpId}/vendor-dispatch`, admin.token, { vehicle_number: 'MH12 AB 2222' });
  check('dispatch cannot be changed once received', r.status === 400, show(r));

  // A non-liquid material carries no litres.
  r = await api('POST', '/procurement', admin.token, {
    procurement_kind: 'central_purchase', source_type: 'supplier', item_type: 'material', material_id: bags.id, quantity: 5, unit: bags.unit,
    vendor_id: vendorId, estimated_rate: 300, litres_per_unit: 20, status: 'draft',
  });
  check('non-liquid material ignores litres', r.status === 201 && r.data.request.isLiquid === false && r.data.request.totalLitres === null, show(r));

  // ------------------------------------------------------------ 3. vendor -> site order without vehicle
  section('3. Vendor -> Site order placed without a vehicle');
  r = await api('POST', '/procurement', admin.token, {
    procurement_kind: 'project_site', item_type: 'material', material_id: paintId, quantity: 4, unit: 'bucket', litres_per_unit: 10,
    project_id: projectId, site_id: siteId, task_id: taskId, subtask_id: subtaskId, vendor_id: vendorId, supplier: 'Vendor N15b', estimated_rate: 1500, status: 'requested',
  });
  const vsId = r.data?.request?.id;
  check('vendor -> site request with litres', r.status === 201 && r.data.request.totalLitres === 40, show(r));
  await approve(vsId, admin.token);
  r = await api('POST', `/procurement/${vsId}/order`, admin.token, { order_date: '2026-11-15' });
  check('order placed without a vehicle', r.status === 200 && r.data.request.status === 'ordered' && r.data.request.awaitingVendorDispatch === true, show(r));
  const notesBefore = Number((await one('SELECT COUNT(*) n FROM notifications WHERE user_id=?', [cUser.id])).n);
  r = await api('POST', `/procurement/${vsId}/receiving`, cToken, { received_quantity: 4, receiving_date: '2026-11-15', vehicle_number: 'DL01 ZZ 0001' });
  check('contractor cannot receive before the vendor confirms', r.status === 400 && /not confirmed/.test(r.details.vehicle_number || ''), show(r));
  r = await api('POST', `/site-receiving/orders/${vsId}/receive`, engUser.token, { vehicle_number: 'DL01 ZZ 0001', received_quantity: 4 });
  check('site engineer cannot receive before the vendor confirms', r.status === 400, show(r));
  r = await api('POST', `/procurement/${vsId}/vendor-dispatch`, admin.token, { vehicle_number: 'DL01 AB 4444', driver_name: 'Mohan', expected_delivery_date: '2026-11-18' });
  check('vendor confirmed on the order', r.status === 200 && r.data.request.vehicleNumber === 'DL01 AB 4444', show(r));
  const notesAfter = Number((await one('SELECT COUNT(*) n FROM notifications WHERE user_id=?', [cUser.id])).n);
  check('receiving contractor notified with the vehicle', notesAfter === notesBefore + 1, `${notesBefore} -> ${notesAfter}`);
  const cWh = await one('SELECT id FROM warehouses WHERE contractor_id=? LIMIT 1', [contractorId]);
  const siteBefore = await stock(cWh.id, paintId);
  r = await api('POST', `/procurement/${vsId}/receiving`, cToken, { received_quantity: 4, receiving_date: '2026-11-15', vehicle_number: 'DL01 XX 4444' });
  check('wrong vehicle rejected on receipt', r.status === 400 && r.details.vehicle_number, show(r));
  r = await api('POST', `/procurement/${vsId}/receiving`, cToken, { received_quantity: 4, receiving_date: '2026-11-15', vehicle_number: 'dl01ab4444' });
  check('contractor receives after verification', r.status === 201 || r.status === 200, show(r));
  check('site stock +4 buckets', near(await stock(cWh.id, paintId), siteBefore + 4));

  // Placing an order WITH the vehicle up front still works (already confirmed).
  r = await api('POST', '/procurement', admin.token, {
    procurement_kind: 'project_site', item_type: 'material', material_id: bags.id, quantity: 2, unit: bags.unit,
    project_id: projectId, site_id: siteId, vendor_id: vendorId, estimated_rate: 300, status: 'requested',
  });
  const vs2 = r.data?.request?.id;
  await approve(vs2, admin.token);
  r = await api('POST', `/procurement/${vs2}/order`, admin.token, { vehicle_number: 'HR55 CD 1234' });
  check('order with a vehicle = already confirmed', r.status === 200 && r.data.request.awaitingVendorDispatch === false && r.data.request.vendorConfirmedAt, show(r));

  // ------------------------------------------------------------ 4. litres sent / received
  section('4. Litres sent and received on a movement');
  r = await api('POST', '/procurement/batches', admin.token, {
    flow: 'central_site', status: 'requested', items: [
      { item_type: 'material', material_id: paintId, quantity: 3, project_id: projectId, site_id: siteId, task_id: taskId, subtask_id: subtaskId, litres_per_unit: 20 },
    ],
  });
  const batchId = r.data?.batch?.id;
  check('central -> site batch of paint', (r.status === 201 || r.status === 200) && batchId, show(r));
  await api('POST', `/procurement/batches/${batchId}/submit`, admin.token, {});
  await api('POST', `/procurement/batches/${batchId}/approve`, admin.token, {});
  r = await api('POST', `/procurement/batches/${batchId}/dispatch`, admin.token, { vehicle_number: 'PB10 LT 2020' });
  check('dispatched', r.status === 200 && r.data.results.every((x) => x.ok), show(r));
  const [item] = await q('SELECT id FROM procurement_requests WHERE batch_id=?', [batchId]);
  const mv = await one('SELECT * FROM material_movements WHERE procurement_request_id=?', [item.id]);
  check('litres sent = 3 x 20 = 60', near(mv.sent_litres, 60), `sent_litres=${mv.sent_litres}`);
  r = await api('GET', `/material-movements/${mv.id}`, admin.token);
  const mvApi = r.data?.movement || r.data;
  check('movement API shows litres sent', mvApi?.isLiquid === true && mvApi.sentLitres === 60, show(r));
  r = await api('POST', `/site-receiving/movements/${mv.id}/receive`, engUser.token, { vehicle_number: 'PB10 LT 2020', received_quantity: 3 });
  check('engineer receives the paint', r.status === 200, show(r));
  const mvAfter = await one('SELECT received_litres FROM material_movements WHERE id=?', [mv.id]);
  check('litres received = 60', near(mvAfter.received_litres, 60), `received_litres=${mvAfter.received_litres}`);

  // ------------------------------------------------------------ 5. litres used
  section('5. Litres used in daily work');
  r = await api('GET', `/daily-work/task-materials?taskId=${taskId}&subtaskId=${subtaskId}`, cToken);
  const lines = Array.isArray(r.data) ? r.data : (r.data?.materials || r.data?.items || []);
  const paintLine = lines.find((l) => Number(l.material_id) === paintId);
  check('task material lookup flags the paint as liquid', paintLine?.isLiquid === true && paintLine.litresPerUnit > 0, `${show(r)} ${JSON.stringify(paintLine)}`);
  r = await api('POST', '/daily-work', cToken, {
    project_id: projectId, site_id: siteId, task_id: taskId, subtask_id: subtaskId, work_date: '2026-11-15',
    work_done: 'First coat', material_id: paintId, quantity_used: 1, progress_percentage: 10,
  });
  const dw1 = r.data?.update?.id || r.data?.id;
  check('daily work with paint used', (r.status === 201 || r.status === 200) && dw1, show(r));
  const dwRow1 = await one('SELECT litres_used FROM daily_work_updates WHERE id=?', [dw1]);
  check('litres used worked out from litres per unit', dwRow1 && Number(dwRow1.litres_used) > 0, JSON.stringify(dwRow1));
  r = await api('POST', '/daily-work', cToken, {
    project_id: projectId, site_id: siteId, task_id: taskId, subtask_id: subtaskId, work_date: '2026-11-15',
    work_done: 'Touch up', material_id: paintId, quantity_used: 1, litres_used: 15, progress_percentage: 12,
  });
  const dw2 = r.data?.update?.id || r.data?.id;
  const dwRow2 = await one('SELECT litres_used FROM daily_work_updates WHERE id=?', [dw2]);
  check('typed litres used kept', dwRow2 && near(dwRow2.litres_used, 15), `${show(r)} ${JSON.stringify(dwRow2)}`);
  r = await api('GET', `/tasks/${taskId}`, admin.token);
  const used = (r.data?.materialUsage || r.data?.task?.materialUsage || []);
  const anyLitres = JSON.stringify(r.data || {}).includes('"litresUsed":15');
  check('task detail reports litres used', r.status === 200 && (anyLitres || used.some((u) => u.litresUsed === 15)), show(r));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log('Failed:', failures.join(' | '));
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('TEST HARNESS ERROR', e); process.exit(1); });
