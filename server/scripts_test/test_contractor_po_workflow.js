'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');
const { signAccessToken } = require('../src/utils/tokens');

const BASE = 'http://localhost:5000/api';

async function request(endpoint, token, options = {}) {
  const url = `${BASE}${endpoint}`;
  const res = await fetch(url, {
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

// Minimal 1x1 transparent PNG as base64 data URL for testing canvas signatures
const SAMPLE_SIGNATURE_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function run() {
  console.log('================================================================');
  console.log('RUNNING CONTRACTOR MANAGEMENT & PO WORKFLOW INTEGRATION TESTS');
  console.log('================================================================\n');

  // 1. Prepare Auth Tokens
  // Admin user: ID 1
  const adminToken = signAccessToken({ id: 1, email: 'admin@architectureerp.com', role: 'admin' });
  // Contractor 4 user: ID 6 (DEMO - ABC Construction Contractor)
  const contractor4Token = signAccessToken({ id: 6, email: 'demo.contractor@architecture-erp.local', role: 'contractor' });
  // Contractor 1 user: ID 3 (Twinkle Taneja)
  const contractor1Token = signAccessToken({ id: 3, email: 'twinkletaneja7191@gmail.com', role: 'contractor' });

  // Get project and site ID for testing
  const [projects] = await pool.query('SELECT id, code, name FROM projects LIMIT 1');
  assert(projects.length > 0, 'At least 1 project must exist in database');
  const testProject = projects[0];

  const [sites] = await pool.query('SELECT id, name FROM sites WHERE project_id = ? LIMIT 1', [testProject.id]);
  const testSiteId = sites.length > 0 ? sites[0].id : null;

  // Contractor 4 ID in contractors table
  const testContractorId = 4;

  console.log(`Using Project: ${testProject.name} (ID: ${testProject.id}), Site ID: ${testSiteId}, Contractor ID: ${testContractorId}`);

  // --------------------------------------------------------------------------
  // TEST 1: Contractor Documents CRUD
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 1: Contractor Documents Repository ---');
  // Insert document directly to model / verify upload metadata
  const docModel = require('../src/models/contractorDocumentModel');
  const createdDoc = await docModel.create({
    contractorId: testContractorId,
    documentType: 'gst_tax',
    documentName: 'GST Registration Certificate 2026.pdf',
    filePath: 'contractor_documents/test_gst_cert.pdf',
    fileSize: 10240,
    mimeType: 'application/pdf',
    uploadedBy: 1,
    notes: 'Official GSTIN document verified',
  });
  assert(createdDoc && createdDoc.id, 'Document must be created in DB');
  console.log(`✔ Created contractor document with ID ${createdDoc.id}`);

  // Fetch via Admin HTTP API
  const docsRes = await request(`/contractors/${testContractorId}/documents`, adminToken);
  assert(docsRes.ok, 'Admin GET /contractors/:id/documents must return 200');
  const foundDoc = docsRes.data.data.documents.find((d) => d.id === createdDoc.id);
  assert(foundDoc, 'Created document must appear in list');
  console.log(`✔ Verified document in Admin list: ${foundDoc.documentName} (${foundDoc.documentType})`);

  // Delete test document
  const delDocRes = await request(`/contractors/${testContractorId}/documents/${createdDoc.id}`, adminToken, {
    method: 'DELETE',
  });
  assert(delDocRes.ok, 'Admin DELETE document must return 200');
  console.log('✔ PASS: Contractor Documents CRUD verified');

  // --------------------------------------------------------------------------
  // TEST 2: PO Creation with Auto-Numbering & Milestone Budgeting
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: PO Creation with Dynamic Milestones ---');
  const poPayload = {
    projectId: testProject.id,
    siteId: testSiteId,
    poDate: '2026-09-23',
    validityDate: '2026-12-31',
    workDescription: 'RCC Framework, Structural Columns, and Boundary Wall Construction',
    totalAmount: 500000,
    advanceAmount: 50000,
    materialAmount: 250000,
    labourAmount: 200000,
    paymentTerms: 'Payment within 7 days of milestone sign-off by Site Engineer.',
    termsConditions: [
      'Quality of materials must strictly adhere to IS 456-2000 standards.',
      'Safety equipment (helmets, vests, harnesses) mandatory at all times.',
      'Liquidated damages of 0.5% per week of delay up to max 5%.',
    ],
    milestones: [
      {
        milestoneName: 'Foundation & Excavation Signoff',
        percentage: 20,
        amount: 100000,
        conditionTrigger: 'Completion of 100% footing excavation and PCC bed',
        remarks: 'Subject to soil bearing test certification',
      },
      {
        milestoneName: 'Ground Floor Columns & Slab Pouring',
        percentage: 40,
        amount: 200000,
        conditionTrigger: 'Casting of all GF columns and roof slab beam shuttering',
        remarks: 'Cube compressive strength test results required after 7 days',
      },
      {
        milestoneName: 'First Floor Framework & Masonry',
        percentage: 30,
        amount: 150000,
        conditionTrigger: 'Completion of brickwork and lintels',
        remarks: 'Plumbing conduits to be laid prior to plastering',
      },
      {
        milestoneName: 'Final Finishing & Retention Release',
        percentage: 10,
        amount: 50000,
        conditionTrigger: 'Final inspection signoff and site clearance',
        remarks: 'Release of defect liability retention after 30 days',
      },
    ],
  };

  const createPoRes = await request(`/contractors/${testContractorId}/pos`, adminToken, {
    method: 'POST',
    body: poPayload,
  });
  assert(createPoRes.ok, `PO creation failed: ${JSON.stringify(createPoRes.data)}`);
  const po1 = createPoRes.data.data.po;
  assert(po1 && po1.id, 'PO ID must be present');
  assert(po1.poNumber.startsWith('CPO-'), `PO Number must start with CPO-, got ${po1.poNumber}`);
  assert.strictEqual(po1.status, 'draft', 'Initial status must be draft');
  assert.strictEqual(Number(po1.totalAmount), 500000, 'Total amount must match 500000');
  assert.strictEqual(po1.milestones.length, 4, 'Must create 4 milestones');
  console.log(`✔ PO created successfully: ${po1.poNumber} with 4 milestones`);

  // Verify Initial PO PDF was generated
  const poModel = require('../src/models/contractorPoModel');
  const po1Db = await poModel.findById(po1.id);
  const initialPdfPath = po1Db.pdf_path || po1Db.pdfPath || po1.pdfPath;
  assert(initialPdfPath && fs.existsSync(initialPdfPath), `PO PDF file must exist at ${initialPdfPath}`);
  console.log(`✔ Verified generated PO PDF on disk: ${initialPdfPath}`);

  // --------------------------------------------------------------------------
  // TEST 3: Send PO (draft -> sent)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Admin Sends PO to Contractor ---');
  const sendRes = await request(`/contractors/pos/${po1.id}/send`, adminToken, {
    method: 'POST',
  });
  assert(sendRes.ok, `Sending PO failed: ${JSON.stringify(sendRes.data)}`);
  assert.strictEqual(sendRes.data.data.po.status, 'sent', 'Status must transition to sent');
  console.log(`✔ Status transitioned to 'sent' for ${po1.poNumber}`);

  // --------------------------------------------------------------------------
  // TEST 4: Contractor Portal Access & Auto-Mark 'viewed'
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Contractor Views PO in Portal ---');
  // Contractor 4 lists contracts
  const portalListRes = await request('/contractor-portal/contracts', contractor4Token);
  assert(portalListRes.ok, 'Contractor GET /contractor-portal/contracts must succeed');
  const contractorPos = portalListRes.data.data.pos || portalListRes.data.data;
  assert(contractorPos.some((p) => p.id === po1.id), 'Contractor must see issued PO');
  console.log(`✔ Contractor received list containing ${po1.poNumber}`);

  // Contractor 4 views PO detail
  const portalDetailRes = await request(`/contractor-portal/contracts/${po1.id}`, contractor4Token);
  assert(portalDetailRes.ok, `Contractor detail failed: ${JSON.stringify(portalDetailRes.data)}`);
  const po1Viewed = portalDetailRes.data.data.po;
  assert.strictEqual(po1Viewed.status, 'viewed', 'Status must auto-transition from sent to viewed upon opening');
  console.log(`✔ Status auto-transitioned to 'viewed' upon contractor opening`);

  // --------------------------------------------------------------------------
  // TEST 5: Contractor Rejection Flow (Tested with secondary PO)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Contractor Rejection Flow with Mandatory Reason ---');
  const rejectPoPayload = {
    ...poPayload,
    workDescription: 'Secondary Order for Rejection Testing',
    totalAmount: 75000,
    advanceAmount: 0,
    materialAmount: 35000,
    labourAmount: 40000,
    milestones: [{ milestoneName: 'Single Milestone', percentage: 100, amount: 75000 }],
  };
  const createPo2Res = await request(`/contractors/${testContractorId}/pos`, adminToken, {
    method: 'POST',
    body: rejectPoPayload,
  });
  const po2 = createPo2Res.data.data.po;
  await request(`/contractors/pos/${po2.id}/send`, adminToken, { method: 'POST' });

  // Attempt rejection without reason (must fail validation)
  const failRejectRes = await request(`/contractor-portal/contracts/${po2.id}/reject`, contractor4Token, {
    method: 'POST',
    body: { reason: '' },
  });
  assert([400, 422].includes(failRejectRes.status), `Rejection without reason must fail with 400/422, got ${failRejectRes.status}`);
  console.log('✔ Rejection validation enforced (mandatory reason required)');

  // Submit valid rejection
  const validRejectRes = await request(`/contractor-portal/contracts/${po2.id}/reject`, contractor4Token, {
    method: 'POST',
    body: { reason: 'Material rates quoted do not reflect current cement and steel price escalation.' },
  });
  assert(validRejectRes.ok, 'Rejection with reason must succeed');
  assert.strictEqual(validRejectRes.data.data.po.status, 'rejected');
  assert.strictEqual(
    validRejectRes.data.data.po.rejectionReason,
    'Material rates quoted do not reflect current cement and steel price escalation.'
  );
  console.log(`✔ PO ${po2.poNumber} successfully transitioned to 'rejected' with reason logged`);

  // --------------------------------------------------------------------------
  // TEST 6: Contractor Acceptance (viewed -> accepted)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Contractor Accepts Purchase Order ---');
  const acceptRes = await request(`/contractor-portal/contracts/${po1.id}/accept`, contractor4Token, {
    method: 'POST',
  });
  assert(acceptRes.ok, `Acceptance failed: ${JSON.stringify(acceptRes.data)}`);
  assert.strictEqual(acceptRes.data.data.po.status, 'accepted', 'Status must transition to accepted');
  console.log(`✔ PO ${po1.poNumber} transitioned to 'accepted'`);

  // --------------------------------------------------------------------------
  // TEST 7: Contractor Digital Signature (accepted -> contractor_signed)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Contractor Signs Agreement Digitally ---');
  const signContractorRes = await request(`/contractor-portal/contracts/${po1.id}/sign`, contractor4Token, {
    method: 'POST',
    body: {
      signature_data: SAMPLE_SIGNATURE_BASE64,
      signer_name: 'Rajesh Sharma (Managing Partner)',
    },
  });
  assert(signContractorRes.ok, `Contractor sign failed: ${JSON.stringify(signContractorRes.data)}`);
  const po1SignedByContractor = signContractorRes.data.data.po;
  assert.strictEqual(po1SignedByContractor.status, 'contractor_signed');
  assert.strictEqual(po1SignedByContractor.contractorSignedName, 'Rajesh Sharma (Managing Partner)');
  assert(po1SignedByContractor.contractorSignedAt, 'Contractor signed timestamp must be set');
  console.log(`✔ PO ${po1.poNumber} signed by contractor, status: 'contractor_signed'`);

  // --------------------------------------------------------------------------
  // TEST 8: Company Counter-Signature & Contract Execution (contractor_signed -> contract_signed)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Company Executive Counter-Signs and Seals Contract ---');
  const signCompanyRes = await request(`/contractors/pos/${po1.id}/sign-company`, adminToken, {
    method: 'POST',
    body: {
      signature_data: SAMPLE_SIGNATURE_BASE64,
      signer_name: 'Twinkle Taneja',
      designation: 'Project Director & Authorized Officer',
    },
  });
  assert(signCompanyRes.ok, `Company sign failed: ${JSON.stringify(signCompanyRes.data)}`);
  const po1Executed = signCompanyRes.data.data.po;
  assert.strictEqual(po1Executed.status, 'contract_signed', 'Status must transition to contract_signed');
  assert.strictEqual(po1Executed.companySignedName, 'Twinkle Taneja');
  assert.strictEqual(po1Executed.companySignedDesignation, 'Project Director & Authorized Officer');
  assert(po1Executed.companySignedAt, 'Company signed timestamp must be set');
  console.log(`✔ Contract successfully executed and sealed: status 'contract_signed'`);

  // --------------------------------------------------------------------------
  // TEST 9: Final Signed Contract PDF Verification
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Final Dual-Signed PDF Verification ---');
  const po1ExecutedDb = await poModel.findById(po1.id);
  const signedPdfPath = po1ExecutedDb.signed_pdf_path || po1ExecutedDb.signedPdfPath || po1Executed.signedPdfPath;
  assert(signedPdfPath, 'Signed PDF path must be recorded');
  assert(fs.existsSync(signedPdfPath), `Signed contract PDF must exist on disk at ${signedPdfPath}`);
  const pdfStat = fs.statSync(signedPdfPath);
  assert(pdfStat.size > 500, `Signed PDF must have substantial content (size: ${pdfStat.size} bytes)`);
  console.log(`✔ Verified Final Signed Contract PDF on disk: ${signedPdfPath} (${pdfStat.size} bytes)`);

  // Verify HTTP PDF download endpoint returns 200
  const downloadRes = await fetch(`${BASE}/contractor-portal/contracts/${po1.id}/download?signed=true`, {
    headers: { Authorization: `Bearer ${contractor4Token}` },
  });
  assert.strictEqual(downloadRes.status, 200, 'Contractor download must return 200 OK');
  const pdfBuffer = await downloadRes.arrayBuffer();
  assert(pdfBuffer.byteLength > 500, 'Downloaded file must contain PDF bytes');
  console.log(`✔ Contractor successfully downloaded executed contract PDF (${pdfBuffer.byteLength} bytes)`);

  // --------------------------------------------------------------------------
  // TEST 10: Dynamic Milestone Completion & Real Financial Ledgers
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Milestone Completion & Financial Rollups ---');
  const firstMilestone = po1Executed.milestones[0];
  const completeMilestoneRes = await request(
    `/contractors/pos/${po1.id}/milestones/${firstMilestone.id}/complete`,
    adminToken,
    {
      method: 'POST',
      body: { notes: 'Excavation completed and concrete test reports approved by structural consultant.' },
    }
  );
  assert(completeMilestoneRes.ok, `Milestone completion failed: ${JSON.stringify(completeMilestoneRes.data)}`);
  const po1MilestoneUpdated = completeMilestoneRes.data.data.po;
  const m1 = po1MilestoneUpdated.milestones.find((m) => m.id === firstMilestone.id);
  assert.strictEqual(m1.status, 'completed', 'Milestone status must be completed');
  assert(m1.completedAt, 'Milestone completedAt timestamp must be recorded');
  console.log(`✔ Milestone '${m1.milestoneName}' marked completed. Due amount: ${m1.amount}`);

  // Check contractor portal summary endpoint
  const portalSummaryRes = await request('/contractor-portal/contracts/summary', contractor4Token);
  assert(portalSummaryRes.ok, 'Summary endpoint must return 200');
  const summary = portalSummaryRes.data.data.summary;
  assert(Number(summary.totalPoValue) >= 500000, 'Total PO value must include 500000');
  assert(Number(summary.completedMilestones) >= 1, 'Completed milestones must be at least 1');
  console.log(`✔ Financial dashboard rollup verified: Total PO Value: ₹${summary.totalPoValue}, Due/Certified: ₹${summary.totalDue}`);

  // --------------------------------------------------------------------------
  // TEST 11: Security & Strict Data Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 11: Security & Strict Multi-Tenant Contractor Isolation ---');
  // Contractor 1 (Twinkle Taneja) must NOT see Contractor 4's PO
  const c1PortalListRes = await request('/contractor-portal/contracts', contractor1Token);
  assert(c1PortalListRes.ok, 'Contractor 1 GET /contractor-portal/contracts must succeed');
  const c1Pos = c1PortalListRes.data.data.pos || c1PortalListRes.data.data;
  assert(!c1Pos.some((p) => p.id === po1.id), 'Contractor 1 must NEVER see Contractor 4 PO in list');
  console.log(`✔ Contractor 1 cannot see Contractor 4 PO in contracts list`);

  // Contractor 1 cannot fetch Contractor 4 PO detail
  const c1DetailRes = await request(`/contractor-portal/contracts/${po1.id}`, contractor1Token);
  assert([403, 404].includes(c1DetailRes.status), `Contractor 1 fetching Contractor 4 PO must return 403/404, got ${c1DetailRes.status}`);
  console.log(`✔ Contractor 1 blocked with HTTP ${c1DetailRes.status} when querying Contractor 4 PO detail`);

  // Contractor cannot call Admin create PO endpoint
  const unauthorizedCreate = await request(`/contractors/${testContractorId}/pos`, contractor4Token, {
    method: 'POST',
    body: poPayload,
  });
  assert(
    [401, 403].includes(unauthorizedCreate.status),
    `Contractor calling admin PO creation must be rejected with 401 or 403, got ${unauthorizedCreate.status}`
  );
  console.log(`✔ Contractor blocked from admin PO creation (HTTP ${unauthorizedCreate.status})`);

  // Contractor cannot modify total amount or milestones on signed PO
  const contractorTamperRes = await request(`/contractors/pos/${po1.id}`, contractor4Token, {
    method: 'PATCH',
    body: { totalAmount: 9999999 },
  });
  assert(
    [401, 403].includes(contractorTamperRes.status),
    `Contractor modifying PO must be rejected with 401/403, got ${contractorTamperRes.status}`
  );
  console.log(`✔ Contractor cannot alter PO amounts or milestones (HTTP ${contractorTamperRes.status})`);

  // --------------------------------------------------------------------------
  // TEST 12: Lifecycle Timeline Audit
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 12: 9-Stage Lifecycle Timeline Verification ---');
  const timelineRes = await request(`/contractors/pos/${po1.id}/timeline`, adminToken);
  assert(timelineRes.ok, 'Timeline endpoint must return 200');
  const timeline = timelineRes.data.data.timeline;
  assert(Array.isArray(timeline) && timeline.length >= 7, 'Timeline must return lifecycle steps');
  console.log(`✔ Lifecycle timeline verified with ${timeline.length} audit steps`);

  console.log('\n================================================================');
  console.log('ALL CONTRACTOR MANAGEMENT & PO WORKFLOW INTEGRATION TESTS PASSED!');
  console.log('================================================================\n');

  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ INTEGRATION TEST FAILED:', err);
  process.exit(1);
});
