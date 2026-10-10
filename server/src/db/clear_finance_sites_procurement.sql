-- ==============================================================================
-- CLEAR FINANCE, SITES, AND PROCUREMENT DATA
-- Architecture ERP
-- ==============================================================================
-- This script safely wipes transactional data across:
-- 1. Finance (Expenses, Client Payments, Contractor Payments, Vendor Payments, POs, Budgets)
-- 2. Procurement & Inventory (Requisitions, Receipts, Movements, Entries, Transactions, Stock)
-- 3. Sites (Sites, Site Activities, Site User Access)
--
-- PRESERVED MASTER DATA:
-- - Users & Auth (users, roles, permissions)
-- - Projects & Clients (projects, clients)
-- - Vendors & Materials Master Catalog (vendors, materials)
-- - Warehouses (warehouses master list)
-- - Workforce & Staff (employees, contractors, contractor_workers)
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- 1. CLEAR FINANCE DATA
-- ------------------------------------------------------------------------------

-- Operational & Project Expenses
TRUNCATE TABLE expenses;

-- Client Invoices & Billings Received
TRUNCATE TABLE client_payments;

-- Contractor Disbursements & Payments
TRUNCATE TABLE contractor_payments;

-- Vendor / Supplier Payments
TRUNCATE TABLE vendor_payments;

-- Contractor Purchase Orders (Work Orders) & Milestones
TRUNCATE TABLE contractor_po_milestones;
TRUNCATE TABLE contractor_pos;

-- Task Budget Approvals
TRUNCATE TABLE task_budget_approvals;

-- Project Phase Budget Details
TRUNCATE TABLE project_phase_materials;
TRUNCATE TABLE project_phase_labour;
TRUNCATE TABLE project_phase_tools;
TRUNCATE TABLE project_phase_misc;

-- Reset Phase Budgets on Projects
UPDATE project_phases
SET material_cost = 0,
    tool_cost = 0,
    labour_cost = 0,
    misc_cost = 0,
    total_cost = 0,
    duration_months = 0;

-- Clear Task Budget Line Items
TRUNCATE TABLE task_materials;
TRUNCATE TABLE task_tools;
TRUNCATE TABLE task_labour;
TRUNCATE TABLE task_misc;

-- Reset Task Planned Budget Tracking
UPDATE project_tasks
SET material_budget = 0,
    tool_budget = 0,
    labour_budget = 0,
    misc_budget = 0,
    total_budget = 0,
    approved_additional_budget = 0,
    pending_excess_budget = 0,
    excess_reason = NULL;

-- ------------------------------------------------------------------------------
-- 2. CLEAR PROCUREMENT & WAREHOUSE INVENTORY MOVEMENTS
-- ------------------------------------------------------------------------------

-- Material Requisitions & Receipts
TRUNCATE TABLE procurement_receipts;
TRUNCATE TABLE procurement_requests;

-- Material Movement Transfers & Entries
TRUNCATE TABLE material_movements;
TRUNCATE TABLE material_entries;

-- Warehouse Audit Transactions & Stock Counts
TRUNCATE TABLE warehouse_transactions;
TRUNCATE TABLE warehouse_stock;

-- Clean warehouse transaction links on daily work updates
UPDATE daily_work_updates
SET warehouse_transaction_id = NULL
WHERE warehouse_transaction_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. CLEAR SITES & SITE ACCESS
-- ------------------------------------------------------------------------------

-- Direct Site Child Records
TRUNCATE TABLE site_activities;
TRUNCATE TABLE user_site_access;

-- Daily Work Photos & Updates linked to sites (or remove if purely site-level)
DELETE FROM daily_work_photos WHERE site_id IS NOT NULL;
DELETE FROM daily_work_updates WHERE site_id IS NOT NULL;

-- Safely unlink site_id across operational tables so tasks and logs remain valid
UPDATE project_tasks SET site_id = NULL WHERE site_id IS NOT NULL;
UPDATE attendance_records SET site_id = NULL WHERE site_id IS NOT NULL;
UPDATE labour_assignments SET site_id = NULL WHERE site_id IS NOT NULL;
UPDATE employee_assignments SET site_id = NULL WHERE site_id IS NOT NULL;
UPDATE project_issues SET site_id = NULL WHERE site_id IS NOT NULL;
UPDATE task_materials SET site_id = NULL WHERE site_id IS NOT NULL;
UPDATE task_tools SET site_id = NULL WHERE site_id IS NOT NULL;
UPDATE task_labour SET site_id = NULL WHERE site_id IS NOT NULL;
UPDATE task_misc SET site_id = NULL WHERE site_id IS NOT NULL;
UPDATE task_assigned_workers SET site_id = NULL WHERE site_id IS NOT NULL;
UPDATE task_worker_logs SET site_id = NULL WHERE site_id IS NOT NULL;

-- Finally clear Sites table
TRUNCATE TABLE sites;

-- ------------------------------------------------------------------------------
-- 4. CLEAN APPROVAL REQUESTS FOR FINANCE & PROCUREMENT
-- ------------------------------------------------------------------------------

DELETE FROM approval_history
WHERE module IN ('finance', 'procurement', 'sites', 'expenses', 'budget', 'payments');

DELETE FROM approval_requests
WHERE request_type IN ('expense', 'client_payment', 'vendor_payment', 'contractor_payment', 'procurement', 'material', 'budget', 'po', 'contractor_po')
   OR site_id IS NOT NULL;

SET FOREIGN_KEY_CHECKS = 1;

-- ==============================================================================
-- DONE! Finance, Sites, and Procurement have been reset.
-- ==============================================================================
