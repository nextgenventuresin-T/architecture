'use strict';

const { pool } = require('../config/db');

async function clearLabourWages() {
  const connection = await pool.getConnection();
  console.log('--- STARTING LABOUR WAGES & LABOUR DATA CLEANUP ---');

  try {
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // 1. Delete actual daily worker logs & wages
    const [delWorkerLogs] = await connection.query('DELETE FROM task_worker_logs');
    console.log(`- Deleted ${delWorkerLogs.affectedRows} task worker logs (actual labour wages)`);

    // 2. Delete task assigned workers
    const [delAssignedWorkers] = await connection.query('DELETE FROM task_assigned_workers');
    console.log(`- Deleted ${delAssignedWorkers.affectedRows} task assigned worker records`);

    // 3. Delete planned task labour (wages & days)
    const [delTaskLabour] = await connection.query('DELETE FROM task_labour');
    console.log(`- Deleted ${delTaskLabour.affectedRows} task labour planned records`);

    // 4. Delete project phase labour
    const [delPhaseLabour] = await connection.query('DELETE FROM project_phase_labour');
    console.log(`- Deleted ${delPhaseLabour.affectedRows} project phase labour records`);

    // 5. Delete labour attendance & wage records
    const [delAttendance] = await connection.query('DELETE FROM attendance_records');
    console.log(`- Deleted ${delAttendance.affectedRows} attendance records`);

    const [delLabourRecords] = await connection.query('DELETE FROM labour_records');
    console.log(`- Deleted ${delLabourRecords.affectedRows} daily labour records`);

    // 6. Delete labour requests & assignments
    const [delReqAssign] = await connection.query('DELETE FROM labour_request_assignments');
    console.log(`- Deleted ${delReqAssign.affectedRows} labour request assignments`);

    const [delLabourAssign] = await connection.query('DELETE FROM labour_assignments');
    console.log(`- Deleted ${delLabourAssign.affectedRows} labour assignments`);

    const [delLabourReq] = await connection.query('DELETE FROM labour_requests');
    console.log(`- Deleted ${delLabourReq.affectedRows} labour requests`);

    // 7. Delete labour expenses from finance expenses table
    const [delExpenses] = await connection.query("DELETE FROM expenses WHERE category = 'labour'");
    console.log(`- Deleted ${delExpenses.affectedRows} labour expense records`);

    // 8. Reset daily_rate to 0 in contractor_workers roster (keeps worker profiles intact)
    const [resetWorkerRates] = await connection.query('UPDATE contractor_workers SET daily_rate = 0.00');
    console.log(`- Reset daily_rate to 0 for ${resetWorkerRates.affectedRows} contractor workers`);

    // 9. Reset labour_budget to 0 on project_tasks and recalculate total_budget
    const [updateTasks] = await connection.query(`
      UPDATE project_tasks
      SET labour_budget = 0.00,
          total_budget = COALESCE(material_budget, 0) + COALESCE(tool_budget, 0) + COALESCE(misc_budget, 0)
    `);
    console.log(`- Reset labour_budget to 0 on ${updateTasks.affectedRows} project tasks`);

    // 10. Recalculate estimated_budget on projects
    const [updateProjects] = await connection.query(`
      UPDATE projects p
      SET p.estimated_budget = (
        SELECT COALESCE(SUM(pt.total_budget), 0)
        FROM project_tasks pt
        WHERE pt.project_id = p.id
      )
    `);
    console.log(`- Recalculated estimated_budget on ${updateProjects.affectedRows} projects`);

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();
    console.log('\n SUCCESS: All labour wages & labour records cleared successfully!');
  } catch (error) {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.rollback();
    console.error(' ERROR OCCURRED, TRANSACTION ROLLED BACK:', error);
    throw error;
  } finally {
    connection.release();
  }
}

clearLabourWages()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
