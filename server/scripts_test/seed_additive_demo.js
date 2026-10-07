'use strict';

/**
 * Additive, repeatable Architecture ERP demo.
 *
 * This script only creates rows carrying the DEMO namespace. It never truncates
 * tables, disables foreign keys, overwrites existing users, or changes rows
 * outside that namespace. Run with `--remove` to remove only this demo set.
 */
process.env.DB_NAME = process.env.DB_NAME || 'architecture_erp';

const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
const warehouseService = require('../src/services/warehouseService');

const DEMO = 'DEMO';
const CONTRACTOR_EMAIL = 'demo.contractor@architecture-erp.local';
const CONTRACTOR_PASSWORD = 'DemoContractor@123';
const PROJECT_CODE = 'DEMO-RES-TOWER';
const CONTRACTOR_NAME = 'DEMO - ABC Construction Contractor';
const REQUEST_NUMBER = 'DEMO-PR-0001';
const LABOUR_REQUEST_NUMBER = 'DEMO-LR-0001';
const EXPENSE_NUMBER = 'DEMO-EXP-0001';
let today = new Date().toISOString().slice(0, 10);
const datePlus = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function firstRow(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
}

async function ensureUser() {
  const existing = await firstRow('SELECT id FROM users WHERE email = ?', [CONTRACTOR_EMAIL]);
  if (existing) return existing.id;
  const role = await firstRow('SELECT id FROM roles WHERE slug = ?', ['contractor']);
  const passwordHash = await bcrypt.hash(CONTRACTOR_PASSWORD, 12);
  const [result] = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role_id, is_active)
     VALUES (?, ?, ?, ?, 1)`,
    ['DEMO Contractor User', CONTRACTOR_EMAIL, passwordHash, role.id]
  );
  return result.insertId;
}

async function ensureContractor(userId) {
  let row = await firstRow('SELECT id,user_id FROM contractors WHERE name = ?', [CONTRACTOR_NAME]);
  if (!row) {
    const [result] = await pool.query(
      `INSERT INTO contractors
       (user_id,name,contact_person,email,phone,address,speciality,rating,is_active,status,notes)
       VALUES (?,?,?,?,?,?,?,?,1,'active',?)`,
      [userId, CONTRACTOR_NAME, 'DEMO Site Manager', CONTRACTOR_EMAIL, '+91 90000 00001',
        'DEMO Construction Site', 'Civil and finishing works', 4.5, 'DEMO record - safe to remove with --remove']
    );
    return result.insertId;
  }
  if (row.user_id && Number(row.user_id) !== Number(userId)) {
    throw new Error(`Demo contractor is linked to another user (${row.user_id}); refusing to re-link it.`);
  }
  if (!row.user_id) await pool.query('UPDATE contractors SET user_id = ? WHERE id = ?', [userId, row.id]);
  return row.id;
}

async function ensureProject(contractorId) {
  let row = await firstRow('SELECT id FROM projects WHERE code = ?', [PROJECT_CODE]);
  if (!row) {
    const [result] = await pool.query(
      `INSERT INTO projects
       (code,name,project_type,description,location,start_date,expected_completion,estimated_budget,
        contractor_id,status,progress,current_phase,is_archived)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`,
      [PROJECT_CODE, 'DEMO - Residential Tower Project', 'residential',
        'DEMO record for end-to-end ERP trial workflow.', 'DEMO Construction District',
        datePlus(-14), datePlus(270), 25000000, contractorId, 'on-track', 18, 'Foundation']
    );
    row = { id: result.insertId };
  }
  return row.id;
}

async function ensureSite(projectId, name, address) {
  let row = await firstRow('SELECT id FROM sites WHERE project_id = ? AND name = ?', [projectId, name]);
  if (!row) {
    const [result] = await pool.query(
      `INSERT INTO sites (project_id,name,address,contractor_id,labour_count,progress,status,safety_status)
       SELECT ?,?,?,contractor_id,0,18,'on-track','safe' FROM projects WHERE id = ?`,
      [projectId, name, address, projectId]
    );
    row = { id: result.insertId };
  }
  return row.id;
}

async function ensureEmployee(index, designation) {
  const code = `DEMO-EMP-${String(index).padStart(2, '0')}`;
  let row = await firstRow('SELECT id FROM employees WHERE employee_code = ?', [code]);
  if (!row) {
    const [result] = await pool.query(
      `INSERT INTO employees (employee_code,full_name,designation,employee_type,email,is_active,status,notes)
       VALUES (?,?,?,'full-time',?,1,'active',?)`,
      [code, `DEMO Company ${designation} ${index}`, designation,
        `demo.employee.${index}@architecture-erp.local`, 'DEMO company labour record']
    );
    row = { id: result.insertId };
  }
  return row.id;
}

async function ensureWorker(contractorId, code, name, skill) {
  let row = await firstRow('SELECT id FROM contractor_workers WHERE worker_code = ?', [code]);
  if (!row) {
    const [result] = await pool.query(
      `INSERT INTO contractor_workers
       (contractor_id,worker_code,full_name,skill_category,daily_rate,status,joining_date,notes)
       VALUES (?,?,?,?,?,'active',?,?)`,
      [contractorId, code, name, skill, skill === 'Mason' ? 950 : skill === 'Helper' ? 650 : 900,
        datePlus(-30), 'DEMO contractor worker']
    );
    row = { id: result.insertId };
  }
  return row.id;
}

async function ensureAssignment({ type, employeeId, workerId, contractorId, projectId, siteId, assignedBy, key }) {
  const existing = await firstRow(
    `SELECT id FROM labour_assignments
     WHERE notes = ? AND project_id = ? AND site_id = ? LIMIT 1`,
    [key, projectId, siteId]
  );
  if (existing) return existing.id;
  const [result] = await pool.query(
    `INSERT INTO labour_assignments
     (labour_type,employee_id,contractor_worker_id,contractor_id,project_id,site_id,start_date,status,assigned_by,notes)
     VALUES (?,?,?,?,?,?,?,'active',?,?)`,
    [type, employeeId, workerId, contractorId, projectId, siteId, datePlus(-7), assignedBy, key]
  );
  return result.insertId;
}

async function ensureMaterial(name, code, category, unit, rate) {
  let row = await firstRow('SELECT id,unit FROM materials WHERE name = ?', [name]);
  if (row) return row;
  row = await firstRow('SELECT id,unit FROM materials WHERE code = ?', [code]);
  if (row) return row;
  const [result] = await pool.query(
    `INSERT INTO materials (code,name,category,unit,min_stock,default_supplier,default_rate,status,notes)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [code, name, category, unit, 500, 'DEMO - ABC Building Suppliers', rate, 'active', 'DEMO catalogue record']
  );
  return { id: result.insertId, unit };
}

