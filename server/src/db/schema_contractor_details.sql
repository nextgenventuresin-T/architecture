-- Schema update: Add Contractor PAN, Aadhaar, GST and Bank details
USE `architecture_erp`;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND COLUMN_NAME = 'pan_number');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `contractors` ADD COLUMN `pan_number` VARCHAR(20) NULL AFTER `address`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND COLUMN_NAME = 'aadhaar_number');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `contractors` ADD COLUMN `aadhaar_number` VARCHAR(20) NULL AFTER `pan_number`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND COLUMN_NAME = 'gst_number');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `contractors` ADD COLUMN `gst_number` VARCHAR(20) NULL AFTER `aadhaar_number`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND COLUMN_NAME = 'bank_account_holder');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `contractors` ADD COLUMN `bank_account_holder` VARCHAR(150) NULL AFTER `gst_number`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND COLUMN_NAME = 'bank_account_number');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `contractors` ADD COLUMN `bank_account_number` VARCHAR(50) NULL AFTER `bank_account_holder`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND COLUMN_NAME = 'bank_name');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `contractors` ADD COLUMN `bank_name` VARCHAR(150) NULL AFTER `bank_account_number`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND COLUMN_NAME = 'bank_ifsc');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `contractors` ADD COLUMN `bank_ifsc` VARCHAR(20) NULL AFTER `bank_name`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND COLUMN_NAME = 'bank_branch');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `contractors` ADD COLUMN `bank_branch` VARCHAR(150) NULL AFTER `bank_ifsc`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Make project_id and site_id nullable in attendance_records for office employees
ALTER TABLE `attendance_records` MODIFY COLUMN `project_id` INT UNSIGNED NULL;
ALTER TABLE `attendance_records` MODIFY COLUMN `site_id` INT UNSIGNED NULL;
