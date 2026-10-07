'use strict';

const { pool } = require('../config/db');

async function run() {
  console.log('Running task material procurement migration...');

  async function columnExists(table, column) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    return rows[0].cnt > 0;
  }

  // 1. procurement_requests columns
  if (!(await columnExists('procurement_requests', 'task_id'))) {
    await pool.query(`ALTER TABLE procurement_requests ADD COLUMN task_id INT UNSIGNED NULL AFTER site_id`);
    await pool.query(`ALTER TABLE procurement_requests ADD INDEX idx_pr_task_id (task_id)`);
    try {
      await pool.query(
        `ALTER TABLE procurement_requests ADD CONSTRAINT fk_pr_task
         FOREIGN KEY (task_id) REFERENCES project_tasks (id) ON DELETE SET NULL`
      );
    } catch (e) {
      console.warn('FK constraint fk_pr_task note:', e.message);
    }
    console.log('Added task_id to procurement_requests');
  }

  if (!(await columnExists('procurement_requests', 'is_excess'))) {
    await pool.query(`ALTER TABLE procurement_requests ADD COLUMN is_excess TINYINT(1) NOT NULL DEFAULT 0 AFTER status`);
    console.log('Added is_excess to procurement_requests');
  }

  if (!(await columnExists('procurement_requests', 'excess_quantity'))) {
    await pool.query(`ALTER TABLE procurement_requests ADD COLUMN excess_quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER is_excess`);
    console.log('Added excess_quantity to procurement_requests');
  }

  if (!(await columnExists('procurement_requests', 'excess_reason'))) {
    await pool.query(`ALTER TABLE procurement_requests ADD COLUMN excess_reason TEXT NULL AFTER excess_quantity`);
    console.log('Added excess_reason to procurement_requests');
  }

  if (!(await columnExists('procurement_requests', 'planned_quantity_at_request'))) {
    await pool.query(`ALTER TABLE procurement_requests ADD COLUMN planned_quantity_at_request DECIMAL(12,2) NULL AFTER excess_reason`);
    console.log('Added planned_quantity_at_request to procurement_requests');
  }

  if (!(await columnExists('procurement_requests', 'procured_quantity_at_request'))) {
    await pool.query(`ALTER TABLE procurement_requests ADD COLUMN procured_quantity_at_request DECIMAL(12,2) NULL AFTER planned_quantity_at_request`);
    console.log('Added procured_quantity_at_request to procurement_requests');
  }

  // 2. task_materials columns
  if (!(await columnExists('task_materials', 'approved_additional_quantity'))) {
    await pool.query(`ALTER TABLE task_materials ADD COLUMN approved_additional_quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER quantity`);
    console.log('Added approved_additional_quantity to task_materials');
  }

  // 3. project_issues columns
  if (!(await columnExists('project_issues', 'task_id'))) {
    await pool.query(`ALTER TABLE project_issues ADD COLUMN task_id INT UNSIGNED NULL AFTER site_id`);
    await pool.query(`ALTER TABLE project_issues ADD INDEX idx_issues_task_id (task_id)`);
    try {
      await pool.query(
        `ALTER TABLE project_issues ADD CONSTRAINT fk_issues_task
         FOREIGN KEY (task_id) REFERENCES project_tasks (id) ON DELETE SET NULL`
      );
    } catch (e) {
      console.warn('FK constraint fk_issues_task note:', e.message);
    }
    console.log('Added task_id to project_issues');
  }

  console.log('Migration finished successfully!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
