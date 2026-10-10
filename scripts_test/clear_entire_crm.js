'use strict';

require('../server/node_modules/dotenv').config({ path: './server/.env' });
const { pool } = require('../server/src/config/db');

async function clearEntireCRM() {
  console.log('--- Clearing entire CRM / ERP data to 0 ---');
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');

  const tables = [
    // 1. Tasks & Phases
    'task_materials',
    'task_tools',
    'task_labour',
    'task_misc',
    'task_worker_logs',
    'task_assigned_workers',
    'task_budget_approvals',
    'project_phase_materials',
    'project_phase_tools',
    'project_phase_labour',
    'project_phase_misc',
    'project_tasks',

    // 2. Daily Work & Activities
    'daily_work_photos',
    'daily_work_updates',
    'site_activities',

    // 3. Projects, Sites & Clients
    'project_documents',
    'project_issues',
    'user_project_access',
    'user_site_access',
    'sites',
    'projects',
    'clients',

    // 4. Procurement & Material Movements
    'procurement_receipts',
    'procurement_requests',
    'material_movements',
    'material_entries',

    // 5. Warehouse Stock & Transactions
    'warehouse_transactions',
    'warehouse_stock',

    // 6. Finance & Contracts
    'expenses',
    'contractor_po_milestones',
    'contractor_pos',
    'contractor_payments',

    // 7. Contractors & Vendors
    'contractor_documents',
    'contractor_workers',
    'contractors',
    'vendors',

    // 8. HR, Labour & Attendance
    'attendance_records',
    'leave_records',
    'labour_records',
    'labour_assignments',
    'labour_request_assignments',
    'labour_requests',
    'employee_assignments',
    'employee_skills',
    'employee_profiles_360',
    'employees',

    // 9. Approvals & Notifications
    'approval_history',
    'approval_requests',
    'notifications',

    // 10. Sessions / Tokens
    'refresh_tokens',
    'password_resets',
  ];

  for (const t of tables) {
    await pool.query('DELETE FROM `' + t + '`');
    await pool.query('ALTER TABLE `' + t + '` AUTO_INCREMENT = 1');
    console.log('Cleared: ' + t);
  }

  // Remove contractor warehouses, keep central warehouse
  await pool.query("DELETE FROM warehouses WHERE type = 'contractor'");
  console.log('Cleared: contractor warehouses');

  // Keep admin user (ID = 1), delete other test users
  await pool.query('DELETE FROM user_permissions WHERE user_id <> 1');
  await pool.query('DELETE FROM users WHERE id <> 1');
  console.log('Cleared: test users (Admin user ID 1 preserved)');

  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('--- ALL CRM DATA CLEARED TO 0 SUCCESSFULLY ---');
  process.exit(0);
}

clearEntireCRM().catch((err) => {
  console.error('Error clearing CRM:', err);
  process.exit(1);
});
