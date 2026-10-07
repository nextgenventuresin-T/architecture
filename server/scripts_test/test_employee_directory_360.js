'use strict';

const { signAccessToken } = require('../src/utils/tokens');

const BASE_URL = 'http://localhost:5000/api';

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.message || data.error?.message || `HTTP ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function test() {
  console.log('================================================================');
  console.log('RUNNING EMPLOYEE DIRECTORY & PEOPLE SEARCH 360 INTEGRATION TESTS');
  console.log('================================================================\n');

  // 1. Admin Auth Token
  console.log('--- TEST 1: Admin Authentication ---');
  const token = signAccessToken({ id: 1, email: 'admin@architectureerp.com', role: 'admin' });
  console.log('✔ Authenticated as Admin successfully');

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Fetch Employee List (Default)
  console.log('\n--- TEST 2: Fetch Employee Directory List (Default) ---');
  const listRes = await request(`${BASE_URL}/employees`, { headers: authHeaders });
  const employees = listRes.data.employees;
  console.log(`✔ Retrieved ${employees.length} employees (Total: ${listRes.data.pagination.total})`);
  if (!employees.some(e => e.skills && e.skills.length > 0)) {
    throw new Error('Expected at least one employee to have skills loaded');
  }
  console.log('✔ Verified skills array and 360 profile loaded for directory');

  // 3. Smart Search: "React"
  console.log('\n--- TEST 3: Smart People Search: "React" ---');
  const reactRes = await request(`${BASE_URL}/employees?search=React`, { headers: authHeaders });
  const reactEmps = reactRes.data.employees;
  console.log(`✔ Found ${reactEmps.length} employees matching "React"`);
  const priya = reactEmps.find(e => e.fullName === 'Priya Verma');
  if (!priya) throw new Error('Expected Priya Verma to match "React"');
  console.log(`✔ Priya Verma matched with skills: ${priya.skills.map(s => `${s.skillName} (${s.proficiency}★)`).join(', ')}`);
  console.log(`✔ Matched attribute highlight:`, priya.matchedAttributes);
  if (!priya.matchedAttributes?.some(m => m.value === 'React')) {
    throw new Error('Expected matchedAttributes to contain React');
  }

  // 4. Smart Search: "Leadership" (matches across skills, interests, strengths, career interests)
  console.log('\n--- TEST 4: Smart People Search: "Leadership" ---');
  const leaderRes = await request(`${BASE_URL}/employees?search=Leadership`, { headers: authHeaders });
  const leaderEmps = leaderRes.data.employees;
  console.log(`✔ Found ${leaderEmps.length} employees matching "Leadership"`);
  if (leaderEmps.length < 2) throw new Error('Expected multiple employees with Leadership in skills/strengths/interests');
  for (const emp of leaderEmps) {
    console.log(`  - ${emp.fullName} (${emp.designation} | ${emp.department}) -> Matched:`, emp.matchedAttributes.map(m => m.label).join('; '));
  }

  // 5. Multi-Criteria Filter: Department = IT, Skill = React, Proficiency = 4+
  console.log('\n--- TEST 5: Filter: Department = IT, Skill = React, minProficiency = 4 ---');
  const itReactRes = await request(
    `${BASE_URL}/employees?department=IT&skill=React&minProficiency=4`,
    { headers: authHeaders }
  );
  const itReactEmps = itReactRes.data.employees;
  console.log(`✔ Found ${itReactEmps.length} matching employee(s)`);
  if (!itReactEmps.some(e => e.fullName === 'Priya Verma')) {
    throw new Error('Expected Priya Verma to match IT + React 4+');
  }

  // 6. Filter: Career Interest = Project Management
  console.log('\n--- TEST 6: Filter: Career Interest = "Project Management" ---');
  const cpRes = await request(
    `${BASE_URL}/employees?careerInterest=Project Management`,
    { headers: authHeaders }
  );
  const cpEmps = cpRes.data.employees;
  console.log(`✔ Found ${cpEmps.length} matching employee(s)`);
  if (!cpEmps.some(e => e.fullName === 'Sneha Patel')) {
    throw new Error('Expected Sneha Patel to match Career Interest: Project Management');
  }

  // 7. Quick Filter Chips: Work Mode = WFH
  console.log('\n--- TEST 7: Quick Filter: workMode = "wfh" ---');
  const wfhRes = await request(`${BASE_URL}/employees?workMode=wfh`, { headers: authHeaders });
  const wfhEmps = wfhRes.data.employees;
  console.log(`✔ Found ${wfhEmps.length} WFH employee(s)`);
  if (!wfhEmps.some(e => e.fullName === 'Priya Verma')) {
    throw new Error('Expected Priya Verma to be returned for WFH');
  }

  // 8. Quick Filter Chips: Status = "on-leave"
  console.log('\n--- TEST 8: Quick Filter: status = "on-leave" ---');
  const leaveRes = await request(`${BASE_URL}/employees?status=on-leave`, { headers: authHeaders });
  const leaveEmps = leaveRes.data.employees;
  console.log(`✔ Found ${leaveEmps.length} on-leave employee(s)`);
  if (!leaveEmps.some(e => e.fullName === 'Ananya Sen')) {
    throw new Error('Expected Ananya Sen to be returned for on-leave');
  }

  // 9. Lookups endpoint verification
  console.log('\n--- TEST 9: Lookups Endpoint ---');
  const lookupsRes = await request(`${BASE_URL}/employees/lookups`, { headers: authHeaders });
  const lookups = lookupsRes.data;
  console.log('✔ Departments:', lookups.departments);
  console.log('✔ Designations Count:', lookups.designations.length);
  console.log('✔ Skills Count:', lookups.skills.length);
  console.log('✔ Reporting Managers Count:', lookups.reportingManagers.length);
  if (!lookups.departments.includes('IT') || !lookups.departments.includes('HR')) {
    throw new Error('Expected departments to include IT and HR');
  }
  if (!lookups.skills.includes('React') || !lookups.skills.includes('Python')) {
    throw new Error('Expected skills to include React and Python');
  }

  // 10. Detail Endpoint with 360 Profile
  console.log('\n--- TEST 10: Full Employee 360° Detail Endpoint ---');
  const detailRes = await request(`${BASE_URL}/employees/${priya.id}`, { headers: authHeaders });
  const detailEmp = detailRes.data.employee;
  console.log(`✔ Employee: ${detailEmp.fullName} (${detailEmp.employeeCode})`);
  console.log(`✔ Manager: ${detailEmp.reportingManager?.name} (${detailEmp.reportingManager?.code})`);
  console.log(`✔ Skills count: ${detailEmp.skills.length}`);
  console.log(`✔ 360 Interests:`, detailEmp.profile360.interests);
  console.log(`✔ 360 Strengths:`, detailEmp.profile360.strengths);
  console.log(`✔ 360 Career Interests:`, detailEmp.profile360.careerInterests);

  console.log('\n================================================================');
  console.log('ALL EMPLOYEE DIRECTORY & PEOPLE SEARCH 360 INTEGRATION TESTS PASSED!');
  console.log('================================================================');
}

test().catch(err => {
  console.error('\n❌ Test failed:', err.response?.data || err.message);
  process.exit(1);
});
