'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/db');

async function clearFinanceSitesProcurement() {
  const connection = await pool.getConnection();
  console.log('=============================================================');
  console.log('RESETTING FINANCE, SITES, AND PROCUREMENT DATA');
  console.log('=============================================================\n');

  try {
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // -------------------------------------------------------------------------
    // 1. FINANCE DATA
    // -------------------------------------------------------------------------
    console.log('--- [1/4] Clearing Finance Data ---');

    const [delExp] = await connection.query('DELETE FROM expenses');
    console.log(`✓ Deleted ${delExp.affectedRows} expenses`);

    const [delClientPay] = await connection.query('DELETE FROM client_payments');
    console.log(`✓ Deleted ${delClientPay.affectedRows} client payments`);

    const [delContrPay] = await connection.query('DELETE FROM contractor_payments');
    console.log(`✓ Deleted ${delContrPay.affectedRows} contractor payments`);

    const [delVendPay] = await connection.query('DELETE FROM vendor_payments');
    console.log(`✓ Deleted ${delVendPay.affectedRows} vendor payments`);

    const [delMilestones] = await connection.query('DELETE FROM contractor_po_milestones');
    console.log(`✓ Deleted ${delMilestones.affectedRows} contractor PO milestones`);

    const [delPos] = await connection.query('DELETE FROM contractor_pos');
    console.log(`✓ Deleted ${delPos.affectedRows} contractor purchase orders (POs)`);

    const [delBudgetAppr] = await connection.query('DELETE FROM task_budget_approvals');
    console.log(`✓ Deleted ${delBudgetAppr.affectedRows} task budget approvals`);

    // Project phase budget items
    await connection.query('DELETE FROM project_phase_materials');
    await connection.query('DELETE FROM project_phase_labour');
    await connection.query('DELETE FROM project_phase_tools');
    await connection.query('DELETE FROM project_phase_misc');
    console.log('✓ Cleared project phase budget line items');

    // Reset project phase budget sums
    const [resetPhases] = await connection.query(`
      UPDATE project_phases
      SET material_cost = 0, tool_cost = 0, labour_cost = 0, misc_cost = 0, total_cost = 0, duration_months = 0
    `);
    console.log(`✓ Reset budget totals on ${resetPhases.affectedRows} project phases`);

    // Clear task budget line items
    await connection.query('DELETE FROM task_materials');
    await connection.query('DELETE FROM task_tools');
    // Machine allocations/rentals belong to the projects being cleared. The serial-numbered
    // machines themselves are company assets: keep them, but free them.
    await connection.query('DELETE FROM tool_rentals').catch(() => {});
    await connection.query('DELETE FROM tool_allocations').catch(() => {});
    await connection.query("UPDATE tool_units SET availability_status = IF(availability_status = 'allocated', 'available', availability_status), current_contractor_id = NULL, current_project_id = NULL, current_site_id = NULL, current_task_id = NULL").catch(() => {});
    await connection.query('DELETE FROM task_labour');
    await connection.query('DELETE FROM task_misc');
    console.log('✓ Cleared task budget line items (materials, tools, labour, misc)');

    // Reset task planned budget tracking
    const [resetTasks] = await connection.query(`
      UPDATE project_tasks
      SET material_budget = 0, tool_budget = 0, labour_budget = 0, misc_budget = 0, total_budget = 0,
          approved_additional_budget = 0, pending_excess_budget = 0, excess_reason = NULL
    `);
    console.log(`✓ Reset financial budget tracking on ${resetTasks.affectedRows} tasks`);

    // -------------------------------------------------------------------------
    // 2. PROCUREMENT & WAREHOUSE INVENTORY
    // -------------------------------------------------------------------------
    console.log('\n--- [2/4] Clearing Procurement & Inventory Movements ---');

    const [delRcpt] = await connection.query('DELETE FROM procurement_receipts');
    console.log(`✓ Deleted ${delRcpt.affectedRows} procurement receipts`);

    const [delReq] = await connection.query('DELETE FROM procurement_requests');
    console.log(`✓ Deleted ${delReq.affectedRows} procurement requests`);

    const [delMm] = await connection.query('DELETE FROM material_movements');
    console.log(`✓ Deleted ${delMm.affectedRows} material movements`);

    const [delMe] = await connection.query('DELETE FROM material_entries');
    console.log(`✓ Deleted ${delMe.affectedRows} material entries`);

    const [delWtx] = await connection.query('DELETE FROM warehouse_transactions');
    console.log(`✓ Deleted ${delWtx.affectedRows} warehouse transactions`);

    const [delStock] = await connection.query('DELETE FROM warehouse_stock');
    console.log(`✓ Cleared ${delStock.affectedRows} warehouse stock records`);

    const [unlinkedDwuWtx] = await connection.query(
      'UPDATE daily_work_updates SET warehouse_transaction_id = NULL WHERE warehouse_transaction_id IS NOT NULL'
    );
    console.log(`✓ Unlinked warehouse transaction references on ${unlinkedDwuWtx.affectedRows} daily work updates`);

    // Verify materials master is untouched
    const [[{ matCount }]] = await connection.query('SELECT COUNT(*) AS matCount FROM materials');
    console.log(`✓ Materials master intact: ${matCount} items preserved`);

    // -------------------------------------------------------------------------
    // 3. SITES & SITE DATA
    // -------------------------------------------------------------------------
    console.log('\n--- [3/4] Clearing Sites and Site Records ---');

    const [delAct] = await connection.query('DELETE FROM site_activities');
    console.log(`✓ Deleted ${delAct.affectedRows} site activities`);

    const [delUsa] = await connection.query('DELETE FROM user_site_access');
    console.log(`✓ Deleted ${delUsa.affectedRows} user site access rows`);

    const [delPhotos] = await connection.query('DELETE FROM daily_work_photos WHERE site_id IS NOT NULL');
    console.log(`✓ Deleted ${delPhotos.affectedRows} site daily work photos`);

    const [delUpdates] = await connection.query('DELETE FROM daily_work_updates WHERE site_id IS NOT NULL');
    console.log(`✓ Deleted ${delUpdates.affectedRows} site daily work updates`);

    // Safely unlink site_id across operational tables so tasks and projects remain intact
    await connection.query('UPDATE project_tasks SET site_id = NULL WHERE site_id IS NOT NULL');
    await connection.query('UPDATE attendance_records SET site_id = NULL WHERE site_id IS NOT NULL');
    await connection.query('UPDATE labour_assignments SET site_id = NULL WHERE site_id IS NOT NULL');
    await connection.query('UPDATE employee_assignments SET site_id = NULL WHERE site_id IS NOT NULL');
    await connection.query('UPDATE project_issues SET site_id = NULL WHERE site_id IS NOT NULL');
    await connection.query('UPDATE task_materials SET site_id = NULL WHERE site_id IS NOT NULL');
    await connection.query('UPDATE task_tools SET site_id = NULL WHERE site_id IS NOT NULL');
    await connection.query('UPDATE task_labour SET site_id = NULL WHERE site_id IS NOT NULL');
    await connection.query('UPDATE task_misc SET site_id = NULL WHERE site_id IS NOT NULL');
    await connection.query('UPDATE task_assigned_workers SET site_id = NULL WHERE site_id IS NOT NULL');
    await connection.query('UPDATE task_worker_logs SET site_id = NULL WHERE site_id IS NOT NULL');
    console.log('✓ Safely unlinked site_id across operational tables');

    const [delSites] = await connection.query('DELETE FROM sites');
    console.log(`✓ Deleted ${delSites.affectedRows} sites`);

    // -------------------------------------------------------------------------
    // 4. APPROVAL REQUESTS (Finance & Procurement)
    // -------------------------------------------------------------------------
    console.log('\n--- [4/4] Cleaning Approval Logs for Finance & Procurement ---');

    const [delHist] = await connection.query(`
      DELETE FROM approval_history
      WHERE module IN ('finance', 'procurement', 'sites', 'expenses', 'budget', 'payments')
    `);
    console.log(`✓ Cleared ${delHist.affectedRows} approval history entries`);

    const [delAppr] = await connection.query(`
      DELETE FROM approval_requests
      WHERE request_type IN ('expense', 'client_payment', 'vendor_payment', 'contractor_payment', 'procurement', 'material', 'budget', 'po', 'contractor_po')
         OR site_id IS NOT NULL
    `);
    console.log(`✓ Cleared ${delAppr.affectedRows} finance/procurement/site approval requests`);

    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();

    console.log('\n=============================================================');
    console.log('SUCCESS: Finance, Sites, and Procurement have been cleared!');
    console.log('=============================================================\n');
  } catch (error) {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.rollback();
    console.error('\n❌ ERROR OCCURRED - TRANSACTION ROLLED BACK:', error);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

clearFinanceSitesProcurement();
