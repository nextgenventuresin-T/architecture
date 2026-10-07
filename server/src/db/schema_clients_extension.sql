-- Architecture ERP — Extended Client Master Schema
USE `architecture_erp`;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'client_type');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `client_type` VARCHAR(50) NOT NULL DEFAULT ''Company'' AFTER `name`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'pan');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `pan` VARCHAR(20) NULL AFTER `client_type`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'gstin');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `gstin` VARCHAR(20) NULL AFTER `pan`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'cin');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `cin` VARCHAR(30) NULL AFTER `gstin`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'website');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `website` VARCHAR(191) NULL AFTER `cin`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'status');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT ''active'' AFTER `website`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'alternate_phone');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `alternate_phone` VARCHAR(30) NULL AFTER `phone`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'alternate_email');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `alternate_email` VARCHAR(191) NULL AFTER `email`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'corporate_address');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `corporate_address` TEXT NULL AFTER `address`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'billing_address');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `billing_address` TEXT NULL AFTER `corporate_address`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'efy');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `efy` VARCHAR(50) NULL AFTER `billing_address`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'adherence');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `adherence` VARCHAR(100) NULL AFTER `efy`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Sync existing address to corporate_address where corporate_address is null
UPDATE `clients` SET `corporate_address` = `address` WHERE `corporate_address` IS NULL AND `address` IS NOT NULL;
