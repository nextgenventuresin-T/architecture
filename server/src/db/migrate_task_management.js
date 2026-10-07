'use strict';

const { pool } = require('../config/db');

async function migrate() {
  console.log('--- Migrating Task-Based Project Management Schema ---');

  // 1. Upgrade project_tasks table
  const [taskCols] = await pool.query('SHOW COLUMNS FROM project_tasks');
  const existingColNames = new Set(taskCols.map((c) => c.Field));

  // Modify phase column to be nullable
  if (existingColNames.has('phase')) {
    await pool.query('ALTER TABLE project_tasks MODIFY COLUMN phase VARCHAR(80) NULL DEFAULT NULL');
  }

  // Add site_id
  if (!existingColNames.has('site_id')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN site_id INT UNSIGNED NULL AFTER project_id');
    try {
      await pool.query('ALTER TABLE project_tasks ADD CONSTRAINT fk_tasks_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL');
    } catch (e) {
      console.log('FK fk_tasks_site note:', e.message);
    }
  }

  // Add description
  if (!existingColNames.has('description')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN description TEXT NULL AFTER name');
  }

  // Add progress
  if (!existingColNames.has('progress')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN progress TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER status');
  }

  // Add start_date / end_date
  if (!existingColNames.has('start_date')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN start_date DATE NULL AFTER progress');
  }
  if (!existingColNames.has('end_date')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN end_date DATE NULL AFTER start_date');
  }

  // Add duration_days
  if (!existingColNames.has('duration_days')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN duration_days INT UNSIGNED NOT NULL DEFAULT 0 AFTER end_date');
  }

  // Add budget fields
  if (!existingColNames.has('material_budget')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN material_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER duration_days');
  }
  if (!existingColNames.has('tool_budget')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN tool_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER material_budget');
  }
  if (!existingColNames.has('labour_budget')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN labour_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER tool_budget');
  }
  if (!existingColNames.has('misc_budget')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN misc_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER labour_budget');
  }
  if (!existingColNames.has('total_budget')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN total_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER misc_budget');
  }

  // Add created_by, created_at, updated_at
  if (!existingColNames.has('created_by')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER total_budget');
  }
  if (!existingColNames.has('created_at')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER created_by');
  }
  if (!existingColNames.has('updated_at')) {
    await pool.query('ALTER TABLE project_tasks ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
  }

  console.log('✓ project_tasks table updated');

  // 2. Create task_materials
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_materials (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id INT UNSIGNED NOT NULL,
      project_id INT UNSIGNED NOT NULL,
      site_id INT UNSIGNED NULL,
      material_id INT UNSIGNED NOT NULL,
      quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      cost_per_unit DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      total_cost DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_tm_task (task_id),
      KEY idx_tm_project (project_id),
      KEY idx_tm_material (material_id),
      CONSTRAINT fk_tm_task FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
      CONSTRAINT fk_tm_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✓ task_materials table verified');

  // 3. Create task_tools
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_tools (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id INT UNSIGNED NOT NULL,
      project_id INT UNSIGNED NOT NULL,
      site_id INT UNSIGNED NULL,
      tool_id INT UNSIGNED NULL,
      tool_name VARCHAR(180) NOT NULL,
      rental_type VARCHAR(40) NOT NULL DEFAULT 'Rent',
      quantity DECIMAL(12,2) NOT NULL DEFAULT 1.00,
      cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      total_cost DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_tt_task (task_id),
      KEY idx_tt_project (project_id),
      CONSTRAINT fk_tt_task FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✓ task_tools table verified');

  // 4. Create task_labour
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_labour (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id INT UNSIGNED NOT NULL,
      project_id INT UNSIGNED NOT NULL,
      site_id INT UNSIGNED NULL,
      labour_type VARCHAR(100) NOT NULL,
      worker_count DECIMAL(10,2) NOT NULL DEFAULT 1.00,
      daily_wage DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      working_days DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_cost DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_tl_task (task_id),
      KEY idx_tl_project (project_id),
      CONSTRAINT fk_tl_task FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✓ task_labour table verified');

  // 5. Create task_misc
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_misc (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id INT UNSIGNED NOT NULL,
      project_id INT UNSIGNED NOT NULL,
      site_id INT UNSIGNED NULL,
      description VARCHAR(255) NOT NULL,
      amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_tmisc_task (task_id),
      KEY idx_tmisc_project (project_id),
      CONSTRAINT fk_tmisc_task FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✓ task_misc table verified');

  // 6. Create task_worker_logs (for worker-level tracking per task)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_worker_logs (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_id INT UNSIGNED NOT NULL,
      project_id INT UNSIGNED NOT NULL,
      site_id INT UNSIGNED NULL,
      contractor_id INT UNSIGNED NULL,
      daily_work_id INT UNSIGNED NULL,
      worker_name VARCHAR(150) NOT NULL,
      worker_code VARCHAR(50) NULL,
      labour_type VARCHAR(100) NOT NULL,
      work_date DATE NOT NULL,
      hours_worked DECIMAL(5,2) NOT NULL DEFAULT 8.00,
      daily_wage DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      work_performed VARCHAR(255) NULL,
      created_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_twl_task (task_id),
      KEY idx_twl_project (project_id),
      KEY idx_twl_site (site_id),
      KEY idx_twl_contractor (contractor_id),
      KEY idx_twl_date (work_date),
      CONSTRAINT fk_twl_task FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✓ task_worker_logs table verified');

  // 7. Add task_id to daily_work_updates and daily_work_photos
  const [dwuCols] = await pool.query('SHOW COLUMNS FROM daily_work_updates');
  const dwuColNames = new Set(dwuCols.map((c) => c.Field));
  if (!dwuColNames.has('task_id')) {
    await pool.query('ALTER TABLE daily_work_updates ADD COLUMN task_id INT UNSIGNED NULL AFTER site_id');
    try {
      await pool.query('ALTER TABLE daily_work_updates ADD CONSTRAINT fk_dwu_task FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE SET NULL');
    } catch (e) {
      console.log('FK fk_dwu_task note:', e.message);
    }
    console.log('✓ added task_id to daily_work_updates');
  }

  const [dwpCols] = await pool.query('SHOW COLUMNS FROM daily_work_photos');
  const dwpColNames = new Set(dwpCols.map((c) => c.Field));
  if (!dwpColNames.has('task_id')) {
    await pool.query('ALTER TABLE daily_work_photos ADD COLUMN task_id INT UNSIGNED NULL AFTER site_id');
    console.log('✓ added task_id to daily_work_photos');
  }

  // 8. Add task_id to expenses
  const [expCols] = await pool.query('SHOW COLUMNS FROM expenses');
  const expColNames = new Set(expCols.map((c) => c.Field));
  if (!expColNames.has('task_id')) {
    await pool.query('ALTER TABLE expenses ADD COLUMN task_id INT UNSIGNED NULL AFTER site_id');
    console.log('✓ added task_id to expenses');
  }

  console.log('--- Migration Completed Successfully ---');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
