'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { pool } = require('../config/db');

async function clear() {
  const c = await pool.getConnection();
  await c.beginTransaction();
  try {
    const del = (sql) => c.query(sql);

    // Finance
    await del('DELETE FROM expenses');
    await del('DELETE FROM client_payments');
    await del('DELETE FROM contractor_payments');
    await del('DELETE FROM vendor_payments');
    await del('DELETE FROM contractor_po_milestones');
    await del('DELETE FROM contractor_pos');

    // Procurement
    await del('DELETE FROM procurement_receipts');
    await del('DELETE FROM material_entries');
    await del('DELETE FROM procurement_requests');

    // Warehouse / Stock
    await del('DELETE FROM material_movements');
    await del('DELETE FROM warehouse_transactions');
    await del('DELETE FROM warehouse_stock');

    // Tasks
    await del('DELETE FROM task_materials');
    await del('DELETE FROM task_tools');
    await del('DELETE FROM task_labour');
    await del('DELETE FROM task_misc');
    await del('DELETE FROM task_assigned_workers');
    await del('DELETE FROM task_worker_logs');
    await del('DELETE FROM attendance_records');
    await del('DELETE FROM task_budget_approvals');
    await del('DELETE FROM approval_requests');
    await del('DELETE FROM approval_history');

    // Sites / Daily work
    await del('DELETE FROM site_activities');
    await del('DELETE FROM daily_work_updates');
    await del('DELETE FROM daily_work_photos');
    await del('DELETE FROM labour_assignments');
    await del('DELETE FROM labour_request_assignments');
    await del('DELETE FROM labour_requests');
    await del('DELETE FROM labour_records');

    // Project phases
    await del('DELETE FROM project_phase_materials');
    await del('DELETE FROM project_phase_tools');
    await del('DELETE FROM project_phase_labour');
    await del('DELETE FROM project_phase_misc');
    await del('DELETE FROM project_phases');

    // Projects
    await del('DELETE FROM project_issues');
    await del('DELETE FROM project_documents');
    await del('DELETE FROM project_tasks');
    await del('DELETE FROM user_site_access');
    await del('DELETE FROM user_project_access');
    await del('DELETE FROM sites');
    await del('DELETE FROM projects');

    // Employees
    await del('DELETE FROM employee_assignments');
    await del('DELETE FROM employee_profiles_360');
    await del('DELETE FROM employee_skills');
    await del('DELETE FROM leave_records');
    await del('DELETE FROM employees');

    await c.commit();
    console.log('✅ Done: projects, finance, warehouse, procurement, employees cleared.');
  } catch (e) {
    await c.rollback();
    console.error('❌ Failed:', e.message);
  } finally {
    c.release();
    process.exit(0);
  }
}

clear();