async function ensureMaterialEntry(materialId, projectId, siteId, note, quantity, usedQuantity = 0) {
  const existing = await firstRow('SELECT id FROM material_entries WHERE notes = ? LIMIT 1', [note]);
  if (existing) return existing.id;
  const [result] = await pool.query(
    `INSERT INTO material_entries
     (project_id,site_id,material_id,quantity,used_quantity,rate,supplier,received_date,notes)
     VALUES (?,?,?,?,?,?,?, ?,?)`,
    [projectId, siteId, materialId, quantity, usedQuantity, 0, 'DEMO - ABC Building Suppliers', today, note]
  );
  return result.insertId;
}

async function ensureWarehouseStock(warehouseId, materialId, quantity, unit, key) {
  const existing = await firstRow('SELECT id FROM warehouse_transactions WHERE transaction_number = ?', [key]);
  if (existing) return;
  await pool.query(
    `INSERT INTO warehouse_stock (warehouse_id,material_id,project_id,site_id,quantity)
     VALUES (?,?,NULL,NULL,?)`, [warehouseId, materialId, quantity]
  );
  await pool.query(
    `INSERT INTO warehouse_transactions
     (transaction_number,transaction_type,material_id,warehouse_id,quantity,unit,transaction_date,notes)
    VALUES (?,'receipt',?,?,?,?,?,?)`,
    [key, materialId, warehouseId, quantity, unit, today, 'DEMO opening warehouse stock']
  );
}

