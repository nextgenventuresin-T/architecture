'use strict';

const { pool } = require('../config/db');

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Running task labour & daily work migration...');

    // 1. contractor_workers aadhaar_number
    const [cwCols] = await connection.query('DESCRIBE contractor_workers');
    if (!cwCols.some((c) => c.Field === 'aadhaar_number')) {
      await connection.query('ALTER TABLE contractor_workers ADD COLUMN aadhaar_number VARCHAR(30) NULL AFTER phone');
      console.log('Added aadhaar_number to contractor_workers');
    }

    // 2. task_worker_logs aadhaar_number
    const [twlCols] = await connection.query('DESCRIBE task_worker_logs');
    if (!twlCols.some((c) => c.Field === 'aadhaar_number')) {
      await connection.query('ALTER TABLE task_worker_logs ADD COLUMN aadhaar_number VARCHAR(30) NULL');
      console.log('Added aadhaar_number to task_worker_logs');
    }

    // 3. task_assigned_workers table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_assigned_workers (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        task_id INT UNSIGNED NOT NULL,
        project_id INT UNSIGNED NOT NULL,
        site_id INT UNSIGNED NULL,
        contractor_id INT UNSIGNED NULL,
        worker_type ENUM('daily_wage', 'company_employee') NOT NULL DEFAULT 'daily_wage',
        worker_id INT UNSIGNED NOT NULL,
        worker_name VARCHAR(150) NOT NULL,
        worker_code VARCHAR(50) NULL,
        phone VARCHAR(30) NULL,
        aadhaar_number VARCHAR(30) NULL,
        trade VARCHAR(100) NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        expected_days DECIMAL(10,2) DEFAULT 0,
        daily_wage DECIMAL(10,2) DEFAULT 0,
        planned_cost DECIMAL(15,2) DEFAULT 0,
        remarks VARCHAR(255) NULL,
        status VARCHAR(20) DEFAULT 'active',
        assigned_by BIGINT UNSIGNED NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_taw_task (task_id),
        INDEX idx_taw_proj (project_id),
        INDEX idx_taw_worker (worker_type, worker_id)
      )
    `);
    console.log('task_assigned_workers table verified');

    // 4. daily_work_updates columns for misc expenses
    const [dwCols] = await connection.query('DESCRIBE daily_work_updates');
    const dwNames = dwCols.map((c) => c.Field);
    if (!dwNames.includes('misc_description')) {
      await connection.query('ALTER TABLE daily_work_updates ADD COLUMN misc_description VARCHAR(255) NULL');
    }
    if (!dwNames.includes('misc_amount')) {
      await connection.query('ALTER TABLE daily_work_updates ADD COLUMN misc_amount DECIMAL(13,2) DEFAULT 0');
    }
    if (!dwNames.includes('misc_remarks')) {
      await connection.query('ALTER TABLE daily_work_updates ADD COLUMN misc_remarks VARCHAR(255) NULL');
    }
    if (!dwNames.includes('misc_receipt_path')) {
      await connection.query('ALTER TABLE daily_work_updates ADD COLUMN misc_receipt_path VARCHAR(255) NULL');
    }
    console.log('daily_work_updates columns verified');

    // Seed any sample aadhaar numbers for existing contractor_workers if missing
    await connection.query(`
      UPDATE contractor_workers
      SET aadhaar_number = CONCAT('98', LPAD(id, 2, '0'), ' ', LPAD(id * 111, 4, '0'), ' ', LPAD(id * 222, 4, '0'))
      WHERE aadhaar_number IS NULL OR aadhaar_number = ''
    `);
    console.log('Seeded sample aadhaar numbers for existing contractor_workers');

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrate };
