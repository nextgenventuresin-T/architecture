-- Architecture ERP — Contractor Daily Expenses support on expenses table.
-- Adds contractor_id, party_name, and bill/receipt file columns to expenses.
-- Safe to re-run: information_schema guarded.

USE `architecture_erp`;

-- Widen category column to accommodate longer category names
ALTER TABLE `expenses` MODIFY COLUMN `category` VARCHAR(100) NOT NULL;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expenses' AND COLUMN_NAME='contractor_id');
SET @stmt := IF(@exists=0, 'ALTER TABLE `expenses` ADD COLUMN `contractor_id` INT UNSIGNED NULL AFTER `site_id`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expenses' AND COLUMN_NAME='party_name');
SET @stmt := IF(@exists=0, 'ALTER TABLE `expenses` ADD COLUMN `party_name` VARCHAR(150) NULL AFTER `paid_by`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expenses' AND COLUMN_NAME='bill_file_path');
SET @stmt := IF(@exists=0, 'ALTER TABLE `expenses` ADD COLUMN `bill_file_path` VARCHAR(255) NULL AFTER `reference`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expenses' AND COLUMN_NAME='bill_file_name');
SET @stmt := IF(@exists=0, 'ALTER TABLE `expenses` ADD COLUMN `bill_file_name` VARCHAR(255) NULL AFTER `bill_file_path`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expenses' AND COLUMN_NAME='bill_file_type');
SET @stmt := IF(@exists=0, 'ALTER TABLE `expenses` ADD COLUMN `bill_file_type` VARCHAR(100) NULL AFTER `bill_file_name`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expenses' AND COLUMN_NAME='bill_file_size');
SET @stmt := IF(@exists=0, 'ALTER TABLE `expenses` ADD COLUMN `bill_file_size` INT UNSIGNED NULL AFTER `bill_file_type`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expenses' AND COLUMN_NAME='bill_uploaded_at');
SET @stmt := IF(@exists=0, 'ALTER TABLE `expenses` ADD COLUMN `bill_uploaded_at` DATETIME NULL AFTER `bill_file_size`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expenses' AND INDEX_NAME='idx_expenses_contractor_id');
SET @stmt := IF(@exists=0, 'ALTER TABLE `expenses` ADD INDEX `idx_expenses_contractor_id` (`contractor_id`)', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
