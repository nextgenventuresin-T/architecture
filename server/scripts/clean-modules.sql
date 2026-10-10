-- =============================================================================
-- ARCHITECTURE ERP: CLEAN & RESET MODULES SCRIPT
-- Modules Cleared: Project, Finance, Procurement, Warehouse
-- Preserves Master Data: Users, Roles, Contractors, Vendors, Materials, Tools
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1. PROJECT MODULE
-- -----------------------------------------------------------------------------
TRUNCATE TABLE `daily_work_photos`;
TRUNCATE TABLE `daily_work_updates`;
TRUNCATE TABLE `task_worker_logs`;
TRUNCATE TABLE `task_assigned_workers`;
TRUNCATE TABLE `task_budget_approvals`;
TRUNCATE TABLE `task_labour`;
TRUNCATE TABLE `task_materials`;
TRUNCATE TABLE `task_misc`;
TRUNCATE TABLE `task_tools`;
TRUNCATE TABLE `project_tasks`;
TRUNCATE TABLE `project_phase_labour`;
TRUNCATE TABLE `project_phase_materials`;
TRUNCATE TABLE `project_phase_misc`;
TRUNCATE TABLE `project_phase_tools`;
TRUNCATE TABLE `project_phases`;
TRUNCATE TABLE `project_issues`;
TRUNCATE TABLE `project_documents`;
TRUNCATE TABLE `site_activities`;
TRUNCATE TABLE `user_site_access`;
TRUNCATE TABLE `user_project_access`;
TRUNCATE TABLE `sites`;
TRUNCATE TABLE `projects`;

-- Unlink project/site references on employee and labour records
UPDATE `attendance_records` SET `project_id` = NULL, `site_id` = NULL;
UPDATE `labour_assignments` SET `project_id` = NULL, `site_id` = NULL;
UPDATE `employee_assignments` SET `project_id` = NULL, `site_id` = NULL;

-- -----------------------------------------------------------------------------
-- 2. FINANCE MODULE
-- -----------------------------------------------------------------------------
TRUNCATE TABLE `expenses`;
TRUNCATE TABLE `client_payments`;
TRUNCATE TABLE `vendor_payments`;
TRUNCATE TABLE `contractor_payments`;
TRUNCATE TABLE `contractor_po_milestones`;
TRUNCATE TABLE `contractor_pos`;

-- -----------------------------------------------------------------------------
-- 3. PROCUREMENT MODULE
-- -----------------------------------------------------------------------------
TRUNCATE TABLE `procurement_receipts`;
TRUNCATE TABLE `procurement_requests`;
TRUNCATE TABLE `material_entries`;
TRUNCATE TABLE `approval_requests`;
TRUNCATE TABLE `approval_history`;

-- -----------------------------------------------------------------------------
-- 4. WAREHOUSE MODULE
-- -----------------------------------------------------------------------------
TRUNCATE TABLE `material_movements`;
TRUNCATE TABLE `warehouse_transactions`;
TRUNCATE TABLE `warehouse_stock`;

-- Delete temporary contractor warehouses, keep or re-create Central Main Warehouse
DELETE FROM `warehouses` WHERE `type` != 'central' AND `code` != 'WH-001';

INSERT IGNORE INTO `warehouses` (`code`, `name`, `location`, `description`, `status`, `type`)
VALUES ('WH-001', 'Central Main Warehouse', 'Headquarters / Main Store Yard', 'Main central warehouse for procurement, central stock storage, and site material transfers.', 'active', 'central');

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- COMPLETED: Project, Finance, Procurement, and Warehouse data wiped clean.
-- =============================================================================
