'use strict';

require('../../../node_modules/dotenv').config({ path: './server/.env' });
const { pool } = require('../../config/db');

async function migrate() {
  console.log('--- Applying Schema Migrations for Finance & Operations Restructuring ---');

  // 1. Projects: client_contract_value
  const [projCols] = await pool.query("SHOW COLUMNS FROM projects LIKE 'client_contract_value'");
  if (projCols.length === 0) {
    await pool.query('ALTER TABLE projects ADD COLUMN client_contract_value DECIMAL(14,2) NULL AFTER estimated_budget');
    console.log('Added client_contract_value to projects');
  }

  // 2. Material Movements: cost_per_unit and total_cost
  const [mmCols1] = await pool.query("SHOW COLUMNS FROM material_movements LIKE 'cost_per_unit'");
  if (mmCols1.length === 0) {
    await pool.query('ALTER TABLE material_movements ADD COLUMN cost_per_unit DECIMAL(12,2) DEFAULT 0.00 AFTER unit');
    console.log('Added cost_per_unit to material_movements');
  }
  const [mmCols2] = await pool.query("SHOW COLUMNS FROM material_movements LIKE 'total_cost'");
  if (mmCols2.length === 0) {
    await pool.query('ALTER TABLE material_movements ADD COLUMN total_cost DECIMAL(14,2) DEFAULT 0.00 AFTER cost_per_unit');
    console.log('Added total_cost to material_movements');
  }

  // 3. Daily Work Updates: tool_id, tool_name, tool_cost, tool_remarks
  const [dwuCols1] = await pool.query("SHOW COLUMNS FROM daily_work_updates LIKE 'tool_id'");
  if (dwuCols1.length === 0) {
    await pool.query('ALTER TABLE daily_work_updates ADD COLUMN tool_id INT NULL AFTER misc_receipt_path');
    await pool.query('ALTER TABLE daily_work_updates ADD COLUMN tool_name VARCHAR(150) NULL AFTER tool_id');
    await pool.query('ALTER TABLE daily_work_updates ADD COLUMN tool_cost DECIMAL(12,2) DEFAULT 0.00 AFTER tool_name');
    await pool.query('ALTER TABLE daily_work_updates ADD COLUMN tool_remarks VARCHAR(255) NULL AFTER tool_cost');
    console.log('Added tool fields to daily_work_updates');
  }

  // 4. Procurement Requests: item_type, tool_id, amount_paid, amount_due, payment_status
  const [prCols1] = await pool.query("SHOW COLUMNS FROM procurement_requests LIKE 'item_type'");
  if (prCols1.length === 0) {
    await pool.query("ALTER TABLE procurement_requests ADD COLUMN item_type ENUM('material', 'tool') DEFAULT 'material' AFTER request_number");
    await pool.query('ALTER TABLE procurement_requests ADD COLUMN tool_id INT NULL AFTER material_id');
    console.log('Added item_type and tool_id to procurement_requests');
  }
  const [prCols2] = await pool.query("SHOW COLUMNS FROM procurement_requests LIKE 'amount_paid'");
  if (prCols2.length === 0) {
    await pool.query('ALTER TABLE procurement_requests ADD COLUMN amount_paid DECIMAL(14,2) DEFAULT 0.00 AFTER total_amount');
    await pool.query('ALTER TABLE procurement_requests ADD COLUMN amount_due DECIMAL(14,2) DEFAULT 0.00 AFTER amount_paid');
    await pool.query("ALTER TABLE procurement_requests ADD COLUMN payment_status ENUM('pending', 'partially_paid', 'paid') DEFAULT 'pending' AFTER amount_due");
    console.log('Added payment tracking fields to procurement_requests');
  }

  // 5. Client Payments Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_payments (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      client_id INT UNSIGNED NOT NULL,
      project_id INT UNSIGNED NOT NULL,
      invoice_reference VARCHAR(100) NULL,
      payment_reference VARCHAR(100) NULL,
      payment_date DATE NOT NULL,
      amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      payment_method VARCHAR(50) DEFAULT 'Bank Transfer',
      payment_status ENUM('received', 'pending', 'cancelled') DEFAULT 'received',
      notes TEXT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cp_client (client_id),
      INDEX idx_cp_project (project_id),
      CONSTRAINT fk_cp_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      CONSTRAINT fk_cp_client_proj FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('Ensured client_payments table');

  // 6. Vendor Payments Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vendor_payments (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      vendor_id INT UNSIGNED NULL,
      procurement_request_id INT UNSIGNED NULL,
      project_id INT UNSIGNED NULL,
      site_id INT UNSIGNED NULL,
      payment_date DATE NOT NULL,
      amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
      payment_reference VARCHAR(100) NULL,
      payment_method VARCHAR(50) DEFAULT 'Bank Transfer',
      payment_status ENUM('paid', 'pending', 'cancelled') DEFAULT 'paid',
      remarks TEXT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_vp_vendor (vendor_id),
      INDEX idx_vp_proc (procurement_request_id),
      CONSTRAINT fk_vp_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
      CONSTRAINT fk_vp_proc FOREIGN KEY (procurement_request_id) REFERENCES procurement_requests(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('Ensured vendor_payments table');

  console.log('--- Migrations Applied Successfully ---');
  process.exit(0);
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
