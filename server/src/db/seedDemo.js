'use strict';

/**
 * Populates the project/site tables with realistic demo records so the
 * interface can be exercised before real data exists.
 *
 * Idempotent: it clears only the tables it owns, then reinserts. It never
 * touches users, roles or refresh_tokens, so logins survive re-seeding.
 *
 * Run with `npm run db:seed:demo`.
 */
const { pool } = require('../config/db');

const day = 86400000;
const shift = (days) => new Date(Date.now() + days * day).toISOString().slice(0, 10);

async function seed() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of [
      'approval_requests', 'project_documents', 'project_issues', 'contractor_payments',
      'expenses', 'material_entries', 'labour_records', 'site_activities',
      'project_tasks', 'sites', 'projects', 'contractors', 'employees', 'clients',
    ]) {
      await connection.query(`TRUNCATE TABLE \`${table}\``);
    }
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    // ---- directory ----
    await connection.query(
      `INSERT INTO clients (id, name, contact_person, email, phone, address) VALUES
       (1,'Silverleaf Developers','Anita Bansal','anita@silverleaf.in','+91 98140 22011','Leela Bhawan, Patiala'),
       (2,'Punjab Municipal Board','R. K. Grewal','rkg@pmb.gov.in','+91 98150 77420','Sector 62, Mohali'),
       (3,'Northgate Logistics','Vikram Sethi','vikram@northgate.co.in','+91 98721 33108','Focal Point, Ludhiana'),
       (4,'Meridian Estates','Sunil Chopra','sunil@meridian.in','+91 99887 65432','Airport Road, Zirakpur')`
    );

    await connection.query(
      `INSERT INTO employees (id, full_name, designation, email, phone) VALUES
       (1,'Ritu Sharma','Project Manager','ritu.sharma@architecture-erp.local','+91 98765 10001'),
       (2,'Arjun Mehta','Project Manager','arjun.mehta@architecture-erp.local','+91 98765 10002'),
       (3,'Neha Kapoor','Architect','neha.kapoor@architecture-erp.local','+91 98765 10003'),
       (4,'Iqbal Singh','Architect','iqbal.singh@architecture-erp.local','+91 98765 10004'),
       (5,'Harpreet Singh','Site Engineer','harpreet.singh@architecture-erp.local','+91 98765 10005'),
       (6,'Meera Nair','Site Engineer','meera.nair@architecture-erp.local','+91 98765 10006'),
       (7,'Deepak Verma','Site Engineer','deepak.verma@architecture-erp.local','+91 98765 10007')`
    );

    await connection.query(
      `INSERT INTO contractors (id, name, contact_person, email, phone, address, speciality, rating) VALUES
       (1,'Gurmeet Constructions','Gurmeet Sandhu','gurmeet@gcon.in','+91 98141 20001','Rajpura Road, Patiala','RCC & structural work',4.4),
       (2,'Balaji Infra Works','Suresh Balaji','suresh@balajiinfra.in','+91 98142 20002','Sector 70, Mohali','Civil & finishing',3.6),
       (3,'Sandhu Builders','Jaspal Sandhu','jaspal@sandhubuilders.in','+91 98143 20003','Focal Point, Ludhiana','Pre-engineered structures',4.7),
       (4,'Khanna & Sons','Rakesh Khanna','rakesh@khannasons.in','+91 98144 20004','Bhadson Road, Patiala','Masonry & brickwork',4.1)`
    );

    // ---- projects ----
    await connection.query(
      `INSERT INTO projects
        (id, code, name, client_id, project_type, description, location, start_date, expected_completion,
         estimated_budget, project_manager_id, architect_id, site_engineer_id, contractor_id, status, progress, current_phase)
       VALUES
       (1,'PRJ-1042','Silverleaf Residency — Tower B',1,'residential',
        'Fourteen-storey residential tower with two basement parking levels and a landscaped podium.',
        'Rajpura Road, Patiala',?,?,185000000,1,3,5,1,'on-track',72,'Superstructure'),
       (2,'PRJ-1038','Civic Centre Annexe',2,'institutional',
        'Three-floor annexe to the existing civic centre, including a public records hall.',
        'Sector 62, Mohali',?,?,96000000,2,4,6,2,'delayed',48,'Finishing'),
       (3,'PRJ-1051','Northgate Warehouse Phase 1',3,'industrial',
        'Pre-engineered steel warehouse with a 12m clear height and loading docks.',
        'Focal Point, Ludhiana',?,?,132000000,1,3,7,3,'on-track',91,'Services'),
       (4,'PRJ-1047','Meridian Office Park',4,'commercial',
        'Two office blocks around a shared courtyard, with basement services.',
        'Airport Road, Zirakpur',?,?,241000000,2,4,5,1,'attention',35,'Substructure'),
       (5,'PRJ-1029','Green Meadows Villas',1,'residential',
        'Twelve independent villas with shared internal roads and a community block.',
        'Bhadson Road, Patiala',?,?,88000000,1,3,6,4,'on-track',64,'Masonry')`,
      [shift(-186), shift(94), shift(-232), shift(-11), shift(-274), shift(28),
       shift(-118), shift(163), shift(-201), shift(72)]
    );

    await connection.query(
      `INSERT INTO sites (id, project_id, name, address, site_engineer_id, contractor_id, labour_count, progress, status, safety_status) VALUES
       (1,1,'Tower B — Main Site','Rajpura Road, Patiala',5,1,84,72,'on-track','safe'),
       (2,1,'Tower B — Podium & Landscape','Rajpura Road, Patiala',5,1,22,40,'on-track','safe'),
       (3,2,'Civic Annexe Site','Sector 62, Mohali',6,2,47,48,'delayed','caution'),
       (4,3,'Northgate Yard','Focal Point, Ludhiana',7,3,62,91,'on-track','safe'),
       (5,4,'Meridian Block A','Airport Road, Zirakpur',5,1,31,35,'attention','caution'),
       (6,5,'Green Meadows Cluster 1','Bhadson Road, Patiala',6,4,39,64,'on-track','safe')`
    );

    // ---- tasks (drive planned vs actual progress) ----
    const tasks = [
      [1, 'Substructure', 'Excavation and PCC', 'completed', -180, -150, -148, 2],
      [1, 'Substructure', 'Raft foundation', 'completed', -150, -110, -112, 3],
      [1, 'Superstructure', 'Columns up to 8th floor', 'completed', -110, -40, -38, 3],
      [1, 'Superstructure', '8th floor slab', 'in-progress', -40, 10, null, 2],
      [1, 'Finishing', 'Internal plastering', 'pending', 20, 70, null, 2],
      [1, 'Services', 'Electrical conduiting', 'pending', 30, 85, null, 2],
      [2, 'Substructure', 'Foundation works', 'completed', -228, -180, -175, 3],
      [2, 'Superstructure', 'Frame and slabs', 'completed', -180, -90, -84, 3],
      [2, 'Finishing', 'Plastering', 'delayed', -60, -20, null, 2],
      [2, 'Finishing', 'Flooring', 'pending', -15, 30, null, 2],
      [2, 'Services', 'Plumbing rough-in', 'delayed', -40, -5, null, 2],
      [3, 'Substructure', 'Pad foundations', 'completed', -270, -220, -218, 2],
      [3, 'Superstructure', 'Steel frame erection', 'completed', -220, -120, -118, 3],
      [3, 'Superstructure', 'Roof sheeting', 'completed', -120, -10, -8, 3],
      [3, 'Services', 'Electrical conduit routing', 'in-progress', -10, 20, null, 2],
      [3, 'Finishing', 'Dock levellers', 'pending', 5, 25, null, 1],
      [4, 'Substructure', 'Site clearance', 'completed', -115, -90, -88, 1],
      [4, 'Substructure', 'Excavation Block A', 'delayed', -90, -20, null, 3],
      [4, 'Superstructure', 'Raft and columns', 'pending', -10, 80, null, 3],
      [4, 'Finishing', 'Facade', 'pending', 90, 150, null, 2],
      [5, 'Substructure', 'Foundations villas 1-6', 'completed', -198, -150, -147, 3],
      [5, 'Masonry', 'Brickwork villas 1-3', 'completed', -150, -80, -78, 2],
      [5, 'Masonry', 'Brickwork villas 4-6', 'in-progress', -80, 10, null, 2],
      [5, 'Finishing', 'Roofing and plaster', 'pending', 15, 65, null, 2],
    ];
    await connection.query(
      `INSERT INTO project_tasks (project_id, phase, name, status, planned_start, planned_end, actual_end, weight) VALUES ?`,
      [tasks.map(([p, ph, n, s, ps, pe, ae, w]) => [p, ph, n, s, shift(ps), shift(pe), ae === null ? null : shift(ae), w])]
    );

    // ---- daily activity ----
    const activities = [
      [1, 0, 'Eighth-floor slab shuttering completed; steel binding in progress.', 84, 'Gurmeet Constructions — RCC crew', 'Tower crane, concrete pump', 96000, null, 'Slab pour scheduled for tomorrow morning.'],
      [1, -1, 'Column casting for 8th floor finished.', 81, 'Gurmeet Constructions — RCC crew', 'Tower crane', 88000, null, 'Cube samples sent for testing.'],
      [1, -2, 'Reinforcement placement on 8th floor.', 79, 'Gurmeet Constructions', 'Bar bending machine', 74000, null, ''],
      [3, 0, 'Plastering halted — cement delivery delayed by two days.', 47, 'Balaji Infra Works — finishing crew', 'Mortar mixer', 41000, 'Cement stock exhausted; plastering crew idle.', 'Material request raised with procurement.'],
      [3, -1, 'Internal plastering on ground floor continued.', 52, 'Balaji Infra Works', 'Mortar mixer, scaffolding', 58000, null, ''],
      [4, 0, 'Roof sheeting finished; electrical conduit routing started on east bay.', 62, 'Sandhu Builders — services crew', 'Boom lift', 71000, null, 'Sheeting handover signed by site engineer.'],
      [4, -1, 'Final roof sheeting panels installed.', 60, 'Sandhu Builders', 'Boom lift, crane', 69000, null, ''],
      [5, 0, 'Excavation stopped after water table hit at 4.2m.', 31, 'Gurmeet Constructions — earthworks', 'Excavator, dewatering pump', 52000, 'Water table reached at 4.2m; dewatering capacity insufficient.', 'Geotechnical survey requested from consultant.'],
      [6, 0, 'Villas 4 and 5 brickwork reached lintel level.', 39, 'Khanna & Sons — masonry crew', 'Mortar mixer', 44000, null, ''],
      [6, -1, 'Villa 4 brickwork up to sill level.', 37, 'Khanna & Sons', 'Mortar mixer', 42000, null, ''],
    ];
    await connection.query(
      `INSERT INTO site_activities (site_id, activity_date, work_completed, labour_present, contractor_activity, equipment_used, expenses, issues, notes) VALUES ?`,
      [activities.map(([s, d, w, l, c, e, x, i, n]) => [s, shift(d), w, l, c, e, x, i, n])]
    );

    // ---- labour ----
    const labour = [
      [1, 1, 'Mason', 24, 22, 0, 780, 'pending'], [1, 1, 'Helper', 34, 32, 0, 620, 'pending'],
      [1, 1, 'Bar bender', 18, 17, 0, 850, 'cleared'], [1, 1, 'Carpenter', 14, 13, 0, 900, 'pending'],
      [3, 2, 'Mason', 18, 15, 0, 760, 'overdue'], [3, 2, 'Helper', 22, 20, 0, 600, 'overdue'],
      [3, 2, 'Painter', 9, 7, 0, 820, 'pending'],
      [4, 3, 'Fitter', 26, 25, 0, 940, 'cleared'], [4, 3, 'Helper', 24, 23, 0, 620, 'cleared'],
      [4, 3, 'Electrician', 14, 14, 0, 980, 'cleared'],
      [5, 1, 'Excavation crew', 18, 16, 0, 700, 'pending'], [5, 1, 'Helper', 15, 15, 0, 600, 'pending'],
      [6, 4, 'Mason', 20, 19, 0, 760, 'pending'], [6, 4, 'Helper', 19, 18, 0, 600, 'cleared'],
    ];
    await connection.query(
      `INSERT INTO labour_records (site_id, contractor_id, category, worker_count, present_count, record_date, daily_rate, payment_status) VALUES ?`,
      [labour.map(([s, c, cat, w, p, d, r, st]) => [s, c, cat, w, p, shift(d), r, st])]
    );

    // ---- materials received ----
    const entries = [
      [1, 1, 1, 2400, 1810, 415, 'Ambuja Depot, Patiala', -40],
      [1, 1, 5, 68, 51, 68500, 'Sandhu Steel Traders', -55],
      [1, 1, 2, 320, 240, 1450, 'Ghaggar Sand Suppliers', -30],
      [1, 2, 7, 1800, 260, 780, 'Kajaria Distributor, Patiala', -12],
      [2, 3, 1, 1600, 1590, 415, 'Ambuja Depot, Mohali', -60],
      [2, 3, 12, 420, 310, 285, 'Asian Paints Dealer', -18],
      [2, 3, 4, 180, 172, 8200, 'Nabha Brick Kiln', -70],
      [3, 4, 5, 142, 138, 68500, 'Ludhiana Steel Corp', -120],
      [3, 4, 13, 220, 96, 1650, 'Havells Distributor', -14],
      [4, 5, 3, 260, 84, 1180, 'Zirakpur Stone Depot', -22],
      [4, 5, 6, 180, 96, 5400, 'UltraTech RMC', -16],
      [5, 6, 4, 240, 196, 8200, 'Bhadson Brick Works', -45],
      [5, 6, 1, 900, 720, 415, 'Ambuja Depot, Patiala', -35],
      [5, 6, 10, 320, 140, 2100, 'Patiala Timber Mart', -20],
    ];
    await connection.query(
      `INSERT INTO material_entries (project_id, site_id, material_id, quantity, used_quantity, rate, supplier, received_date) VALUES ?`,
      [entries.map(([p, s, m, q, u, r, sup, d]) => [p, s, m, q, u, r, sup, shift(d)])]
    );

    // ---- expenses ----
    const expenses = [
      [1, 1, 'material', 'Cement and steel procurement — March', 4860000, -30],
      [1, 1, 'labour', 'Labour payment — RCC crew', 2140000, -14],
      [1, 1, 'equipment', 'Tower crane monthly hire', 620000, -10],
      [1, 2, 'material', 'Tile consignment for podium', 1404000, -12],
      [2, 3, 'material', 'Paint and finishing materials', 1197000, -18],
      [2, 3, 'labour', 'Finishing crew wages', 1480000, -12],
      [2, 3, 'overhead', 'Site office and utilities', 210000, -8],
      [3, 4, 'material', 'Structural steel supply', 9727000, -120],
      [3, 4, 'labour', 'Erection crew payment', 2860000, -20],
      [4, 5, 'material', 'Aggregate and RMC', 1279200, -20],
      [4, 5, 'equipment', 'Excavator and dewatering pumps', 480000, -6],
      [5, 6, 'material', 'Bricks and cement', 2341000, -40],
      [5, 6, 'labour', 'Masonry crew wages', 1620000, -10],
    ];
    await connection.query(
      `INSERT INTO expenses (project_id, site_id, category, description, amount, expense_date) VALUES ?`,
      [expenses.map(([p, s, c, d, a, dt]) => [p, s, c, d, a, shift(dt)])]
    );

    await connection.query(
      `INSERT INTO contractor_payments (project_id, contractor_id, contract_value, paid_amount, payment_status) VALUES
       (1,1,124000000,98500000,'pending'),
       (2,2,61000000,49800000,'overdue'),
       (3,3,92000000,92000000,'cleared'),
       (4,1,158000000,42000000,'pending'),
       (5,4,54000000,46700000,'pending')`
    );

    // ---- issues ----
    const issues = [
      [4, 5, 'Water table reached at 4.2m during excavation', 'Dewatering capacity is insufficient for the volume encountered. Geotechnical survey requested.', 'high', 'open', 0],
      [2, 3, 'Cement delivery missed twice', 'Plastering crew idle for two days awaiting supply from the Mohali depot.', 'high', 'open', -1],
      [2, 3, 'Revised structural drawings pending', 'Consultant has not issued updated drawings for the records hall.', 'medium', 'open', -9],
      [1, 1, 'Scaffolding gap on the north face', 'Flagged during the weekly safety walk and closed the same day.', 'medium', 'resolved', -21],
      [5, 6, 'Sand quality below specification', 'One consignment rejected and returned to the supplier.', 'low', 'resolved', -16],
    ];
    await connection.query(
      `INSERT INTO project_issues (project_id, site_id, title, description, severity, status, raised_on) VALUES ?`,
      [issues.map(([p, s, t, d, sev, st, dt]) => [p, s, t, d, sev, st, shift(dt)])]
    );

    // ---- documents ----
    const docs = [
      [1, 'Approved architectural drawings — Rev C', 'drawing', -160],
      [1, 'Structural design report', 'report', -170],
      [1, 'Building permit', 'permit', -185],
      [2, 'Tender agreement — Balaji Infra', 'contract', -230],
      [3, 'PEB fabrication drawings', 'drawing', -260],
      [4, 'Geotechnical investigation report', 'report', -120],
      [5, 'Site layout plan', 'drawing', -200],
    ];
    await connection.query(
      `INSERT INTO project_documents (project_id, name, document_type, uploaded_on) VALUES ?`,
      [docs.map(([p, n, t, d]) => [p, n, t, shift(d)])]
    );

    // ---- approvals ----
    const approvals = [
      [1, 1, 'payment-request', 'Running account bill 7 — RCC works', 'Gurmeet Constructions', 8500000, 'Covers 8th floor columns and slab reinforcement.', 'pending', -1],
      [3, 4, 'material-request', 'Electrical conduit and fittings', 'Deepak Verma · Site Engineer', 3125000, 'Required for east bay conduit routing.', 'pending', -2],
      [5, 6, 'purchase-request', 'Cement — 600 bags', 'Meera Nair · Site Engineer', 249000, 'Villas 4-6 plastering starts next week.', 'pending', -3],
      [4, 5, 'expense-claim', 'Dewatering pump hire', 'Ritu Sharma · Project Manager', 423000, 'Emergency hire after water table was struck.', 'pending', -4],
      [2, 3, 'contractor-request', 'Extension of time — 21 days', 'Balaji Infra Works', null, 'Delay attributed to pending structural drawings.', 'pending', -5],
      [2, 3, 'material-request', 'Cement — 400 bags', 'Meera Nair · Site Engineer', 166000, 'To resume plastering on the ground floor.', 'approved', -8],
      [1, 1, 'purchase-request', 'Tile consignment for podium', 'Harpreet Singh · Site Engineer', 1404000, 'Podium finishing schedule.', 'approved', -12],
      [4, 5, 'payment-request', 'Mobilisation advance', 'Gurmeet Constructions', 6000000, 'Requested ahead of raft works.', 'rejected', -15],
    ];
    await connection.query(
      `INSERT INTO approval_requests (project_id, site_id, request_type, title, requested_by, amount, details, status, requested_on) VALUES ?`,
      [approvals.map(([p, s, t, ti, r, a, d, st, dt]) => [p, s, t, ti, r, a, d, st, shift(dt)])]
    );

    await connection.commit();

    const [[{ projects }]] = await connection.query('SELECT COUNT(*) AS projects FROM projects');
    const [[{ sites }]] = await connection.query('SELECT COUNT(*) AS sites FROM sites');
    console.log(`Demo data ready: ${projects} projects, ${sites} sites.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

seed()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('Demo seed failed:', error.message);
    await pool.end();
    process.exit(1);
  });
