'use strict';

const { pool } = require('../config/db');

async function clearSitesAndFinance() {
  const connection = await pool.getConnection();
  console.log('Starting transaction to clear sites and finance data...');

  try {
    await connection.beginTransaction();

    // Disable foreign key checks during batch cleanup to avoid ordering deadlock
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // -------------------------------------------------------------
    // 1. CLEAR ALL FINANCE DATA
    // -------------------------------------------------------------
    console.log('Clearing Finance Data...');

    // A. Expenses
    const [delExp] = await connection.query('DELETE FROM expenses');
    console.log(`- Deleted ${delExp.affectedRows} expenses`);

    // B. Contractor Payments
    const [delCp] = await connection.query('DELETE FROM contractor_payments');
    console.log(`- Deleted ${delCp.affectedRows} contractor payments`);

    // C. Contractor PO Milestones & POs
    const [delMilestones] = await connection.query('DELETE FROM contractor_po_milestones');
    console.log(`- Deleted ${delMilestones.affectedRows} contractor PO milestones`);

    const [delPos] = await connection.query('DELETE FROM contractor_pos');
    console.log(`- Deleted ${delPos.affectedRows} contractor purchase orders (work orders)`);

    // D. Project Phase Budgets
    const [delPhaseMat] = await connection.query('DELETE FROM project_phase_materials');
    console.log(`- Deleted ${delPhaseMat.affectedRows} project phase material budget items`);

    const [delPhaseLab] = await connection.query('DELETE FROM project_phase_labour');
    console.log(`- Deleted ${delPhaseLab.affectedRows} project phase labour budget items`);

    const [delPhaseTools] = await connection.query('DELETE FROM project_phase_tools');
    console.log(`- Deleted ${delPhaseTools.affectedRows} project phase tool budget items`);

    const [delPhaseMisc] = await connection.query('DELETE FROM project_phase_misc');
    console.log(`- Deleted ${delPhaseMisc.affectedRows} project phase misc budget items`);

    const [resetPhases] = await connection.query(`
      UPDATE project_phases
      SET material_cost = 0,
          tool_cost = 0,
          labour_cost = 0,
          misc_cost = 0,
          total_cost = 0,
          duration_months = 0
    `);
    console.log(`- Reset budget costs to 0 on ${resetPhases.affectedRows} project phases`);

    // -------------------------------------------------------------
    // 2. CLEAR SITES & SITE-SPECIFIC DATA
    // -------------------------------------------------------------
    console.log('\nClearing Sites and Site-Specific Data...');

    // A. Direct child records of sites
    const [delAct] = await connection.query('DELETE FROM site_activities');
    console.log(`- Deleted ${delAct.affectedRows} site activities`);

    const [delUsa] = await connection.query('DELETE FROM user_site_access');
    console.log(`- Deleted ${delUsa.affectedRows} user site access rows`);

    const [delPhotos] = await connection.query('DELETE FROM daily_work_photos WHERE site_id IS NOT NULL');
    console.log(`- Deleted ${delPhotos.affectedRows} daily work photos`);

    const [delUpdates] = await connection.query('DELETE FROM daily_work_updates WHERE site_id IS NOT NULL');
    console.log(`- Deleted ${delUpdates.affectedRows} daily work updates`);

    // Optional site-linked tables
    await connection.query('DELETE FROM approval_requests WHERE site_id IS NOT NULL');
    await connection.query('DELETE FROM project_issues WHERE site_id IS NOT NULL');
    await connection.query('DELETE FROM labour_records WHERE site_id IS NOT NULL');
    await connection.query('DELETE FROM labour_requests WHERE site_id IS NOT NULL');
    await connection.query('DELETE FROM material_entries WHERE site_id IS NOT NULL');

    // B. Safely unlink site_id from shared operational tables
    const [unlinkedAtt] = await connection.query('UPDATE attendance_records SET site_id = NULL WHERE site_id IS NOT NULL');
    console.log(`- Unlinked site_id on ${unlinkedAtt.affectedRows} attendance records`);

    const [unlinkedLa] = await connection.query('UPDATE labour_assignments SET site_id = NULL WHERE site_id IS NOT NULL');
    console.log(`- Unlinked site_id on ${unlinkedLa.affectedRows} labour assignments`);

    const [unlinkedEa] = await connection.query('UPDATE employee_assignments SET site_id = NULL WHERE site_id IS NOT NULL');
    console.log(`- Unlinked site_id on ${unlinkedEa.affectedRows} employee assignments`);

    const [unlinkedMm] = await connection.query('UPDATE material_movements SET site_id = NULL WHERE site_id IS NOT NULL');
    console.log(`- Unlinked site_id on ${unlinkedMm.affectedRows} material movements`);

    const [unlinkedProc] = await connection.query('UPDATE procurement_requests SET site_id = NULL WHERE site_id IS NOT NULL');
    console.log(`- Unlinked site_id on ${unlinkedProc.affectedRows} procurement requests`);

    const [unlinkedWs] = await connection.query('UPDATE warehouse_stock SET site_id = NULL WHERE site_id IS NOT NULL');
    console.log(`- Unlinked site_id on ${unlinkedWs.affectedRows} warehouse stock items`);

    const [unlinkedWt] = await connection.query('UPDATE warehouse_transactions SET site_id = NULL WHERE site_id IS NOT NULL');
    console.log(`- Unlinked site_id on ${unlinkedWt.affectedRows} warehouse transactions`);

    // C. Delete all sites
    const [delSites] = await connection.query('DELETE FROM sites');
    console.log(`- Deleted ${delSites.affectedRows} sites`);

    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    await connection.commit();
    console.log('\nTRANSACTION COMMITTED: All sites and finance data cleared successfully!');
  } catch (error) {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.rollback();
    console.error('ERROR OCCURRED, TRANSACTION ROLLED BACK:', error);
    throw error;
  } finally {
    connection.release();
  }
}

clearSitesAndFinance()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
