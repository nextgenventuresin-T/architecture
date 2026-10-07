'use strict';

const path = require('path');
require('../server/node_modules/dotenv').config({ path: path.resolve(__dirname, '../server/.env') });

const { pool } = require('../server/src/config/db');
const projectModel = require('../server/src/models/projectModel');
const projectService = require('../server/src/services/projectService');
const clientService = require('../server/src/services/clientService');
const toolService = require('../server/src/services/toolService');
const phaseBudgetService = require('../server/src/services/phaseBudgetService');
const dailyWorkService = require('../server/src/services/dailyWorkService');
const warehouseService = require('../server/src/services/warehouseService');
const { PROJECT_PHASES_DEF } = require('../server/src/config/projectPhases');

async function runTests() {
  console.log('=== Starting Phase Budgeting, Tools & Contractor E2E Tests ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // 1. Auto-generated Project Code
    // ----------------------------------------------------
    console.log('Test 1: Project Code Generation');
    const nextCode = await projectModel.nextCode();
    assert(/^PRJ-\d{4,}$/.test(nextCode), `Project code generated correctly: ${nextCode}`);

    // ----------------------------------------------------
    // 2. Client Master CRUD
    // ----------------------------------------------------
    console.log('\nTest 2: Client Master CRUD');
    const testClient = await clientService.create({
      name: `Test Client ${Date.now()}`,
      contact_person: 'Testing Corp',
      email: `client_${Date.now()}@example.com`,
      phone: '9876543210',
      address: '123 Test St, Test City',
      notes: 'Automated test client note',
    });
    assert(testClient && testClient.id, `Created client with ID: ${testClient.id}`);

    const clientList = await clientService.list({ search: 'Testing Corp' });
    assert(clientList.clients.some((c) => c.id === testClient.id), 'Client found in search list');

    // ----------------------------------------------------
    // 3. Tools Master CRUD
    // ----------------------------------------------------
    console.log('\nTest 3: Tools Master CRUD');
    const testTool = await toolService.create({
      name: `Excavator 360_${Date.now()}`,
      type: 'heavy_machinery',
      description: 'Heavy 20T track excavator',
    });
    assert(testTool && testTool.code && /^TOOL-\d{4,}$/.test(testTool.code), `Tool created with auto-code: ${testTool.code}`);

    const toolList = await toolService.list({ search: 'Excavator 360' });
    assert(toolList.tools.some((t) => t.id === testTool.id), 'Tool found in list');

    // ----------------------------------------------------
    // 4. Project Creation with Client & Dates (Auto Duration)
    // ----------------------------------------------------
    console.log('\nTest 4: Project Creation with Auto-Duration & Client');
    const startDate = '2026-01-01';
    const completionDate = '2026-07-01'; // exactly 6 months
    const createdProject = await projectService.create({
      name: `Phase Budgeting Project ${Date.now()}`,
      client_id: testClient.id,
      location: 'Sector 62, Noida',
      description: 'E2E Testing Project for 8-phase budgeting',
      start_date: startDate,
      expected_completion: completionDate,
      project_type: 'commercial',
      status: 'on-track',
    });

    assert(createdProject.id, `Project created with ID: ${createdProject.id}`);
    assert(createdProject.code, `Project has code: ${createdProject.code}`);
    assert(createdProject.expectedDurationMonths >= 5.8 && createdProject.expectedDurationMonths <= 6.2,
      `Project auto-calculated duration ~6.0 months (actual: ${createdProject.expectedDurationMonths})`);

    // Verify 8 default phases were created for the project
    const initialPhases = await phaseBudgetService.getPhases(createdProject.id);
    assert(initialPhases.length === 8, `Project initialized with exactly 8 phases (found: ${initialPhases.length})`);

    // ----------------------------------------------------
    // 5. Phase Budgeting & Rollup to estimated_budget
    // ----------------------------------------------------
    console.log('\nTest 5: Multi-Table Phase Budgeting & Rollup');
    const [materials] = await pool.query('SELECT id, name FROM materials LIMIT 2');
    const mat1 = materials[0] || { id: 1 };
    const mat2 = materials[1] || { id: 2 };

    const phaseUpdates = [
      {
        phaseNumber: 1,
        durationMonths: 2.0,
        status: 'in-progress',
        progress: 40,
        materials: [
          { materialId: mat1.id, plannedQuantity: 100, unitRate: 50, notes: 'Foundation cement' }, // 5,000
          { materialId: mat2.id, plannedQuantity: 200, unitRate: 20, notes: 'Aggregate' },        // 4,000
        ],
        tools: [
          { toolId: testTool.id, procurementType: 'rent', quantity: 1, estimatedCost: 15000, notes: '1 month rental' }, // 15,000
        ],
        labour: [
          { category: 'Excavation Masons', labourType: 'wages', workerCount: 5, durationDays: 10, dailyWageRate: 800, notes: 'Digging team' }, // 40,000
        ],
        misc: [
          { expenseTitle: 'Soil Testing Lab Fee', category: 'Testing', amount: 6000, description: 'Geo-tech report' }, // 6,000
        ],
      },
      {
        phaseNumber: 2,
        durationMonths: 3.5,
        status: 'not-started',
        progress: 0,
        materials: [
          { materialId: mat1.id, plannedQuantity: 500, unitRate: 50, notes: 'Column concrete' }, // 25,000
        ],
        tools: [],
        labour: [],
        misc: [],
      },
    ];

    await phaseBudgetService.savePhases(createdProject.id, phaseUpdates);

    // Fetch updated phases and project
    const updatedPhases = await phaseBudgetService.getPhasesWithDetails(createdProject.id);
    const p1 = updatedPhases.find((p) => p.phaseNumber === 1);
    const p2 = updatedPhases.find((p) => p.phaseNumber === 2);

    // Phase 1 expected: 5000 + 4000 + 15000 + 40000 + 6000 = 70,000
    assert(p1 && Number(p1.budgetTotal) === 70000, `Phase 1 budget calculated: ₹70,000 (actual: ₹${p1?.budgetTotal})`);
    // Phase 2 expected: 25,000
    assert(p2 && Number(p2.budgetTotal) === 25000, `Phase 2 budget calculated: ₹25,000 (actual: ₹${p2?.budgetTotal})`);

    // Verify rollup to projects.estimated_budget (70,000 + 25,000 = 95,000)
    const refreshedProject = await projectModel.findById(createdProject.id);
    assert(Number(refreshedProject.estimated_budget) === 95000,
      `Project estimated_budget rolled up to ₹95,000 (actual: ₹${refreshedProject.estimated_budget})`);

    // ----------------------------------------------------
    // 6. Automatic "delayed" status evaluation
    // ----------------------------------------------------
    console.log('\nTest 6: Automatic Delayed Status on Past Due Projects');
    const pastProject = await projectService.create({
      name: `Past Due Project ${Date.now()}`,
      location: 'Delhi',
      start_date: '2025-01-01',
      expected_completion: '2025-06-01', // Date has passed
      status: 'on-track', // initially requested as on-track
    });

    // Querying through projectModel or projectService automatically triggers delayed status update
    const readPast = await projectModel.findById(pastProject.id);
    assert(readPast.status === 'delayed', `Past due project automatically transitioned to 'delayed' (status: ${readPast.status})`);

    // ----------------------------------------------------
    // 7. Contractor Scoping & Budget Privacy
    // ----------------------------------------------------
    console.log('\nTest 7: Contractor Privacy Boundary (Budgets Hidden)');
    // Find an existing contractor
    const [contractorRows] = await pool.query('SELECT id, name FROM contractors LIMIT 1');
    const testContractor = contractorRows[0] || { id: 1, name: 'Demo Contractor' };

    // Assign contractor to our test project
    await projectModel.updateTeam(createdProject.id, { contractor_id: testContractor.id });

    // Create a site under this project assigned to contractor
    const [siteRes] = await pool.query(
      `INSERT INTO sites (project_id, name, address, contractor_id, status, progress)
       VALUES (?, 'Tower A Foundation', 'North Wing', ?, 'active', 25)`,
      [createdProject.id, testContractor.id]
    );
    const testSiteId = siteRes.insertId;

    // Admin detail view: returns full financials and phase budgets
    const adminDetail = await projectService.getDetail(createdProject.id, { role: 'admin' });
    assert(adminDetail.financials !== null, 'Admin detail includes financials');
    assert(adminDetail.phases[0].materials !== undefined, 'Admin detail includes detailed budget tables');

    // Contractor detail view: returns NO financials and phase detail tables stripped
    const contractorScope = { role: 'contractor', contractorId: testContractor.id };
    const contractorDetail = await projectService.getDetail(createdProject.id, contractorScope);
    assert(contractorDetail.financials === null, 'Contractor detail hides financials (set to null)');
    assert(contractorDetail.phases[0].materials === undefined, 'Contractor detail hides material rate tables');
    assert(contractorDetail.phases[0].title && contractorDetail.phases[0].subcategories,
      'Contractor detail retains phase titles and subcategories');

    // ----------------------------------------------------
    // 8. Contractor Daily Work Submission & Assignment Enforcement
    // ----------------------------------------------------
    console.log('\nTest 8: Contractor Daily Work Submission & Permission Enforcement');
    // Attempt submission to UNASSIGNED contractor (must reject)
    let rejectedAsExpected = false;
    try {
      await dailyWorkService.create(
        {
          project_id: createdProject.id,
          site_id: testSiteId,
          phase_number: 1,
          subcategory: 'Site clearing',
          work_done: 'Unauthorized update attempt',
        },
        [],
        { role: 'contractor', contractorId: 999999 } // unassigned contractor
      );
    } catch (err) {
      rejectedAsExpected = err.statusCode === 403;
    }
    assert(rejectedAsExpected, 'Unauthorized contractor rejected with 403 Forbidden');

    // Valid submission by assigned contractor
    const dailyUpdate = await dailyWorkService.create(
      {
        project_id: createdProject.id,
        site_id: testSiteId,
        phase_number: 1,
        subcategory: 'Excavation',
        work_done: 'Completed 15m deep excavation along column grid A1-A4 with backhoe.',
        work_date: '2026-02-15',
        progress_percentage: 60,
        work_status: 'in-progress',
        remarks: 'Soil density optimal; bedrock reached.',
      },
      [
        {
          filename: 'excavation_site_photo_1.jpg',
          mimetype: 'image/jpeg',
          size: 204850,
        },
      ],
      contractorScope
    );

    assert(dailyUpdate && dailyUpdate.id, `Daily work update created with ID: ${dailyUpdate?.id}`);

    // Verify daily work record retrieved with photo URL
    const workList = await dailyWorkService.list({ projectId: createdProject.id }, contractorScope);
    const recordedUpdate = workList.updates.find((u) => u.id === dailyUpdate.id);
    assert(recordedUpdate !== undefined, 'Daily work update found in contractor query');
    assert(recordedUpdate.photos.length === 1, `Attached work photo recorded (found: ${recordedUpdate?.photos?.length})`);
    assert(recordedUpdate.photos[0].url.includes('/api/daily-work/photos/'), `Photo url generated: ${recordedUpdate?.photos[0]?.url}`);

    // ----------------------------------------------------
    // 9. Contractor Site Warehouse Stock Scoping
    // ----------------------------------------------------
    console.log('\nTest 9: Contractor Site Warehouse Scoping');
    // Call warehouse stock endpoint with contractor scope
    const siteStock = await warehouseService.listProjectSiteStock({}, contractorScope);
    assert(siteStock && Array.isArray(siteStock.projects), 'Site stock retrieved successfully for contractor');

    console.log(`\n========================================`);
    console.log(`E2E Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    // Clean up test data created
    await pool.query('DELETE FROM daily_work_photos WHERE work_update_id = ?', [dailyUpdate.id]);
    await pool.query('DELETE FROM daily_work_updates WHERE id = ?', [dailyUpdate.id]);
    await pool.query('DELETE FROM sites WHERE id = ?', [testSiteId]);
    await pool.query('DELETE FROM project_phase_materials WHERE phase_id IN (SELECT id FROM project_phases WHERE project_id = ?)', [createdProject.id]);
    await pool.query('DELETE FROM project_phase_tools WHERE phase_id IN (SELECT id FROM project_phases WHERE project_id = ?)', [createdProject.id]);
    await pool.query('DELETE FROM project_phase_labour WHERE phase_id IN (SELECT id FROM project_phases WHERE project_id = ?)', [createdProject.id]);
    await pool.query('DELETE FROM project_phase_misc WHERE phase_id IN (SELECT id FROM project_phases WHERE project_id = ?)', [createdProject.id]);
    await pool.query('DELETE FROM project_phases WHERE project_id IN (?, ?)', [createdProject.id, pastProject.id]);
    await pool.query('DELETE FROM projects WHERE id IN (?, ?)', [createdProject.id, pastProject.id]);
    await pool.query('DELETE FROM clients WHERE id = ?', [testClient.id]);
    await pool.query('DELETE FROM tools WHERE id = ?', [testTool.id]);

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Unexpected error during E2E testing:', err);
    process.exit(1);
  }
}

runTests();
