'use strict';

const { pool } = require('../config/db');

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Starting migration for Task Labour, Vendors, and Central Warehouse Procurement...');

    // 1. Create vendors table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(180) NOT NULL,
        contact_person VARCHAR(150) NULL,
        phone VARCHAR(30) NULL,
        email VARCHAR(191) NULL,
        gst_number VARCHAR(30) NULL,
        pan_number VARCHAR(20) NULL,
        address TEXT NULL,
        billing_address TEXT NULL,
        bank_name VARCHAR(150) NULL,
        bank_account_number VARCHAR(50) NULL,
        bank_ifsc VARCHAR(30) NULL,
        status ENUM('active', 'inactive') DEFAULT 'active',
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✓ Created/verified vendors table');

    // 2. Extend procurement_requests with vendor & transport details
    const [procCols] = await connection.query('DESCRIBE procurement_requests');
    const existingProcCols = procCols.map((c) => c.Field);

    const procAdditions = [
      { col: 'vendor_id', sql: 'ADD COLUMN vendor_id INT UNSIGNED NULL AFTER material_id' },
      { col: 'vehicle_number', sql: 'ADD COLUMN vehicle_number VARCHAR(50) NULL' },
      { col: 'driver_name', sql: 'ADD COLUMN driver_name VARCHAR(100) NULL' },
      { col: 'driver_phone', sql: 'ADD COLUMN driver_phone VARCHAR(30) NULL' },
      { col: 'challan_number', sql: 'ADD COLUMN challan_number VARCHAR(60) NULL' },
      { col: 'challan_date', sql: 'ADD COLUMN challan_date DATE NULL' },
      { col: 'invoice_number', sql: 'ADD COLUMN invoice_number VARCHAR(60) NULL' },
      { col: 'invoice_date', sql: 'ADD COLUMN invoice_date DATE NULL' },
      { col: 'remarks', sql: 'ADD COLUMN remarks TEXT NULL' },
    ];

    for (const item of procAdditions) {
      if (!existingProcCols.includes(item.col)) {
        await connection.query(`ALTER TABLE procurement_requests ${item.sql}`);
        console.log(`✓ Added column ${item.col} to procurement_requests`);
      }
    }

    // 3. Extend task_labour with worker_id, worker_type, start_date, end_date, remarks, skill_trade
    const [taskLabCols] = await connection.query('DESCRIBE task_labour');
    const existingTaskLabCols = taskLabCols.map((c) => c.Field);

    const taskLabAdditions = [
      { col: 'worker_id', sql: 'ADD COLUMN worker_id INT UNSIGNED NULL AFTER labour_name' },
      { col: 'worker_type', sql: "ADD COLUMN worker_type ENUM('labour', 'company_employee') DEFAULT 'labour' AFTER worker_id" },
      { col: 'start_date', sql: 'ADD COLUMN start_date DATE NULL AFTER worker_count' },
      { col: 'end_date', sql: 'ADD COLUMN end_date DATE NULL AFTER start_date' },
      { col: 'remarks', sql: 'ADD COLUMN remarks VARCHAR(255) NULL' },
      { col: 'skill_trade', sql: 'ADD COLUMN skill_trade VARCHAR(100) NULL' },
    ];

    for (const item of taskLabAdditions) {
      if (!existingTaskLabCols.includes(item.col)) {
        await connection.query(`ALTER TABLE task_labour ${item.sql}`);
        console.log(`✓ Added column ${item.col} to task_labour`);
      }
    }

    // 4. Extend task_worker_logs with worker_id
    const [workerLogCols] = await connection.query('DESCRIBE task_worker_logs');
    const existingWorkerLogCols = workerLogCols.map((c) => c.Field);

    if (!existingWorkerLogCols.includes('worker_id')) {
      await connection.query('ALTER TABLE task_worker_logs ADD COLUMN worker_id INT UNSIGNED NULL AFTER daily_work_id');
      console.log('✓ Added column worker_id to task_worker_logs');
    }
    if (!existingWorkerLogCols.includes('worker_type')) {
      await connection.query("ALTER TABLE task_worker_logs ADD COLUMN worker_type ENUM('labour', 'company_employee') DEFAULT 'labour' AFTER worker_id");
      console.log('✓ Added column worker_type to task_worker_logs');
    }

    // 5. Seed initial vendor demo records if empty
    const [vendorCount] = await connection.query('SELECT COUNT(*) AS total FROM vendors');
    if (vendorCount[0].total === 0) {
      await connection.query(`
        INSERT INTO vendors (name, contact_person, phone, email, gst_number, pan_number, address, billing_address, status, notes)
        VALUES 
        ('Ambuja & UltraTech Cements Ltd', 'Rakesh Singhania', '+91 98765 43210', 'sales@ambujacement.example.com', '03AABCA1234F1Z5', 'AABCA1234F', 'Industrial Area Phase 2, Chandigarh', 'Corporate Towers, Sector 17, Chandigarh', 'active', 'Primary cement vendor for Central Warehouse'),
        ('Tata Steel & TMT Supply Corp', 'Vikram Malhotra', '+91 98123 45678', 'orders@tatasteeldist.example.com', '03BBCTA5678G2Z9', 'BBCTA5678G', 'Steel Yard, Mandi Gobindgarh, Punjab', 'Steel Yard, Mandi Gobindgarh, Punjab', 'active', 'Structural and TMT steel bar supplier'),
        ('Kajaria Tiles & Sanitaryware Agency', 'Sunil Mittal', '+91 99887 76655', 'mittal.kajaria@example.com', '03CCKTI9012H3Z1', 'CCKTI9012H', 'Marble Market, Patiala Highway, Zirakpur', 'Marble Market, Patiala Highway, Zirakpur', 'active', 'Vitrified tiles, adhesives and bathroom fittings'),
        ('Finolex & Havells Electricals Wholesaler', 'Deepak Chopra', '+91 97654 32109', 'deepak.c@havellspb.example.com', '03DDFHW3456J4Z7', 'DDFHW3456J', 'Electrical Market, Sector 18, Chandigarh', 'Sector 18, Chandigarh', 'active', 'Conduits, wiring, MCB distribution and switches')
      `);
      console.log('✓ Seeded demo vendors');
    }

    // 6. Ensure some contractor workers exist for demo / testing if few exist
    const [workerCount] = await connection.query('SELECT COUNT(*) AS total FROM contractor_workers');
    if (workerCount[0].total < 5) {
      const [contractors] = await connection.query('SELECT id FROM contractors LIMIT 2');
      const c1 = contractors[0]?.id || 1;
      const c2 = contractors[1]?.id || c1;

      await connection.query(`
        INSERT INTO contractor_workers (contractor_id, worker_code, full_name, phone, skill_category, daily_rate, status, joining_date, notes)
        VALUES
        (?, 'LAB-101', 'Raj Kumar', '+91 98765 11001', 'Mason', 800.00, 'active', '2026-01-15', 'Lead bricklayer & plasterer'),
        (?, 'LAB-102', 'Amit Sharma', '+91 98765 11002', 'Helper', 550.00, 'active', '2026-02-01', 'Excavation & concrete helper'),
        (?, 'LAB-103', 'Sonu Kumar', '+91 98765 11003', 'Carpenter', 750.00, 'active', '2026-02-10', 'Formwork & shuttering specialist'),
        (?, 'LAB-104', 'Manpreet Singh', '+91 98765 11004', 'Bar Bender', 800.00, 'active', '2026-01-20', 'Reinforcement steel bar bender'),
        (?, 'LAB-105', 'Gurwinder Ram', '+91 98765 11005', 'Helper', 500.00, 'active', '2026-03-05', 'General site helper')
      `, [c1, c1, c1, c2, c2]);
      console.log('✓ Seeded demo contractor workers');
    }

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
