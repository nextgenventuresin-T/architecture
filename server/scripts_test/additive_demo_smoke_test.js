'use strict';

/**
 * End-to-end check for seed_additive_demo.js. It uses the real HTTP API, so
 * this validates authentication, permissions, ownership scope and workflow
 * transitions rather than only checking database rows.
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || 'admin@architectureerp.com';
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'Admin@12345678';
const CONTRACTOR_EMAIL = 'demo.contractor@architecture-erp.local';
const CONTRACTOR_PASSWORD = 'DemoContractor@123';

async function request(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return body.data;
}

async function login(identifier, password) {
  const data = await request('/auth/login', null, { method: 'POST', body: { identifier, password } });
  return data.accessToken;
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

(async () => {
  const contractorToken = await login(CONTRACTOR_EMAIL, CONTRACTOR_PASSWORD);
  const contractor = {};
  contractor.dashboard = await request('/hr/dashboard', contractorToken);
  contractor.workers = await request('/hr/contractor-workers?pageSize=50', contractorToken);
  contractor.attendance = await request('/hr/attendance?pageSize=50', contractorToken);
  contractor.requests = await request('/hr/labour-requests?pageSize=50', contractorToken);
  contractor.projects = await request('/projects?pageSize=50', contractorToken);
  contractor.procurement = await request('/procurement?status=all&pageSize=50', contractorToken);
  contractor.approvals = await request('/approvals/queue?status=all&pageSize=50', contractorToken);

  assert(contractor.workers.workers.length === 15, 'contractor sees all 15 demo workers');
  assert(contractor.attendance.records.length === 15, 'contractor sees only contractor attendance');
  assert(contractor.projects.projects.length === 1, 'contractor sees only the demo project');
  assert(contractor.procurement.requests.some((row) => row.requestNumber === 'DEMO-PR-0001'), 'contractor sees demo request');
  assert(contractor.approvals.approvals.some((row) => row.reference === 'DEMO-PR-0001'), 'contractor sees own procurement approval status');

  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const admin = {};
  const projectRows = await request('/projects?pageSize=50', adminToken);
  const demoProject = projectRows.projects.find((row) => row.code === 'DEMO-RES-TOWER');
  assert(demoProject, 'admin sees demo project');
  const detail = await request(`/projects/${demoProject.id}`, adminToken);
  const siteA = detail.sites.find((site) => site.name === 'DEMO - Tower A');
  assert(siteA, 'admin sees demo Tower A');

  const procurementRows = await request('/procurement?status=all&pageSize=50', adminToken);
  const demoRequest = procurementRows.requests.find((row) => row.requestNumber === 'DEMO-PR-0001');
  assert(demoRequest, 'admin sees demo material request');
  let requestId = demoRequest.id;
  let requestState = await request(`/procurement/${requestId}`, adminToken);

  if (requestState.request.status === 'pending_approval') {
    await request(`/approvals/procurement/${requestId}/decision`, adminToken, { method: 'POST', body: { decision: 'approved', comment: 'DEMO approval for foundation material.' } });
    requestState = await request(`/procurement/${requestId}`, adminToken);
  }
  assert(['approved', 'ordered', 'partially_received', 'received'].includes(requestState.request.status), 'demo request approved or beyond');

  if (requestState.request.status === 'approved') {
    await request(`/procurement/${requestId}/order`, adminToken, {
      method: 'POST',
      body: { po_number: 'DEMO-PO-0001', ordered_quantity: 200, order_date: new Date().toISOString().slice(0, 10), expected_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) },
    });
    requestState = await request(`/procurement/${requestId}`, adminToken);
  }
  assert(requestState.request.purchaseOrder?.poNumber === 'DEMO-PO-0001', 'demo purchase order exists');

  if (requestState.request.status === 'ordered') {
    await request(`/procurement/${requestId}/receiving`, adminToken, {
      method: 'POST',
      body: { received_quantity: 200, receiving_date: new Date().toISOString().slice(0, 10), notes: 'DEMO full delivery' },
    });
    requestState = await request(`/procurement/${requestId}`, adminToken);
  }
  assert(requestState.request.status === 'received', 'demo purchase order fully received');

  const receipts = requestState.receipts || [];
  const warehouseLookups = await request('/warehouse/lookups', adminToken);
  const demoWarehouse = warehouseLookups.warehouses.find((warehouse) => warehouse.code === 'DEMO-WH-001');
  assert(demoWarehouse, 'demo warehouse exists');
  const receipt = receipts[0];
  const alreadyPosted = (await request(`/warehouse/transactions?search=DEMO%20PO%20receiving&pageSize=50`, adminToken)).transactions;
  if (!alreadyPosted.some((transaction) => transaction.procurement?.requestId === requestId)) {
    await request('/warehouse/stock/receipt', adminToken, {
      method: 'POST',
      body: {
        material_id: requestState.request.material.id,
        warehouse_id: demoWarehouse.id,
        project_id: demoProject.id,
        site_id: siteA.id,
        quantity: 200,
        unit: requestState.request.unit,
        procurement_receipt_id: receipt.id,
        procurement_request_id: requestId,
        notes: 'DEMO PO receiving into warehouse',
      },
    });
  }

  const stock = await request(`/warehouse/stock?warehouseId=${demoWarehouse.id}&materialId=${requestState.request.material.id}&pageSize=50`, adminToken);
  const stockRow = stock.stock.find((row) => !row.project || row.project.id === demoProject.id);
  assert(stockRow && Number(stockRow.quantity) >= 2000, 'warehouse stock includes opening stock and receipt');

  const issueTransactions = (await request(`/warehouse/transactions?search=DEMO-ISSUE-0001&pageSize=50`, adminToken)).transactions;
  if (!issueTransactions.length) {
    await request('/warehouse/stock/issue', adminToken, {
      method: 'POST',
      body: { material_id: requestState.request.material.id, warehouse_id: demoWarehouse.id, project_id: demoProject.id, site_id: siteA.id, quantity: 150, unit: requestState.request.unit, reference: 'DEMO-ISSUE-0001', notes: 'DEMO foundation issue' },
    });
  }

  const labourRows = await request('/hr/labour-requests?pageSize=50', adminToken);
  const labourRequest = labourRows.requests.find((row) => row.requestNumber === 'DEMO-LR-0001');
  assert(labourRequest, 'admin sees demo labour request');
  if (labourRequest.status === 'SUBMITTED') await request(`/hr/labour-requests/${labourRequest.id}/review`, adminToken, { method: 'POST' });
  let labourState = await request(`/hr/labour-requests/${labourRequest.id}`, adminToken);
  if (labourState.request.status === 'UNDER_REVIEW') {
    await request(`/hr/labour-requests/${labourRequest.id}/approve`, adminToken, { method: 'POST', body: { decisionNote: 'DEMO labour approved.' } });
    labourState = await request(`/hr/labour-requests/${labourRequest.id}`, adminToken);
  }
  const adminWorkers = await request(`/hr/contractor-workers?contractorId=${demoProject.contractor.id}&pageSize=50`, adminToken);
  const helpers = adminWorkers.workers.filter((worker) => worker.skillCategory === 'Helper').slice(0, 3);
  if (labourState.request.status === 'APPROVED' || labourState.request.status === 'PARTIALLY_ASSIGNED') {
    for (const worker of helpers) {
      const current = await request(`/hr/labour-requests/${labourRequest.id}`, adminToken);
      if (['FULLY_ASSIGNED', 'COMPLETED'].includes(current.request.status)) break;
      await request(`/hr/labour-requests/${labourRequest.id}/assign`, adminToken, { method: 'POST', body: { labourType: 'contractor', contractorWorkerId: worker.id } });
    }
  }
  labourState = await request(`/hr/labour-requests/${labourRequest.id}`, adminToken);
  assert(['FULLY_ASSIGNED', 'PARTIALLY_ASSIGNED', 'APPROVED'].includes(labourState.request.status), 'labour request approved/assigned');

  const finance = await request('/finance/summary', adminToken);
  const reports = await request('/reports/dashboard', adminToken);
  const contractorAfter = await request('/procurement?status=all&pageSize=50', contractorToken);
  const foreignProject = await request('/projects?pageSize=50&contractorId=999999', contractorToken);
  assert(contractorAfter.requests.some((row) => row.requestNumber === 'DEMO-PR-0001'), 'contractor still sees own PO/request status');
  assert(foreignProject.projects.length === 1 && foreignProject.projects[0].code === 'DEMO-RES-TOWER', 'contractor project scope ignores spoofed contractor id');
  assert(Number(finance.summary?.outstandingAmount || 0) >= 80000, 'finance reflects demo outstanding obligation');
  assert(Number(reports.kpis?.totalProjects || 0) >= 1, 'reports reflect demo project');

  console.log(JSON.stringify({
    passed: true,
    contractor: CONTRACTOR_EMAIL,
    workers: contractor.workers.workers.length,
    attendance: contractor.attendance.records.length,
    project: demoProject.name,
    site: siteA.name,
    requestNumber: 'DEMO-PR-0001',
    purchaseOrder: requestState.request.purchaseOrder?.poNumber,
    financeOutstandingAtLeast: 80000,
    labourRequest: 'DEMO-LR-0001',
    labourFinalStatus: labourState.request.status,
    reportsKpis: reports.kpis,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
