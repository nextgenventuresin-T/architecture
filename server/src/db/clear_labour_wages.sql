-- ============================================================
-- SQL QUERY TO REMOVE ALL LABOUR WAGES & LABOUR COST DATA
-- Open this in VS Code and execute against your database
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Delete actual daily worker logs & recorded wages on tasks
DELETE FROM task_worker_logs;

-- 2. Delete task assigned workers
DELETE FROM task_assigned_workers;

-- 3. Delete planned task labour budgets & daily wages
DELETE FROM task_labour;

-- 4. Delete project phase labour planning
DELETE FROM project_phase_labour;

-- 5. Delete labour attendance records & site wage diaries
DELETE FROM attendance_records;
DELETE FROM labour_records;

-- 6. Delete labour requests and request assignments
DELETE FROM labour_request_assignments;
DELETE FROM labour_assignments;
DELETE FROM labour_requests;

-- 7. Delete labour expenses from finance ledger
DELETE FROM expenses WHERE category = 'labour';

-- 8. Reset worker daily wage rates to 0.00 (keeps workers directory intact)
UPDATE contractor_workers SET daily_rate = 0.00;

-- (Optional: If you want to delete all contractor worker profiles completely, uncomment below)
-- DELETE FROM contractor_workers;

-- 9. Reset labour_budget to 0.00 on all tasks & recalculate total_budget
UPDATE project_tasks
SET labour_budget = 0.00,
    total_budget = COALESCE(material_budget, 0) + COALESCE(tool_budget, 0) + COALESCE(misc_budget, 0);

-- 10. Recalculate project estimated_budget from updated tasks
UPDATE projects p
SET p.estimated_budget = (
  SELECT COALESCE(SUM(pt.total_budget), 0)
  FROM project_tasks pt
  WHERE pt.project_id = p.id
);

SET FOREIGN_KEY_CHECKS = 1;

-- Verify results:
SELECT 'task_labour' AS tbl, COUNT(*) AS row_count FROM task_labour
UNION ALL
SELECT 'task_worker_logs' AS tbl, COUNT(*) AS row_count FROM task_worker_logs
UNION ALL
SELECT 'labour_records' AS tbl, COUNT(*) AS row_count FROM labour_records
UNION ALL
SELECT 'attendance_records' AS tbl, COUNT(*) AS row_count FROM attendance_records
UNION ALL
SELECT 'tasks_with_labour_budget' AS tbl, COUNT(*) AS row_count FROM project_tasks WHERE labour_budget > 0;