async function ensureProcurement(userId, projectId, siteId, materialId) {
  let row = await firstRow('SELECT id,status FROM procurement_requests WHERE request_number = ?', [REQUEST_NUMBER]);
  if (row) return row.id;
  const [result] = await pool.query(
    `INSERT INTO procurement_requests
     (request_number,project_id,site_id,material_id,supplier,quantity,unit,estimated_rate,required_date,priority,requested_by,notes,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [REQUEST_NUMBER, projectId, siteId, materialId, 'DEMO - ABC Building Suppliers', 200, 'bags', 400,
      datePlus(7), 'high', userId, 'DEMO material request: Foundation work', 'pending_approval']
  );
  return result.insertId;
}

async function ensureLabourRequest(userId, contractorId, projectId, siteId) {
  let row = await firstRow('SELECT id,status FROM labour_requests WHERE request_number = ?', [LABOUR_REQUEST_NUMBER]);
  if (row) return row.id;
  const [result] = await pool.query(
    `INSERT INTO labour_requests
     (request_number,contractor_id,project_id,site_id,skill_category,quantity,required_date,duration_days,priority,reason,status,requested_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [LABOUR_REQUEST_NUMBER, contractorId, projectId, siteId, 'Helper', 3, datePlus(2), 5, 'high',
      'DEMO foundation work requires additional helpers', 'SUBMITTED', userId]
  );
  return result.insertId;
}

async function ensureFinanceDemo(projectId, siteId, contractorId) {
  const existing = await firstRow('SELECT id FROM contractor_payments WHERE notes = ? LIMIT 1', ['DEMO procurement obligation']);
  if (existing) return existing.id;
  const [result] = await pool.query(
    `INSERT INTO contractor_payments
     (project_id,contractor_id,site_id,contract_value,paid_amount,payment_reference,payment_date,payment_status,notes)
     VALUES (?,?,?,?,0,NULL,NULL,'pending',?)`,
    [projectId, contractorId, siteId, 80000, 'DEMO procurement obligation']
  );
  return result.insertId;
}

async function seed() {
  const [[databaseDate]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
  today = databaseDate.today;
  const userId = await ensureUser();
  const contractorId = await ensureContractor(userId);
  const projectId = await ensureProject(contractorId);
  const siteA = await ensureSite(projectId, 'DEMO - Tower A', 'DEMO Construction District - Tower A');
  const siteB = await ensureSite(projectId, 'DEMO - Tower B', 'DEMO Construction District - Tower B');

  const companyEmployees = [];
  for (let index = 1; index <= 3; index += 1) companyEmployees.push(await ensureEmployee(index, 'Site Engineer'));

  const workers = [];
  const workerGroups = [
    ['Mason', 5], ['Helper', 5], ['Carpenter', 3], ['Electrician', 2],
  ];
  let sequence = 1;
  for (const [skill, count] of workerGroups) {
    for (let index = 1; index <= count; index += 1) {
      workers.push({ id: await ensureWorker(contractorId, `DEMO-CW-${String(sequence).padStart(3, '0')}`, `DEMO ${skill} ${index}`, skill), skill });
      sequence += 1;
    }
  }

  for (const employeeId of companyEmployees) {
    await ensureAssignment({ type: 'company', employeeId, workerId: null, contractorId: null, projectId, siteId: siteA, assignedBy: 1, key: `DEMO-COMPANY-ASSIGN-${employeeId}` });
  }
  for (const worker of workers) {
    await ensureAssignment({ type: 'contractor', employeeId: null, workerId: worker.id, contractorId, projectId, siteId: siteA, assignedBy: 1, key: `DEMO-CONTRACTOR-ASSIGN-${worker.id}` });
  }

  for (const employeeId of companyEmployees) {
    await pool.query(
      `INSERT INTO attendance_records
       (attendance_date,labour_type,employee_id,contractor_worker_id,contractor_id,project_id,site_id,status,recorded_by,remarks)
       SELECT ?, 'company', ?, NULL, NULL, ?, ?, 'PRESENT', 1, 'DEMO company labour attendance'
       WHERE NOT EXISTS (SELECT 1 FROM attendance_records WHERE attendance_date=? AND employee_id=?)`,
      [today, employeeId, projectId, siteA, today, employeeId]
    );
  }
  const workerStatus = workers.map((worker) => worker.skill === 'Carpenter' && worker.id === workers.find((item) => item.skill === 'Carpenter')?.id ? 'ABSENT' : 'PRESENT');
  for (let index = 0; index < workers.length; index += 1) {
    const worker = workers[index];
    await pool.query(
      `INSERT INTO attendance_records
       (attendance_date,labour_type,employee_id,contractor_worker_id,contractor_id,project_id,site_id,status,recorded_by,remarks)
       SELECT ?, 'contractor', NULL, ?, ?, ?, ?, ?, ?, 'DEMO contractor attendance'
       WHERE NOT EXISTS (SELECT 1 FROM attendance_records WHERE attendance_date=? AND contractor_worker_id=?)`,
      [today, worker.id, contractorId, projectId, siteA, workerStatus[index], userId, today, worker.id]
    );
  }

  const materialSpecs = [
    ['Cement (OPC 53)', 'DEMO-MAT-CEMENT', 'Cement', 'bags', 400],
    ['Steel / Sariya', 'DEMO-MAT-STEEL', 'Steel', 'tonnes', 62000],
    ['Bricks', 'DEMO-MAT-BRICKS', 'Masonry', 'thousand', 7500],
    ['Sand', 'DEMO-MAT-SAND', 'Aggregate', 'cu.m', 1800],
    ['DEMO - Electrical Cable', 'DEMO-MAT-CABLE', 'Electrical', 'meters', 180],
    ['DEMO - PVC Pipe', 'DEMO-MAT-PVC', 'Plumbing', 'units', 220],
  ];
  const materials = [];
  for (const spec of materialSpecs) materials.push(await ensureMaterial(...spec));

  const warehouse = await firstRow('SELECT id FROM warehouses WHERE code = ?', ['DEMO-WH-001']) ||
    (await pool.query(
      `INSERT INTO warehouses (code,name,location,description,status) VALUES ('DEMO-WH-001','DEMO - Tower Materials Store','DEMO Construction District','DEMO warehouse - safe to remove with --remove','active')`
    ).then(([result]) => ({ id: result.insertId })));

  for (const material of materials) {
    await ensureWarehouseStock(warehouse.id, material.id, 2000, material.unit, `DEMO-OPEN-${material.id}`);
    await ensureMaterialEntry(material.id, projectId, siteA, `DEMO opening stock ${material.id}`, 2000, material.id === materials[0].id ? 150 : 0);
  }

  const procurementId = await ensureProcurement(userId, projectId, siteA, materials[0].id);
  const labourRequestId = await ensureLabourRequest(userId, contractorId, projectId, siteA);
  const financeId = await ensureFinanceDemo(projectId, siteA, contractorId);

  console.log(JSON.stringify({
    demo: true,
    contractor: { userId, contractorId, email: CONTRACTOR_EMAIL, password: CONTRACTOR_PASSWORD },
    project: { id: projectId, code: PROJECT_CODE, name: 'DEMO - Residential Tower Project', sites: { towerA: siteA, towerB: siteB } },
    workers: workers.length,
    companyEmployees: companyEmployees.length,
    warehouse: warehouse.id,
    materialIds: materials.map((material) => material.id),
    procurementId,
    requestNumber: REQUEST_NUMBER,
    labourRequestId,
    labourRequestNumber: LABOUR_REQUEST_NUMBER,
    financeId,
    note: 'Run additive_demo_smoke_test.js to complete approval, PO, receiving, issue, and labour assignment.'
  }, null, 2));
}

async function removeDemo() {
  const demoProject = await firstRow('SELECT id FROM projects WHERE code = ?', [PROJECT_CODE]);
  const demoContractor = await firstRow('SELECT id,user_id FROM contractors WHERE name = ?', [CONTRACTOR_NAME]);
  const demoUser = await firstRow('SELECT id FROM users WHERE email = ?', [CONTRACTOR_EMAIL]);
  const demoWarehouse = await firstRow('SELECT id FROM warehouses WHERE code = ?', ['DEMO-WH-001']);

  if (demoProject) {
    await pool.query('DELETE FROM approval_history WHERE (module="procurement" AND reference_id IN (SELECT id FROM procurement_requests WHERE project_id=?)) OR (module="hr_labour" AND reference_id IN (SELECT id FROM labour_requests WHERE project_id=?))', [demoProject.id, demoProject.id]);
    await pool.query('DELETE FROM procurement_receipts WHERE procurement_request_id IN (SELECT id FROM procurement_requests WHERE project_id=?)', [demoProject.id]);
    await pool.query('DELETE FROM warehouse_transactions WHERE notes LIKE "DEMO%" OR procurement_request_id IN (SELECT id FROM procurement_requests WHERE project_id=?)', [demoProject.id]);
    await pool.query('DELETE FROM material_entries WHERE notes LIKE "DEMO%" OR project_id=?', [demoProject.id]);
    await pool.query('DELETE FROM attendance_records WHERE project_id=?', [demoProject.id]);
    await pool.query('DELETE FROM labour_request_assignments WHERE labour_request_id IN (SELECT id FROM labour_requests WHERE project_id=?)', [demoProject.id]);
    await pool.query('DELETE FROM labour_assignments WHERE project_id=?', [demoProject.id]);
    await pool.query('DELETE FROM labour_requests WHERE project_id=?', [demoProject.id]);
    await pool.query('DELETE FROM procurement_requests WHERE project_id=?', [demoProject.id]);
    await pool.query('DELETE FROM contractor_payments WHERE project_id=? AND notes LIKE "DEMO%"', [demoProject.id]);
    await pool.query('DELETE FROM sites WHERE project_id=?', [demoProject.id]);
    await pool.query('DELETE FROM projects WHERE id=?', [demoProject.id]);
  }
  if (demoContractor) {
    await pool.query('DELETE FROM contractor_workers WHERE contractor_id=?', [demoContractor.id]);
    await pool.query('DELETE FROM contractors WHERE id=?', [demoContractor.id]);
  }
  await pool.query('DELETE FROM employees WHERE employee_code LIKE "DEMO-EMP-%"');
  if (demoWarehouse) {
    await pool.query('DELETE FROM warehouse_transactions WHERE warehouse_id=?', [demoWarehouse.id]);
    await pool.query('DELETE FROM warehouse_stock WHERE warehouse_id=?', [demoWarehouse.id]);
    await pool.query('DELETE FROM warehouses WHERE id=?', [demoWarehouse.id]);
  }
  await pool.query('DELETE FROM materials WHERE code LIKE "DEMO-MAT-%"');
  if (demoUser) await pool.query('DELETE FROM users WHERE id=?', [demoUser.id]);
  console.log(JSON.stringify({ removed: true, demo: DEMO }));
}

(async () => {
  try {
    if (process.argv.includes('--remove')) await removeDemo();
    else await seed();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
