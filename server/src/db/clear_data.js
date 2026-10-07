'use strict';

const { pool } = require('../config/db');

async function clearData() {
  const connection = await pool.getConnection();
  try {
    console.log('--- STARTING COMPREHENSIVE DATA CLEANUP ---');
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // 1. Project, Tasks, Phases & Daily Work Tables
    const projectTables = [
      'task_materials',
      'task_tools',
      'task_labour',
      'task_misc',
      'task_assigned_workers',
      'task_worker_logs',
      'project_tasks',
      'project_phase_materials',
      'project_phase_tools',
      'project_phase_labour',
      'project_phase_misc',
      'project_phases',
      'project_documents',
      'project_issues',
      'site_activities',
      'user_project_access',
      'user_site_access',
      'daily_work_photos',
      'daily_work_updates',
      'sites',
      'projects',
    ];

    // 2. Contractor Tables
    const contractorTables = [
      'contractor_po_milestones',
      'contractor_pos',
      'contractor_payments',
      'contractor_documents',
      'contractor_workers',
      'contractors',
    ];

    // 3. Materials & Movements Tables
    const materialTables = [
      'material_movements',
      'material_entries',
      'warehouse_stock',
      'warehouse_transactions',
      'materials',
    ];

    // 4. Procurement Tables
    const procurementTables = [
      'procurement_receipts',
      'procurement_requests',
    ];

    // 5. Finance Tables
    const financeTables = [
      'expenses',
    ];

    // 6. Approvals & Notifications
    const workflowTables = [
      'approval_history',
      'approval_requests',
      'notifications',
    ];

    // 7. HR / Labour / Client / Vendor / Attendance Tables
    const hrTables = [
      'labour_request_assignments',
      'labour_requests',
      'labour_assignments',
      'labour_records',
      'attendance_records',
      'leave_records',
      'employee_assignments',
      'employee_skills',
      'employee_profiles_360',
      'employees',
      'clients',
      'vendors',
    ];

    const allTablesToTruncate = [
      ...projectTables,
      ...contractorTables,
      ...materialTables,
      ...procurementTables,
      ...financeTables,
      ...workflowTables,
      ...hrTables,
    ];

    for (const table of allTablesToTruncate) {
      try {
        await connection.query(`TRUNCATE TABLE \`${table}\``);
        console.log(`✓ Truncated ${table}`);
      } catch (err) {
        console.warn(`! Could not truncate ${table} (will DELETE):`, err.message);
        try {
          await connection.query(`DELETE FROM \`${table}\``);
          console.log(`✓ Deleted from ${table}`);
        } catch (delErr) {
          console.error(`✗ Failed to clear ${table}:`, delErr.message);
        }
      }
    }

    // Clear contractor warehouses, keep central warehouse
    await connection.query("DELETE FROM warehouses WHERE type = 'contractor' OR contractor_id IS NOT NULL");
    console.log('✓ Cleaned contractor warehouses');

    // Remove non-admin users (keeping Admin user ID 1)
    await connection.query('DELETE FROM refresh_tokens');
    await connection.query('DELETE FROM users WHERE id != 1');
    console.log('✓ Removed non-admin users and refresh tokens (Admin user retained)');

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();
    console.log('\n--- DATA CLEANUP COMPLETED SUCCESSFULLY ---');
  } catch (error) {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    await connection.rollback();
    console.error('Data cleanup failed:', error);
    process.exit(1);
  } finally {
    connection.release();
    pool.end();
  }
}

clearData();
