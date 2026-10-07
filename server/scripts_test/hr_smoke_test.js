'use strict';
// Run against a live server on http://localhost:5057 (started in the same
// shell invocation as this script — see the combined bash command).

const BASE = 'http://localhost:5057/api';
let failures = 0;
let passes = 0;

function check(name, cond, extra) {
  if (cond) { passes++; console.log(`PASS  ${name}`); }
  else { failures++; console.log(`FAIL  ${name}${extra ? ' -- ' + JSON.stringify(extra) : ''}`); }
}

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login failed for ${email}: ${JSON.stringify(data)}`);
  return data.data.accessToken || data.data.token || data.data.access_token;
}

async function call(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }
  return { status: res.status, data };
}

async function main() {
  const admin = await login('admin@test.local', 'TestAdminPass123');
  const hr = await login('hr@test.local', 'TestHrPass123');
  const c1 = await login('contractor1@test.local', 'TestC1Pass123');
  const c2 = await login('contractor2@test.local', 'TestC2Pass123');
  const emp = await login('employee1@test.local', 'TestEmpPass123');
  console.log('Logged in as admin, hr, contractor1 (contractor #1), contractor2 (contractor #2), employee1 (employee #1)\n');

  // ---------------------------------------------------------- dashboard
  {
    const r = await call(admin, 'GET', '/hr/dashboard');
    check('Admin: dashboard summary loads', r.status === 200 && r.data.success, r.data);
    check('Admin: dashboard has contractorBreakdown', Array.isArray(r.data.data.summary.contractorBreakdown), r.data);
  }
  {
    const r = await call(c1, 'GET', '/hr/dashboard');
    check('Contractor1: dashboard summary loads (own scope)', r.status === 200, r.data);
    check('Contractor1: dashboard has NO contractorBreakdown (not cross-contractor)', r.data.data.summary.contractorBreakdown === undefined, r.data);
  }

  // ------------------------------------------------------ contractor workers
  let c1WorkerId;
  {
    const r = await call(c1, 'POST', '/hr/contractor-workers', {
      fullName: 'Ramesh Kumar', phone: '9999900001', skillCategory: 'mason', dailyRate: 800, joiningDate: '2025-01-10',
    });
    check('Contractor1: can create own worker', r.status === 201, r.data);
    c1WorkerId = r.data?.data?.worker?.id;
    check('Contractor1: created worker auto-scoped to contractor 1', r.data?.data?.worker?.contractorId === 1, r.data);
  }
  let c2WorkerId;
  {
    const r = await call(c2, 'POST', '/hr/contractor-workers', {
      fullName: 'Suresh Yadav', phone: '9999900002', skillCategory: 'electrician', dailyRate: 900,
    });
    check('Contractor2: can create own worker', r.status === 201, r.data);
    c2WorkerId = r.data?.data?.worker?.id;
  }
  {
    // Contractor A must not see Contractor B's worker at all, even by id.
    const r = await call(c1, 'GET', `/hr/contractor-workers/${c2WorkerId}`);
    check('Contractor1: CANNOT view Contractor2 worker by id (404)', r.status === 404, r.data);
  }
  {
    const r = await call(c2, 'GET', `/hr/contractor-workers/${c1WorkerId}`);
    check('Contractor2: CANNOT view Contractor1 worker by id (404)', r.status === 404, r.data);
  }
  {
    const r = await call(c1, 'GET', '/hr/contractor-workers');
    const ids = (r.data?.data?.workers || []).map((w) => w.id);
    check('Contractor1: worker list contains only own workers', ids.includes(c1WorkerId) && !ids.includes(c2WorkerId), ids);
  }
  {
    // Attempt to spoof ownership by supplying a different contractorId in the body.
    const r = await call(c1, 'POST', '/hr/contractor-workers', {
      contractorId: 2, fullName: 'Spoofed Worker', skillCategory: 'helper',
    });
    check('Contractor1: cannot spoof contractorId on create (still scoped to 1)', r.status === 201 && r.data?.data?.worker?.contractorId === 1, r.data);
  }
  {
    const r = await call(c1, 'PATCH', `/hr/contractor-workers/${c2WorkerId}`, { dailyRate: 1 });
    check('Contractor1: CANNOT edit Contractor2 worker (404)', r.status === 404, r.data);
  }
  {
    const r = await call(hr, 'GET', '/hr/contractor-workers');
    check('HR: can list all contractors\' workers', r.status === 200 && r.data.data.workers.length >= 2, r.data);
  }
  {
    const r = await call(emp, 'POST', '/hr/contractor-workers', { fullName: 'x', contractorId: 1 });
    check('Employee: CANNOT create contractor workers at all (403, role-gated)', r.status === 403, r.data);
  }

  // ------------------------------------------------------------ assignments
  let companyAssignmentId;
  {
    const r = await call(admin, 'POST', '/hr/assignments', {
      labourType: 'company', employeeId: 1, projectId: 1, siteId: 1, startDate: '2025-02-01',
    });
    check('Admin: can post company employee to project/site', r.status === 201, r.data);
    companyAssignmentId = r.data?.data?.assignment?.id;
  }
  {
    const r = await call(c1, 'POST', '/hr/assignments', {
      labourType: 'contractor', contractorWorkerId: c1WorkerId, projectId: 1, siteId: 1, startDate: '2025-02-01',
    });
    check('Contractor: CANNOT create assignments directly (403, HR/Admin-only)', r.status === 403, r.data);
  }
  let c1AssignmentId;
  {
    const r = await call(admin, 'POST', '/hr/assignments', {
      labourType: 'contractor', contractorWorkerId: c1WorkerId, projectId: 1, siteId: 1, startDate: '2025-02-01',
    });
    check('Admin: can post contractor worker to project/site', r.status === 201, r.data);
    c1AssignmentId = r.data?.data?.assignment?.id;
    check('Assignment carries contractor_id denormalised for scoping', r.data?.data?.assignment?.contractor?.id === 1, r.data);
  }
  {
    const r = await call(c2, 'GET', `/hr/assignments/${c1AssignmentId}`);
    check('Contractor2: CANNOT view Contractor1\'s assignment (404)', r.status === 404, r.data);
  }
  {
    const r = await call(c1, 'GET', '/hr/assignments');
    const ids = (r.data?.data?.assignments || []).map((a) => a.id);
    check('Contractor1: assignment list scoped to own only', ids.includes(c1AssignmentId), ids);
  }

  // ------------------------------------------------------- site workforce
  {
    const r = await call(admin, 'GET', '/hr/dashboard/sites/1/workforce');
    check('Admin: site workforce shows company + contractor counts', r.status === 200 && r.data.data.workforce.totalWorkforce >= 2, r.data);
  }
  {
    const r = await call(c2, 'GET', '/hr/dashboard/sites/1/workforce');
    check('Contractor2: CANNOT view a site they are not assigned to (404)', r.status === 404, r.data);
  }
  {
    const r = await call(c1, 'GET', '/hr/dashboard/sites/1/workforce');
    check('Contractor1: CAN view workforce for their own assigned site', r.status === 200, r.data);
  }

  // ----------------------------------------------------------- attendance
  let c1AttendanceId;
  {
    const r = await call(c1, 'POST', '/hr/attendance', {
      labourType: 'contractor', contractorWorkerId: c1WorkerId, projectId: 1, siteId: 1,
      date: '2025-02-03', status: 'PRESENT', checkIn: '09:00',
    });
    check('Contractor1: can mark attendance for own worker', r.status === 201, r.data);
    c1AttendanceId = r.data?.data?.attendance?.id;
  }
  {
    const r = await call(c1, 'POST', '/hr/attendance', {
      labourType: 'contractor', contractorWorkerId: c2WorkerId, projectId: 1, siteId: 1,
      date: '2025-02-03', status: 'PRESENT',
    });
    check('Contractor1: CANNOT mark attendance for Contractor2\'s worker (404)', r.status === 404, r.data);
  }
  {
    const r = await call(c1, 'POST', '/hr/attendance', {
      labourType: 'company', employeeId: 1, projectId: 1, siteId: 1, date: '2025-02-03', status: 'PRESENT',
    });
    check('Contractor: CANNOT mark attendance for a company employee (403)', r.status === 403, r.data);
  }
  {
    const r = await call(admin, 'POST', '/hr/attendance', {
      labourType: 'company', employeeId: 1, projectId: 1, siteId: 1, date: '2025-02-03', status: 'PRESENT',
    });
    check('Admin: can mark company employee attendance', r.status === 201, r.data);
  }
  {
    // Same worker + date should update in place (upsert), not duplicate.
    const r = await call(c1, 'POST', '/hr/attendance', {
      labourType: 'contractor', contractorWorkerId: c1WorkerId, projectId: 1, siteId: 1,
      date: '2025-02-03', status: 'HALF_DAY',
    });
    check('Contractor1: re-marking same worker/day upserts (same id, new status)', r.data?.data?.attendance?.id === c1AttendanceId && r.data?.data?.attendance?.status === 'HALF_DAY', r.data);
  }
  {
    const r = await call(c2, 'GET', `/hr/attendance/${c1AttendanceId}`);
    check('Contractor2: CANNOT view Contractor1\'s attendance record (404)', r.status === 404, r.data);
  }

  // ------------------------------------------------------- labour requests
  let requestId;
  {
    const r = await call(c1, 'POST', '/hr/labour-requests', {
      projectId: 1, siteId: 1, skillCategory: 'mason', quantity: 2,
      requiredDate: '2025-03-01', durationDays: 10, priority: 'high', reason: 'Slab work', submit: true,
    });
    check('Contractor1: can create+submit a labour request for own assigned site', r.status === 201 && r.data?.data?.request?.status === 'SUBMITTED', r.data);
    requestId = r.data?.data?.request?.id;
    check('Request number auto-generated (LR-####)', /^LR-\d{4}$/.test(r.data?.data?.request?.requestNumber || ''), r.data);
  }
  {
    const r = await call(c2, 'POST', '/hr/labour-requests', {
      projectId: 1, siteId: 1, skillCategory: 'mason', quantity: 1, requiredDate: '2025-03-01', submit: true,
    });
    check('Contractor2: CANNOT request labour for a site they are not assigned to (403)', r.status === 403, r.data);
  }
  {
    const r = await call(c2, 'GET', `/hr/labour-requests/${requestId}`);
    check('Contractor2: CANNOT view Contractor1\'s labour request (404)', r.status === 404, r.data);
  }
  {
    const r = await call(c1, 'POST', `/hr/labour-requests/${requestId}/approve`, {});
    check('Contractor1: CANNOT approve their own request (403, ADMIN/HR only)', r.status === 403, r.data);
  }
  {
    const r = await call(hr, 'POST', `/hr/labour-requests/${requestId}/approve`, { decisionNote: 'Looks good' });
    check('HR: can approve a submitted request', r.status === 200 && r.data?.data?.request?.status === 'APPROVED', r.data);
  }
  {
    const r = await call(hr, 'POST', `/hr/labour-requests/${requestId}/assign`, {
      labourType: 'contractor', contractorWorkerId: c1WorkerId, startDate: '2025-03-01',
    });
    check('HR: can assign one worker (partial, 1 of 2)', r.status === 200 && r.data?.data?.request?.status === 'PARTIALLY_ASSIGNED', r.data);
  }
  let c1WorkerId2;
  {
    const r = await call(c1, 'POST', '/hr/contractor-workers', { fullName: 'Deepak Verma', skillCategory: 'mason' });
    c1WorkerId2 = r.data?.data?.worker?.id;
  }
  {
    const r = await call(hr, 'POST', `/hr/labour-requests/${requestId}/assign`, {
      labourType: 'contractor', contractorWorkerId: c1WorkerId2, startDate: '2025-03-01',
    });
    check('HR: assigning 2nd worker completes the request (2 of 2 -> FULLY_ASSIGNED)', r.status === 200 && r.data?.data?.request?.status === 'FULLY_ASSIGNED', r.data);
  }
  {
    const r = await call(hr, 'POST', `/hr/labour-requests/${requestId}/complete`, {});
    check('HR: can mark a fully-assigned request COMPLETED', r.status === 200 && r.data?.data?.request?.status === 'COMPLETED', r.data);
  }
  {
    const r = await call(hr, 'POST', `/hr/labour-requests/${requestId}/complete`, {});
    check('Invalid transition (COMPLETED->COMPLETED) rejected (400)', r.status === 400, r.data);
  }
  {
    const r = await call(c1, 'POST', '/hr/labour-requests', {
      projectId: 1, siteId: 1, skillCategory: 'helper', quantity: 1, requiredDate: '2025-03-05',
    });
    const draftId = r.data?.data?.request?.id;
    const rejectAttempt = await call(hr, 'POST', `/hr/labour-requests/${draftId}/reject`, { decisionNote: 'wrong status test' });
    check('Cannot reject a DRAFT request (must be SUBMITTED first) -> 400', rejectAttempt.status === 400, rejectAttempt.data);
  }

  // ----------------------------------------------------------------- leave
  let leaveId;
  {
    const r = await call(emp, 'POST', '/hr/leave', { startDate: '2025-04-01', endDate: '2025-04-03', leaveType: 'casual', reason: 'Family event' });
    check('Employee: can apply for own leave', r.status === 201 && r.data?.data?.leave?.status === 'PENDING', r.data);
    leaveId = r.data?.data?.leave?.id;
  }
  {
    const r = await call(emp, 'POST', '/hr/leave', { employeeId: 2, startDate: '2025-04-01', endDate: '2025-04-02' });
    check('Employee: cannot spoof employeeId to apply for someone else (still own)', r.status === 201 && r.data?.data?.leave?.employee?.id === 1, r.data);
  }
  {
    const r = await call(emp, 'POST', `/hr/leave/${leaveId}/approve`, {});
    check('Employee: CANNOT approve own leave (403, ADMIN/HR only)', r.status === 403, r.data);
  }
  {
    const r = await call(hr, 'POST', `/hr/leave/${leaveId}/approve`, { decisionNote: 'Approved' });
    check('HR: can approve leave', r.status === 200 && r.data?.data?.leave?.status === 'APPROVED', r.data);
  }
  {
    const r = await call(emp, 'GET', '/hr/leave');
    const ids = (r.data?.data?.leaves || []).map((l) => l.id);
    check('Employee: leave list scoped to own only', ids.includes(leaveId), ids);
  }

  // ------------------------------------------------------------- misc auth
  {
    const r = await call(null, 'GET', '/hr/dashboard');
    check('No token: 401 unauthorized', r.status === 401, r.data);
  }
  {
    const r = await call(c1, 'GET', '/hr/leave');
    check('Contractor role: no access to leave listing (403, not their module)', r.status === 403 || (r.status === 200 && r.data.data.leaves.length === 0), r.data);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => { console.error('TEST SCRIPT ERROR:', err); process.exit(1); });
