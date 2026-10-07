'use strict';

const assert = require('assert');
const { pool } = require('../src/config/db');

const BASE = 'http://localhost:5000/api';

async function request(path, token, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function login(identifier, password) {
  const res = await request('/auth/login', null, {
    method: 'POST',
    body: { identifier, password },
  });
  if (!res.ok) throw new Error(`Login failed for ${identifier}: ${JSON.stringify(res.data)}`);
  return res.data.data.accessToken;
}

async function runLiveHttpTests() {
  console.log('===========================================================');
  console.log('STARTING LIVE HTTP END-TO-END TESTS ON http://localhost:5000');
  console.log('===========================================================\n');

  // 1. Authenticate Admin and Contractor 4
  console.log('Logging in test accounts...');
  const adminToken = await login('admin@architectureerp.com', 'Admin@12345678');
  console.log('✔ Admin logged in successfully.');

  // Note: user 6 is DEMO - ABC Construction Contractor
  // We can also get or set password for user 6 if needed, or query token directly
  // Let's verify login for demo contractor:
  let contractorToken;
  try {
    contractorToken = await login('demo.contractor@architecture-erp.local', 'DemoContractor@123');
    console.log('✔ Contractor 4 logged in successfully.');
  } catch (err) {
    const { signAccessToken } = require('../src/utils/tokens');
    contractorToken = signAccessToken({ id: 6, email: 'demo.contractor@architecture-erp.local', role: 'contractor' });
    console.log('✔ Generated valid Contractor 4 token via signAccessToken.');
  }

  // Generate Contractor 1 token (user_id 3: Twinkle Taneja)
  const { signAccessToken } = require('../src/utils/tokens');
  const contractor1Token = signAccessToken({ id: 3, email: 'twinkletaneja7191@gmail.com', role: 'contractor' });

  // -------------------------------------------------------------------------
  // 1. TEST MATERIAL MOVEMENTS HTTP ENDPOINT
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Material Movements HTTP Visibility ---');
  const c4MovementsRes = await request('/material-movements', contractorToken);
  assert(c4MovementsRes.ok, 'Contractor 4 GET /material-movements must succeed');
  const c4Movements = c4MovementsRes.data.data.movements;
  console.log(`Contractor 4 received ${c4Movements.length} movements.`);
  
  for (const m of c4Movements) {
    const involvesC4 =
      Number(m.source?.contractorId) === 4 ||
      Number(m.destination?.contractorId) === 4 ||
      m.source?.warehouseName?.includes('ABC Construction') ||
      m.destination?.warehouseName?.includes('ABC Construction');
    assert(involvesC4, `Movement ${m.movementNumber} must involve Contractor 4`);
  }
  console.log('✔ PASS: Contractor 4 sees ONLY movements involving Contractor 4 via HTTP');

  const adminMovementsRes = await request('/material-movements', adminToken);
  assert(adminMovementsRes.ok, 'Admin GET /material-movements must succeed');
  const adminMovements = adminMovementsRes.data.data.movements;
  console.log(`Admin received ${adminMovements.length} movements.`);
  assert(adminMovements.length >= c4Movements.length, 'Admin must see all movements');
  console.log('✔ PASS: Admin sees all movements via HTTP');

  // -------------------------------------------------------------------------
  // 2. TEST CONTRACTOR PROJECT & SITE SCOPE
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Project / Site Scope HTTP Enforcement ---');
  const c4ProjectsRes = await request('/projects', contractorToken);
  assert(c4ProjectsRes.ok, 'Contractor 4 GET /projects must succeed');
  const c4Projects = c4ProjectsRes.data.data.projects;
  const c4ProjectIds = c4Projects.map((p) => p.id);
  console.log(`Contractor 4 assigned project IDs: [${c4ProjectIds.join(', ')}]`);
  assert(c4ProjectIds.includes(4), 'Contractor 4 must see assigned project 4');
  assert(!c4ProjectIds.includes(1), 'Contractor 4 must NOT see unassigned project 1');
  console.log('✔ PASS: Contractor 4 project list only returns assigned projects');

  const c4ProjectDetailRes = await request('/projects/4', contractorToken);
  assert(c4ProjectDetailRes.ok, 'Contractor 4 GET /projects/4 must succeed');
  const c4Sites = c4ProjectDetailRes.data.data.sites;
  console.log(`Contractor 4 received ${c4Sites.length} sites under Project 4.`);
  assert(c4Sites.length > 0, 'Contractor 4 should have assigned sites');
  for (const s of c4Sites) {
    assert(Number(s.contractor_id) === 4, 'Sites must be assigned to Contractor 4');
  }
  console.log('✔ PASS: Contractor 4 project detail returns only assigned sites');

  // -------------------------------------------------------------------------
  // 3. TEST DAILY EXPENSES HTTP ENDPOINT
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Daily Expenses HTTP Enforcement ---');

  // Attempt unassigned project 1 -> Must fail with 400
  const unassignedExpRes = await request('/finance/expenses', contractorToken, {
    method: 'POST',
    body: {
      project_id: 1,
      category: 'Site Expense',
      amount: 1200,
      expense_date: '2026-09-18',
      remarks: 'Attempting to bill unassigned project',
    },
  });
  assert.strictEqual(unassignedExpRes.status, 400, 'Unassigned project expense must return 400');
  console.log('✔ PASS: Raising expense for unassigned project rejected with HTTP 400');

  // Attempt Invoice Payment without party_name -> Must fail with 400
  const missingPartyExpRes = await request('/finance/expenses', contractorToken, {
    method: 'POST',
    body: {
      project_id: 4,
      site_id: 5,
      category: 'Invoice Payment',
      amount: 3500,
      expense_date: '2026-09-18',
      party_name: '',
      remarks: 'Invoice payment missing party name',
    },
  });
  assert.strictEqual(missingPartyExpRes.status, 400, 'Invoice Payment without party_name must return 400');
  console.log('✔ PASS: Invoice Payment without party_name rejected with HTTP 400');

  // Valid Daily Expense submission with category "Consumable Material"
  const validExpRes = await request('/finance/expenses', contractorToken, {
    method: 'POST',
    body: {
      project_id: 4,
      site_id: 5,
      category: 'Consumable Material',
      amount: 2850,
      expense_date: '2026-09-18',
      remarks: 'Cement curing chemical and binding wire',
    },
  });
  assert.strictEqual(validExpRes.status, 201, 'Valid expense creation must return 201');
  const createdExp = validExpRes.data.data.expense;
  console.log(`✔ PASS: Daily expense created with HTTP 201 (${createdExp.expenseNumber})`);
  assert.strictEqual(createdExp.status, 'pending');
  assert.strictEqual(Number(createdExp.contractor?.id), 4);
  assert.strictEqual(createdExp.category, 'Consumable Material');

  // Valid Invoice Payment submission with Party Name
  const validInvoiceExpRes = await request('/finance/expenses', contractorToken, {
    method: 'POST',
    body: {
      project_id: 4,
      site_id: 5,
      category: 'Invoice Payment',
      amount: 8200,
      party_name: 'Mahalaxmi Hardware & Tools',
      expense_date: '2026-09-18',
      remarks: 'Hardware store invoice #8841',
    },
  });
  assert.strictEqual(validInvoiceExpRes.status, 201, 'Valid invoice payment must return 201');
  const createdInvoiceExp = validInvoiceExpRes.data.data.expense;
  assert.strictEqual(createdInvoiceExp.partyName, 'Mahalaxmi Hardware & Tools');
  console.log(`✔ PASS: Invoice Payment with party_name created with HTTP 201 (${createdInvoiceExp.expenseNumber})`);

  // Contractor 1 trying to read Contractor 4's expense -> Must be 404
  const c1AccessRes = await request(`/finance/expenses/${createdExp.id}`, contractor1Token);
  assert.strictEqual(c1AccessRes.status, 404, 'Contractor 1 accessing Contractor 4 expense must return 404');
  console.log('✔ PASS: Contractor 1 accessing Contractor 4 expense returns HTTP 404');

  // -------------------------------------------------------------------------
  // 4. TEST ADMIN FINANCE VISIBILITY OVER CONTRACTOR EXPENSES
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Admin Finance Visibility via HTTP ---');
  const adminExpListRes = await request(`/finance/expenses?search=${createdExp.expenseNumber}`, adminToken);
  assert(adminExpListRes.ok, 'Admin GET /finance/expenses must succeed');
  const adminFoundExp = adminExpListRes.data.data.expenses.find((e) => e.id === createdExp.id);
  assert(adminFoundExp, 'Admin must see the contractor expense');
  assert.strictEqual(Number(adminFoundExp.contractor?.id), 4);
  console.log('✔ PASS: Admin successfully sees Contractor 4 expense in Finance dashboard');

  const adminInvoiceExpListRes = await request(`/finance/expenses?search=${createdInvoiceExp.expenseNumber}`, adminToken);
  const adminFoundInvoiceExp = adminInvoiceExpListRes.data.data.expenses.find((e) => e.id === createdInvoiceExp.id);
  assert(adminFoundInvoiceExp, 'Admin must see the invoice expense');
  assert.strictEqual(adminFoundInvoiceExp.partyName, 'Mahalaxmi Hardware & Tools');
  console.log('✔ PASS: Admin successfully sees Party Name on invoice payment in Finance dashboard');

  // Clean up
  await pool.query('DELETE FROM expenses WHERE id IN (?, ?)', [createdExp.id, createdInvoiceExp.id]);
  console.log('\n✔ Test records cleaned up.');

  console.log('\n===========================================================');
  console.log('ALL LIVE HTTP END-TO-END TESTS PASSED (100%)');
  console.log('===========================================================\n');
}

runLiveHttpTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ LIVE HTTP TEST FAILED:', err);
    process.exit(1);
  });
