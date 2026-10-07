-- Architecture ERP — Interface 9: Finance Management.
-- Applied last, after every other schema file.
--
-- ---------------------------------------------------------------------------
-- NO NEW ENTITY TABLES ARE CREATED BY THIS INTERFACE.
-- ---------------------------------------------------------------------------
-- schema_projects.sql already created everything Finance needs:
--   `expenses`             — project/site expense ledger (category, description,
--                            amount, expense_date)
--   `contractor_payments`  — one row per project+contractor contract, carrying
--                            contract_value, paid_amount and payment_status
--   `projects`             — `estimated_budget` is ALREADY the project budget,
--                            so no budget column is added and no project data
--                            is touched
--   `procurement_requests` / `procurement_receipts` — Interface 7 supplies all
--                            procurement cost figures; Finance only reads them
--   `materials`, `users`   — read-only references
--
-- So this file adds COLUMNS to two existing tables and nothing else. Creating
-- `finance_expenses` or a second contractor payment table would have produced
-- exactly the duplicate entity systems the interface forbids, and would have
-- silently orphaned the 13 expenses and 5 contractor payments already on file.
--
-- What is added:
--   expenses            — expense_number, paid_by, payment_method, reference,
--                         status, notes, created_by, updated_at
--   contractor_payments — site_id, payment_reference, payment_date, notes
--
-- ---------------------------------------------------------------------------
-- A NOTE ON THE STATUS BACKFILL
-- ---------------------------------------------------------------------------
-- Existing expense rows predate the concept of a payment status, so whether
-- each was actually paid is information this migration genuinely does not
-- have. Rather than invent it, every existing row is left at the column
-- default of 'pending' and an admin can set the real status. The finance
-- dashboard is built to read correctly either way: "Total expenses" counts
-- every expense that has not been rejected or cancelled (matching how
-- Interface 3's project financials already sum this table), while "Paid" is
-- reported separately from the rows actually marked paid plus the real
-- contractor_payments.paid_amount figures.
--
-- Portability: identical information_schema-guard style used by
-- schema_materials.sql. Safe to re-run. Nothing is dropped, renamed, re-typed
-- or deleted.

USE `architecture_erp`;

-- ============================================================== expenses

-- `expense_number` — human-facing reference (EXP-0001).
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'expense_number');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD COLUMN `expense_number` VARCHAR(30) NULL AFTER `id`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `paid_by` — who settled it (free text: a person, a department, petty cash).
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'paid_by');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD COLUMN `paid_by` VARCHAR(150) NULL AFTER `expense_date`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `payment_method` — cash | bank_transfer | cheque | upi | card | other
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'payment_method');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD COLUMN `payment_method` VARCHAR(30) NULL AFTER `paid_by`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `reference` — cheque number, UTR, bill number.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'reference');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD COLUMN `reference` VARCHAR(150) NULL AFTER `payment_method`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `status` — pending | approved | paid | rejected | cancelled
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'status');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT ''pending'' AFTER `reference`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `notes` — free-text detail.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'notes');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD COLUMN `notes` TEXT NULL AFTER `status`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `created_by` — the signed-in user who recorded it.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'created_by');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD COLUMN `created_by` BIGINT UNSIGNED NULL AFTER `notes`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- Foreign key for created_by, added separately so a re-run does not duplicate it.
SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses'
    AND CONSTRAINT_NAME = 'fk_expenses_created_by');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD CONSTRAINT `fk_expenses_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `updated_at` — `expenses` predates this interface and only had created_at.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND COLUMN_NAME = 'updated_at');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- Indexes for the finance filters.
SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND INDEX_NAME = 'idx_expenses_status');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD INDEX `idx_expenses_status` (`status`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND INDEX_NAME = 'idx_expenses_category');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD INDEX `idx_expenses_category` (`category`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND INDEX_NAME = 'idx_expenses_date');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD INDEX `idx_expenses_date` (`expense_date`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- Backfill expense numbers BEFORE the unique index goes on, so every existing
-- row gets one. Only rows without a number are touched, so re-runs are a no-op
-- and an admin-entered number is never overwritten.
UPDATE `expenses`
SET `expense_number` = CONCAT('EXP-', LPAD(`id`, 4, '0'))
WHERE `expense_number` IS NULL OR `expense_number` = '';

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expenses' AND INDEX_NAME = 'uq_expenses_number');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `expenses` ADD UNIQUE INDEX `uq_expenses_number` (`expense_number`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- ==================================================== contractor_payments

-- `site_id` — payments are often raised against one site of a project.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractor_payments' AND COLUMN_NAME = 'site_id');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `contractor_payments` ADD COLUMN `site_id` INT UNSIGNED NULL AFTER `contractor_id`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractor_payments'
    AND CONSTRAINT_NAME = 'fk_cp_site');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `contractor_payments` ADD CONSTRAINT `fk_cp_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `payment_reference` — cheque number, UTR, running-account bill number.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractor_payments' AND COLUMN_NAME = 'payment_reference');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `contractor_payments` ADD COLUMN `payment_reference` VARCHAR(150) NULL AFTER `paid_amount`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `payment_date` — when the last payment was released.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractor_payments' AND COLUMN_NAME = 'payment_date');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `contractor_payments` ADD COLUMN `payment_date` DATE NULL AFTER `payment_reference`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `notes` — free-text detail.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractor_payments' AND COLUMN_NAME = 'notes');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `contractor_payments` ADD COLUMN `notes` TEXT NULL AFTER `payment_status`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractor_payments' AND INDEX_NAME = 'idx_cp_status');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `contractor_payments` ADD INDEX `idx_cp_status` (`payment_status`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;
