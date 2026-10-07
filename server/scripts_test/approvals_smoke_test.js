'use strict';

/**
 * Interface 12 — Approvals Management, end-to-end smoke test.
 *
 * Exercises the real HTTP API against a real database. Nothing is mocked, so
 * a pass here means the authorization, status rules and audit trail actually
 * hold over the wire — not just in the source.
 *
 * Expects: the server running on API_BASE, migrations applied, and the test
 * accounts from scripts_test/create_test_users.js (plus admin@test.local).
 *
 *   node scripts_test/approvals_smoke_test.js
 */

const API = process.env.API_BASE || 'http://localhost:5000/api';

let passed = 0;
let failed = 0;

function check(label, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${extra ? ` -> ${JSON.stringify(extra)}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, body: payload };
}

async function login(email, password) {
  const { status, body } = await api('/auth/login', {
    method: 'POST',
    body: { identifier: email, password },
  });
  if (status !== 200) throw new Error(`Login failed for ${email}: ${status} ${JSON.stringify(body)}`);
  return body.data.accessToken;
}

async function main() {
  section('Signing in as every role');
  const tokens = {};
  const accounts = {
    admin: ['admin@test.local', 'TestAdmin123'],
    hr: ['hr@test.local', 'TestHrPass123'],
    procurement: ['proc@test.local', 'TestProc123'],
    finance: ['fin@test.local', 'TestFin123'],
    warehouse: ['wh@test.local', 'TestWh123'],
    contractor1: ['contractor1@test.local', 'TestC1Pass123'],
    contractor2: ['contractor2@test.local', 'TestC2Pass123'],
    employee: ['employee1@test.local', 'TestEmpPass123'],
  };
  for (const [role, [email, password]] of Object.entries(accounts)) {
    tokens[role] = await login(email, password);
    check(`${role} signed in`, Boolean(tokens[role]));
  }

  // ---------------------------------------------------------------- dashboard
  section('Dashboard counts');
  const adminSummary = await api('/approvals/summary', { token: tokens.admin });
  check('admin summary returns 200', adminSummary.status === 200, adminSummary.body);
  const s = adminSummary.body?.data?.summary;
  check('summary exposes every required count', Boolean(s
    && typeof s.pending === 'number' && typeof s.approved === 'number'
    && typeof s.rejected === 'number' && typeof s.total === 'number'
    && typeof s.myPending === 'number' && typeof s.approvedToday === 'number'
    && typeof s.rejectedToday === 'number'), s);
  check('admin has pending approvals to work with', s?.pending > 0, s);
  check('admin can decide in every module', (s?.canDecide || []).length === 4, s?.canDecide);

  // -------------------------------------------------------------------- queue
  section('Unified queue and module visibility');
  const adminQueue = await api('/approvals/queue?status=pending&pageSize=50', { token: tokens.admin });
  check('admin queue returns 200', adminQueue.status === 200, adminQueue.body);
  const adminRows = adminQueue.body?.data?.approvals ?? [];
  const adminModules = new Set(adminRows.map((r) => r.module));
  check('admin sees general approvals', adminModules.has('general'), [...adminModules]);
  check('admin sees hr_labour approvals', adminModules.has('hr_labour'), [...adminModules]);
  check('admin sees procurement approvals', adminModules.has('procurement'), [...adminModules]);
  check('admin sees finance approvals', adminModules.has('finance'), [...adminModules]);
  check('every admin row carries a composite id', adminRows.every((r) => /^[a-z_]+:\d+$/.test(r.id)), adminRows[0]?.id);
  check('every pending admin row is decidable', adminRows.every((r) => r.canDecide === true));

  const hrQueue = await api('/approvals/queue?status=all&pageSize=50', { token: tokens.hr });
  const hrModules = new Set((hrQueue.body?.data?.approvals ?? []).map((r) => r.module));
  check('HR sees only hr_labour', hrModules.size > 0 && [...hrModules].every((m) => m === 'hr_labour'), [...hrModules]);

  const procQueue = await api('/approvals/queue?status=all&pageSize=50', { token: tokens.procurement });
  const procModules = new Set((procQueue.body?.data?.approvals ?? []).map((r) => r.module));
  check('Procurement sees only procurement', procModules.size > 0 && [...procModules].every((m) => m === 'procurement'), [...procModules]);

  const finQueue = await api('/approvals/queue?status=all&pageSize=50', { token: tokens.finance });
  const finModules = new Set((finQueue.body?.data?.approvals ?? []).map((r) => r.module));
  check('Finance sees finance + general + procurement, never hr_labour',
    finModules.size > 0 && !finModules.has('hr_labour'), [...finModules]);

  // Warehouse holds `procurement:view` but was never granted `approvals:view`
  // by schema_user_access.sql, and this interface deliberately does not grant
  // it. The approvals screen is therefore closed to them until an admin opens
  // it from the Users & Access matrix.
  const whQueue = await api('/approvals/queue?status=all&pageSize=50', { token: tokens.warehouse });
  check('Warehouse is refused the approvals queue (403)', whQueue.status === 403, whQueue.body);
  check('Warehouse is refused the summary (403)',
    (await api('/approvals/summary', { token: tokens.warehouse })).status === 403);

  // ------------------------------------------------------ contractor scoping
  section('Contractor and employee scoping');
  const c1Queue = await api('/approvals/queue?status=all&pageSize=50', { token: tokens.contractor1 });
  const c1Rows = c1Queue.body?.data?.approvals ?? [];
  check('contractor1 queue returns 200', c1Queue.status === 200, c1Queue.body);
  check('contractor1 sees only hr_labour rows', c1Rows.length > 0 && c1Rows.every((r) => r.module === 'hr_labour'));
  check('contractor1 sees only their own contractor id', c1Rows.every((r) => r.contractorId === 1), c1Rows.map((r) => r.contractorId));
  check('contractor1 can decide nothing', c1Rows.every((r) => r.canDecide === false));

  const c2Queue = await api('/approvals/queue?status=all&pageSize=50', { token: tokens.contractor2 });
  const c2Rows = c2Queue.body?.data?.approvals ?? [];
  check('contractor2 sees only their own contractor id', c2Rows.length > 0 && c2Rows.every((r) => r.contractorId === 2), c2Rows.map((r) => r.contractorId));
  const c1Ids = new Set(c1Rows.map((r) => r.id));
  check('contractor2 sees none of contractor1 rows', c2Rows.every((r) => !c1Ids.has(r.id)));

  const empQueue = await api('/approvals/queue?status=all&pageSize=50', { token: tokens.employee });
  const empRows = empQueue.body?.data?.approvals ?? [];
  check('employee queue returns 200', empQueue.status === 200, empQueue.body);
  check('employee sees only rows they raised',
    empRows.every((r) => r.requestedBy.userId === null || r.canDecide === false));
  check('employee can decide nothing', empRows.every((r) => r.canDecide === false));

  // --------------------------------------------------- unauthorized API calls
  section('Direct unauthorized API approval attempts');
  const pendingOf = (rows, module) => rows.find((r) => r.module === module && r.status === 'pending');

  // Pick contractor1's labour request specifically, so the contractor-scoping
  // assertions further down are testing the row that contractor actually owns.
  const labourItem = adminRows.find((r) => r.module === 'hr_labour' && r.status === 'pending' && r.contractorId === 1);
  // A procurement request raised by Warehouse — the Procurement role may
  // legitimately approve this one, because they did not raise it.
  const procItem = adminRows.find((r) => r.module === 'procurement' && r.status === 'pending'
    && r.requestedBy.name !== 'Test Procurement');
  // And one the Procurement user raised themselves, for the self-approval check.
  const procOwnItem = adminRows.find((r) => r.module === 'procurement' && r.status === 'pending'
    && r.requestedBy.name === 'Test Procurement');
  const finItem = pendingOf(adminRows, 'finance');
  const genItem = pendingOf(adminRows, 'general');
  check('found a pending item in each module',
    Boolean(labourItem && procItem && procOwnItem && finItem && genItem),
    { labourItem: !!labourItem, procItem: !!procItem, procOwnItem: !!procOwnItem, finItem: !!finItem, genItem: !!genItem });

  const decide = (token, item, decision, comment) =>
    api(`/approvals/${item.module}/${item.sourceId}/decision`, {
      method: 'POST', token, body: { decision, comment },
    });

  // A contractor calling the API directly, with no UI involved at all.
  const c1Attempt = await decide(tokens.contractor1, labourItem, 'approved', 'let me through');
  check('contractor cannot approve a labour request (403)', c1Attempt.status === 403, c1Attempt.body);

  const empAttempt = await decide(tokens.employee, finItem, 'approved', 'mine now');
  check('employee cannot approve an expense (403)', empAttempt.status === 403, empAttempt.body);

  // Cross-module: each role trying to reach outside its own approval type.
  const hrOnProc = await decide(tokens.hr, procItem, 'approved', 'not my module');
  check('HR cannot approve a procurement request (403/404)', [403, 404].includes(hrOnProc.status), hrOnProc.body);

  const procOnLabour = await decide(tokens.procurement, labourItem, 'approved', 'not my module');
  check('Procurement cannot approve a labour request (403/404)', [403, 404].includes(procOnLabour.status), procOnLabour.body);

  const whOnProc = await decide(tokens.warehouse, procItem, 'approved', 'read only');
  check('Warehouse cannot approve a procurement request (403)', whOnProc.status === 403, whOnProc.body);

  const finOnLabour = await decide(tokens.finance, labourItem, 'approved', 'not my module');
  check('Finance cannot approve a labour request (403/404)', [403, 404].includes(finOnLabour.status), finOnLabour.body);

  // Reading someone else's record by guessing its id.
  const c1PeekOther = await api(`/approvals/hr_labour/${c2Rows[0].sourceId}`, { token: tokens.contractor1 });
  check('contractor1 cannot read contractor2 request by id (404)', c1PeekOther.status === 404, c1PeekOther.body);

  const c1PeekProc = await api(`/approvals/procurement/${procItem.sourceId}`, { token: tokens.contractor1 });
  check('contractor cannot read a procurement approval by id (404)', c1PeekProc.status === 404, c1PeekProc.body);

  const noToken = await decide(null, genItem, 'approved', 'anonymous');
  check('unauthenticated decision is refused (401)', noToken.status === 401, noToken.body);

  const badModule = await api('/approvals/nonsense/1/decision', {
    method: 'POST', token: tokens.admin, body: { decision: 'approved' },
  });
  check('unknown module is rejected (400)', badModule.status === 400, badModule.body);

  // ------------------------------------------------- nobody approves their own
  section('Self-approval guard');
  const selfApprove = await decide(tokens.procurement, procOwnItem, 'approved', 'mine, approving it');
  check('Procurement cannot approve a request they raised themselves (403)',
    selfApprove.status === 403, selfApprove.body);
  check('the refusal explains it is a self-approval',
    /raised yourself/i.test(selfApprove.body?.error?.message || ''), selfApprove.body?.error);

  const selfDetail = await api(`/approvals/procurement/${procOwnItem.sourceId}`, { token: tokens.procurement });
  check('their own request is visible but not decidable',
    selfDetail.status === 200 && selfDetail.body?.data?.decision?.canDecide === false,
    selfDetail.body?.data?.decision);

  // Someone else in the same authority can still clear it.
  const otherApprove = await decide(tokens.admin, procOwnItem, 'approved', 'Approved by admin instead');
  check('a different approver can still decide it (200)', otherApprove.status === 200, otherApprove.body);

  // ----------------------------------------------------------- validation
  section('Validation and status rules');
  const noReason = await decide(tokens.admin, genItem, 'rejected', '   ');
  check('rejection without a reason is refused (400)', noReason.status === 400, noReason.body);
  check('the refusal names the comment field', noReason.body?.error?.details?.comment, noReason.body?.error);

  const badDecision = await api(`/approvals/${genItem.module}/${genItem.sourceId}/decision`, {
    method: 'POST', token: tokens.admin, body: { decision: 'maybe' },
  });
  check('an invalid decision value is refused (400)', badDecision.status === 400, badDecision.body);

  // ---------------------------------------------------- approve / reject
  section('Approve and reject through the central layer');

  const hrApprove = await decide(tokens.hr, labourItem, 'approved', 'Approved by HR for slab work');
  check('HR CAN approve a labour request (200)', hrApprove.status === 200, hrApprove.body);
  check('labour request moved to an approved state',
    hrApprove.body?.data?.approval?.status === 'approved', hrApprove.body?.data?.approval);
  check('source status is preserved verbatim',
    hrApprove.body?.data?.approval?.sourceStatus === 'APPROVED', hrApprove.body?.data?.approval?.sourceStatus);

  const procApprove = await decide(tokens.procurement, procItem, 'approved', 'Stock needed');
  check('Procurement CAN approve a procurement request (200)', procApprove.status === 200, procApprove.body);
  check('procurement request is approved',
    procApprove.body?.data?.approval?.sourceStatus === 'approved', procApprove.body?.data?.approval?.sourceStatus);

  const finReject = await decide(tokens.finance, finItem, 'rejected', 'Missing receipt, resubmit with proof');
  check('Finance CAN reject an expense (200)', finReject.status === 200, finReject.body);
  check('expense is rejected', finReject.body?.data?.approval?.sourceStatus === 'rejected', finReject.body?.data?.approval?.sourceStatus);

  const adminApprove = await decide(tokens.admin, genItem, 'approved', 'Approved by admin');
  check('Admin CAN approve a general request (200)', adminApprove.status === 200, adminApprove.body);

  // ------------------------------------------------ invalid status changes
  section('Invalid status transitions');
  const flipApproved = await decide(tokens.admin, labourItem, 'rejected', 'changed my mind');
  check('APPROVED -> REJECTED is refused (400)', flipApproved.status === 400, flipApproved.body);

  const flipRejected = await decide(tokens.admin, finItem, 'approved', 'changed my mind');
  check('REJECTED -> APPROVED is refused (400)', flipRejected.status === 400, flipRejected.body);

  const doubleApprove = await decide(tokens.admin, genItem, 'approved', 'again');
  check('approving twice is refused (400)', doubleApprove.status === 400, doubleApprove.body);

  // -------------------------------------------------------------- history
  section('Approval history');
  const hist = await api(`/approvals/${labourItem.module}/${labourItem.sourceId}/history`, { token: tokens.admin });
  check('history returns 200', hist.status === 200, hist.body);
  const entries = hist.body?.data?.history ?? [];
  check('history opens with a Submitted entry', entries[0]?.action === 'SUBMITTED', entries[0]);
  check('history records the approval', entries.some((e) => e.action === 'APPROVED'), entries);
  const approvedEntry = entries.find((e) => e.action === 'APPROVED');
  check('history records who decided', approvedEntry?.actor?.name === 'Test HR', approvedEntry?.actor);
  check('history records the actor role', approvedEntry?.actor?.role === 'hr', approvedEntry?.actor);
  check('history records the comment', approvedEntry?.comment === 'Approved by HR for slab work', approvedEntry?.comment);
  check('history records previous and new status',
    approvedEntry?.previousStatus === 'SUBMITTED' && approvedEntry?.newStatus === 'APPROVED', approvedEntry);
  check('history records a timestamp', Boolean(approvedEntry?.at), approvedEntry?.at);

  const rejectHist = await api(`/approvals/${finItem.module}/${finItem.sourceId}/history`, { token: tokens.finance });
  const rejectEntry = (rejectHist.body?.data?.history ?? []).find((e) => e.action === 'REJECTED');
  check('rejection reason is preserved in history',
    rejectEntry?.comment === 'Missing receipt, resubmit with proof', rejectEntry?.comment);

  // Contractor may follow the status of their own request, including history.
  const c1Hist = await api(`/approvals/${labourItem.module}/${labourItem.sourceId}/history`, { token: tokens.contractor1 });
  check('contractor can read history of their own request', c1Hist.status === 200, c1Hist.body);

  // ------------------------------------------------------------- detail
  section('Approval detail');
  const detail = await api(`/approvals/${labourItem.module}/${labourItem.sourceId}`, { token: tokens.admin });
  check('detail returns 200', detail.status === 200, detail.body);
  const d = detail.body?.data;
  check('detail carries the approval, history and decision block',
    Boolean(d?.approval && d?.history && d?.decision), Object.keys(d || {}));
  check('detail reports the item is no longer pending', d?.decision?.isPending === false, d?.decision);

  const c1Detail = await api(`/approvals/${labourItem.module}/${labourItem.sourceId}`, { token: tokens.contractor1 });
  check('contractor detail is readable but not decidable',
    c1Detail.status === 200 && c1Detail.body?.data?.decision?.canDecide === false, c1Detail.body?.data?.decision);
  check('contractor is told why they cannot decide',
    Boolean(c1Detail.body?.data?.decision?.reason), c1Detail.body?.data?.decision);

  // ------------------------------------------------------ counts move on
  section('Dashboard reflects the decisions');
  const after = await api('/approvals/summary', { token: tokens.admin });
  const a = after.body?.data?.summary;
  check('approved today counted', a?.approvedToday >= 4, a);
  check('rejected today counted', a?.rejectedToday >= 1, a);
  check('pending count dropped', a?.pending < s?.pending, { before: s?.pending, after: a?.pending });

  // ----------------------------------------------------------- lookups
  section('Lookups');
  const lookups = await api('/approvals/lookups', { token: tokens.admin });
  check('lookups return 200', lookups.status === 200, lookups.body);
  check('admin lookups list all four modules', (lookups.body?.data?.modules ?? []).length === 4, lookups.body?.data?.modules);
  const hrLookups = await api('/approvals/lookups', { token: tokens.hr });
  check('HR lookups list only hr_labour', (hrLookups.body?.data?.modules ?? []).every((m) => m.key === 'hr_labour'),
    hrLookups.body?.data?.modules);

  // ------------------------------------------------------------- filters
  section('Filters');
  const byModule = await api('/approvals/queue?module=procurement&status=all&pageSize=50', { token: tokens.admin });
  check('module filter works', (byModule.body?.data?.approvals ?? []).every((r) => r.module === 'procurement'));

  const byStatus = await api('/approvals/queue?status=approved&pageSize=50', { token: tokens.admin });
  check('status filter works', (byStatus.body?.data?.approvals ?? []).every((r) => r.status === 'approved'));

  const byPriority = await api('/approvals/queue?priority=urgent&status=all&pageSize=50', { token: tokens.admin });
  check('priority filter works', (byPriority.body?.data?.approvals ?? []).every((r) => r.priority === 'urgent'));

  const bySearch = await api(`/approvals/queue?search=${encodeURIComponent(labourItem.reference)}&status=all`, { token: tokens.admin });
  check('search finds a request by reference',
    (bySearch.body?.data?.approvals ?? []).some((r) => r.reference === labourItem.reference));

  const paged = await api('/approvals/queue?status=all&pageSize=2&page=1', { token: tokens.admin });
  check('pagination caps the page size', (paged.body?.data?.approvals ?? []).length <= 2);
  check('pagination reports totals', typeof paged.body?.data?.pagination?.total === 'number', paged.body?.data?.pagination);

  // -------------------------------------------- other modules still work
  section('Existing modules still respond');
  for (const [label, path, token] of [
    ['projects', '/projects?pageSize=5', tokens.admin],
    ['contractors', '/contractors?pageSize=5', tokens.admin],
    ['employees', '/employees?pageSize=5', tokens.admin],
    ['materials', '/materials?pageSize=5', tokens.admin],
    ['procurement', '/procurement?pageSize=5', tokens.admin],
    ['warehouse', '/warehouse?pageSize=5', tokens.admin],
    ['finance expenses', '/finance/expenses?pageSize=5', tokens.admin],
    ['hr dashboard', '/hr/dashboard', tokens.admin],
    ['users', '/users?pageSize=5', tokens.admin],
    ['legacy approvals list', '/approvals?status=all', tokens.admin],
  ]) {
    const result = await api(path, { token });
    check(`${label} still returns 200`, result.status === 200, result.body?.error);
  }

  console.log(`\n${'='.repeat(46)}`);
  console.log(`${passed} passed, ${failed} failed`);
  console.log('='.repeat(46));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exit(1);
});
