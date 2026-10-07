'use strict';

const assert = require('assert');
const { pool } = require('../src/config/db');
const movementModel = require('../src/models/materialMovementModel');
const movementService = require('../src/services/materialMovementService');
const financeModel = require('../src/models/financeModel');
const financeService = require('../src/services/financeService');
const projectModel = require('../src/models/projectModel');
const projectService = require('../src/services/projectService');
const procurementService = require('../src/services/procurementService');
const approvalModel = require('../src/models/approvalModel');
const { ROLES } = require('../src/config/roles');

async function runTests() {
  console.log('====================================================');
  console.log('STARTING CONTRACTOR FEATURES & SECURITY VERIFICATION');
  console.log('====================================================\n');

  const contractor4Scope = { role: ROLES.CONTRACTOR, contractorId: 4, contractorName: 'DEMO - ABC Construction Contractor' };
  const contractor1Scope = { role: ROLES.CONTRACTOR, contractorId: 1, contractorName: 'TWINKLE TANEJA' };
  const adminScope = { role: ROLES.ADMIN, isAdmin: true, contractorId: null };

  const contractor4UserId = 6;
  const contractor1UserId = 3;
  const adminUserId = 1;

  // ---------------------------------------------------------------
  // TEST SUITE 1: Material Movement Visibility
  // ---------------------------------------------------------------
  console.log('--- TEST 1: Material Movement Scoping ---');

  const allMovements = await movementService.listMovements({}, adminScope, adminUserId);
  console.log(`[Admin] Total movements visible: ${allMovements.length}`);
  assert(allMovements.length > 0, 'Admin must see material movements');

  const c4Movements = await movementService.listMovements({}, contractor4Scope, contractor4UserId);
  console.log(`[Contractor 4] Total movements visible: ${c4Movements.length}`);

  // Contractor 4 must only see movements where they or their warehouse are source or destination
  for (const mv of c4Movements) {
    const isSource = Number(mv.source?.contractorId) === 4 || mv.source?.warehouseName?.includes('ABC Construction');
    const isDest = Number(mv.destination?.contractorId) === 4 || mv.destination?.warehouseName?.includes('ABC Construction');
    assert(isSource || isDest, `Contractor 4 must not see unrelated movement ${mv.movementNumber}`);
  }
  console.log('✔ PASS: Contractor 4 sees ONLY movements involving Contractor 4');

  // Verify movements involving ONLY Contractor 1 are hidden from Contractor 4
  const c1Exclusive = allMovements.find(
    (m) =>
      (Number(m.source?.contractorId) === 1 || Number(m.destination?.contractorId) === 1) &&
      Number(m.source?.contractorId) !== 4 &&
      Number(m.destination?.contractorId) !== 4 &&
      !m.destination?.warehouseName?.includes('ABC Construction')
  );
  if (c1Exclusive) {
    const foundInC4 = c4Movements.some((m) => m.id === c1Exclusive.id);
    assert(!foundInC4, `Contractor 4 must NOT see movement ${c1Exclusive.movementNumber} which belongs only to Contractor 1`);
    console.log(`✔ PASS: Contractor 4 cannot see movement ${c1Exclusive.movementNumber} (involving Contractor 1 only)`);

    // Verify direct getById throws 404
    let directFetchBlocked = false;
    try {
      await movementService.getById(c1Exclusive.id, contractor4Scope);
    } catch (e) {
      directFetchBlocked = e.statusCode === 404 || e.status === 404;
    }
    assert(directFetchBlocked, 'Direct access to another contractor movement via getById must return 404');
    console.log('✔ PASS: Direct getById for unrelated movement throws 404 for Contractor 4');
  }

  // ---------------------------------------------------------------
  // TEST SUITE 2: Contractor Project & Site Restrictions
  // ---------------------------------------------------------------
  console.log('\n--- TEST 2: Contractor Project & Site Assignment Scope ---');

  // Contractor 4 assigned projects: Project 4 & 5. Project 1 is assigned to Contractor 1.
  const c4Projects = await projectService.list({ pageSize: 50 }, contractor4Scope);
  const c4ProjectIds = c4Projects.projects.map((p) => p.id);
  console.log(`[Contractor 4] Assigned project IDs: ${c4ProjectIds.join(', ')}`);
  assert(c4ProjectIds.includes(4), 'Contractor 4 must see assigned project 4');
  assert(!c4ProjectIds.includes(1), 'Contractor 4 must NOT see unassigned project 1');
  console.log('✔ PASS: Contractor project list only returns assigned projects');

  // getDetail on assigned project 4 should filter sites
  const p4Detail = await projectService.getDetail(4, contractor4Scope);
  assert(p4Detail.sites.length > 0, 'Contractor 4 should see assigned sites under project 4');
  console.log(`✔ PASS: Contractor 4 sees ${p4Detail.sites.length} assigned sites under Project 4`);

  // getDetail on unassigned project 1 should throw 404
  let p1DetailBlocked = false;
  try {
    await projectService.getDetail(1, contractor4Scope);
  } catch (e) {
    p1DetailBlocked = e.statusCode === 404 || e.status === 404;
  }
  assert(p1DetailBlocked, 'Contractor 4 accessing unassigned project 1 detail must throw 404');
  console.log('✔ PASS: Accessing unassigned project detail throws 404');

  // Contractor 4 attempting to raise expense for unassigned project 1 must be rejected
  let unassignedExpenseBlocked = false;
  try {
    await financeService.createExpense(
      {
        project_id: 1,
        category: 'Site Expense',
        amount: 500,
        remarks: 'Testing unassigned project bypass',
      },
      contractor4UserId,
      contractor4Scope
    );
  } catch (e) {
    unassignedExpenseBlocked = e.statusCode === 400 || e.status === 400;
  }
  assert(unassignedExpenseBlocked, 'Raising expense for unassigned project 1 must be blocked with 400');
  console.log('✔ PASS: Raising expense for unassigned project 1 blocked with 400');

  // Contractor 4 attempting to raise procurement for unassigned project 1 must be rejected
  let unassignedProcurementBlocked = false;
  try {
    await procurementService.create(
      {
        project_id: 1,
        material_id: 1,
        quantity: 10,
        procurement_kind: 'project_site',
      },
      contractor4UserId,
      contractor4Scope
    );
  } catch (e) {
    unassignedProcurementBlocked = e.statusCode === 404 || e.statusCode === 400 || e.status === 404;
  }
  assert(unassignedProcurementBlocked, 'Raising procurement for unassigned project 1 must be blocked');
  console.log('✔ PASS: Raising procurement for unassigned project 1 blocked');

  // ---------------------------------------------------------------
  // TEST SUITE 3: Daily Expense Creation & Validation Rules
  // ---------------------------------------------------------------
  console.log('\n--- TEST 3: Daily Expense Creation & Rules ---');

  // 1. Invoice Payment requires Party Name
  let invoicePaymentMissingPartyBlocked = false;
  try {
    await financeService.createExpense(
      {
        project_id: 4,
        site_id: 5,
        category: 'Invoice Payment',
        amount: 2500,
        party_name: '',
        remarks: 'Test invoice payment missing party',
      },
      contractor4UserId,
      contractor4Scope
    );
  } catch (e) {
    invoicePaymentMissingPartyBlocked = e.statusCode === 400 || e.status === 400;
  }
  assert(invoicePaymentMissingPartyBlocked, 'Invoice Payment without party_name must fail with 400');
  console.log('✔ PASS: Invoice Payment without party_name blocked with 400');

  // 2. Invoice Payment with Party Name succeeds
  const invoiceExpense = await financeService.createExpense(
    {
      project_id: 4,
      site_id: 5,
      category: 'Invoice Payment',
      amount: 2500,
      party_name: 'Sharma Electrical Supplies',
      remarks: 'Test electrical invoice payment',
    },
    contractor4UserId,
    contractor4Scope
  );
  assert.strictEqual(invoiceExpense.category, 'Invoice Payment');
  assert.strictEqual(invoiceExpense.partyName, 'Sharma Electrical Supplies');
  assert.strictEqual(Number(invoiceExpense.contractor?.id), 4);
  assert.strictEqual(invoiceExpense.status, 'pending');
  console.log(`✔ PASS: Invoice Payment with party_name created successfully (${invoiceExpense.expenseNumber})`);

  // 3. Room Rent expense creation & approval rule check
  const roomRentExpense = await financeService.createExpense(
    {
      project_id: 4,
      site_id: 5,
      category: 'Room Rent',
      amount: 6000,
      remarks: 'Monthly labour accommodation room rent',
    },
    contractor4UserId,
    contractor4Scope
  );
  assert.strictEqual(roomRentExpense.category, 'Room Rent');
  assert.strictEqual(roomRentExpense.status, 'pending');
  assert.strictEqual(roomRentExpense.requiresProjectHeadApproval, true);
  console.log(`✔ PASS: Room Rent expense created in pending status (${roomRentExpense.expenseNumber})`);

  // Moving pending Room Rent directly to paid must be rejected
  let roomRentDirectPaidBlocked = false;
  try {
    await financeService.updateExpenseStatus(roomRentExpense.id, 'paid');
  } catch (e) {
    roomRentDirectPaidBlocked = e.statusCode === 400 || e.status === 400;
  }
  assert(roomRentDirectPaidBlocked, 'Room Rent must require approval before moving to paid');
  console.log('✔ PASS: Room Rent directly moving to paid blocked with 400');

  // Moving Room Rent: pending -> approved -> paid must succeed
  await financeService.updateExpenseStatus(roomRentExpense.id, 'approved');
  const approvedRoomRent = await financeService.getExpense(roomRentExpense.id, adminScope);
  assert.strictEqual(approvedRoomRent.status, 'approved');
  await financeService.updateExpenseStatus(roomRentExpense.id, 'paid');
  const paidRoomRent = await financeService.getExpense(roomRentExpense.id, adminScope);
  assert.strictEqual(paidRoomRent.status, 'paid');
  console.log('✔ PASS: Room Rent successfully approved then paid');

  // 4. Contractor isolation: Contractor 1 cannot see Contractor 4 expense
  let c1ExpenseFetchBlocked = false;
  try {
    await financeService.getExpense(invoiceExpense.id, contractor1Scope);
  } catch (e) {
    c1ExpenseFetchBlocked = e.statusCode === 404 || e.status === 404;
  }
  assert(c1ExpenseFetchBlocked, 'Contractor 1 must not be able to get Contractor 4 expense detail');
  console.log('✔ PASS: Contractor 1 cannot access Contractor 4 expense detail (404)');

  const c1ExpensesList = await financeService.listExpenses({}, contractor1Scope);
  const c1HasC4Expense = c1ExpensesList.expenses.some((e) => e.id === invoiceExpense.id);
  assert(!c1HasC4Expense, 'Contractor 1 must not see Contractor 4 expense in list');
  console.log('✔ PASS: Contractor 1 list does not contain Contractor 4 expense');

  // ---------------------------------------------------------------
  // TEST SUITE 4: Admin / Finance Visibility & Interface 12 Approvals
  // ---------------------------------------------------------------
  console.log('\n--- TEST 4: Admin / Finance Visibility & Approvals Integration ---');

  // Admin lists expenses and sees the contractor expense
  const adminExpensesList = await financeService.listExpenses({ search: invoiceExpense.expenseNumber }, adminScope);
  const foundByAdmin = adminExpensesList.expenses.find((e) => e.id === invoiceExpense.id);
  assert(foundByAdmin, 'Admin must see the contractor expense');
  assert.strictEqual(Number(foundByAdmin.contractor?.id), 4);
  assert.strictEqual(foundByAdmin.contractor?.name, 'DEMO - ABC Construction Contractor');
  assert.strictEqual(foundByAdmin.partyName, 'Sharma Electrical Supplies');
  console.log('✔ PASS: Admin sees contractor expense with contractor details and party name');

  // Interface 12 Approvals Queue check:
  // Admin sees it in finance module queue
  const approvalService = require('../src/services/approvalService');
  const adminApprovals = await approvalService.listApprovals({
    user: { id: adminUserId, role: ROLES.ADMIN, email: 'admin@test.com' },
    permissions: new Set(['finance:approve', 'finance:view', 'approvals:view']),
    hrScope: adminScope,
    query: { module: 'finance', status: 'pending' },
  });
  const inAdminQueue = adminApprovals.approvals.find(
    (item) => item.module === 'finance' && item.sourceId === invoiceExpense.id
  );
  assert(inAdminQueue, 'Contractor expense must appear in Admin finance approval queue');
  console.log(`✔ PASS: Contractor expense found in Interface 12 unified approval queue (${inAdminQueue.reference})`);

  // Contractor 4 sees their own expense in their approval queue
  const c4Approvals = await approvalService.listApprovals({
    user: { id: contractor4UserId, role: ROLES.CONTRACTOR, email: 'contractor4@test.com' },
    permissions: new Set(['approvals:view', 'dashboard:view']),
    hrScope: contractor4Scope,
    query: { module: 'finance', status: 'pending' },
  });
  const inC4Queue = c4Approvals.approvals.find(
    (item) => item.module === 'finance' && item.sourceId === invoiceExpense.id
  );
  assert(inC4Queue, 'Contractor must see their own expense in contractor approvals queue');
  console.log('✔ PASS: Contractor 4 sees their expense in their own approval queue');

  // Clean up created test expenses
  await pool.query('DELETE FROM expenses WHERE id IN (?, ?)', [invoiceExpense.id, roomRentExpense.id]);
  console.log('\n✔ Test data cleaned up.');

  console.log('\n====================================================');
  console.log('ALL CONTRACTOR FEATURES TESTS PASSED (100%)');
  console.log('====================================================\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  });
