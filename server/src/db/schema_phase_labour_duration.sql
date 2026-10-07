-- Architecture ERP — Phase Labour Duration Schema Extension
USE `architecture_erp`;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_phase_labour' AND COLUMN_NAME = 'worker_count');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `project_phase_labour` ADD COLUMN `worker_count` DECIMAL(10,2) NOT NULL DEFAULT 1 AFTER `labour_type`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_phase_labour' AND COLUMN_NAME = 'daily_wage');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `project_phase_labour` ADD COLUMN `daily_wage` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `worker_count`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_phase_labour' AND COLUMN_NAME = 'working_days');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `project_phase_labour` ADD COLUMN `working_days` DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `daily_wage`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

ALTER TABLE `project_phase_labour` MODIFY COLUMN `labour_type` VARCHAR(100) NOT NULL DEFAULT 'Mason';
