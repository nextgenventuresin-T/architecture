-- Architecture ERP — Real bill/invoice file storage for procurement.
--
-- Applied AFTER schema_procurement_flows.sql. Adds columns that hold a REAL
-- uploaded bill/invoice file (stored on disk by the upload middleware) linked to
-- the procurement request. The existing text `bill_reference` (bill number / PO)
-- is kept untouched — this is additive.
--
-- Portability: information_schema-guarded prepared statements, safe to re-run.

USE `architecture_erp`;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='bill_file_path');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `bill_file_path` VARCHAR(255) NULL AFTER `bill_reference`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='bill_file_name');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `bill_file_name` VARCHAR(255) NULL AFTER `bill_file_path`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='bill_file_type');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `bill_file_type` VARCHAR(100) NULL AFTER `bill_file_name`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='bill_file_size');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `bill_file_size` INT UNSIGNED NULL AFTER `bill_file_type`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='bill_uploaded_at');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `bill_uploaded_at` DATETIME NULL AFTER `bill_file_size`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='bill_uploaded_by');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `bill_uploaded_by` BIGINT UNSIGNED NULL AFTER `bill_uploaded_at`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
