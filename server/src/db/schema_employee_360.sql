-- Architecture ERP — Employee Directory 360 & People Search Schema
-- Adds Department, Reporting Manager, Work Location, Work Mode, Availability,
-- Avatar, Experience, and Employee 360 (Skills, Interests, Strengths, Career Goals).

USE `architecture_erp`;

-- ------------------------------------------------------------------ columns on employees

-- `department`
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'department');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `department` VARCHAR(100) NULL AFTER `designation`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `reporting_manager_id`
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'reporting_manager_id');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `reporting_manager_id` INT UNSIGNED NULL AFTER `department`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `work_location`
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'work_location');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `work_location` VARCHAR(150) NULL AFTER `address`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `work_mode` (office, wfh, hybrid, site, remote)
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'work_mode');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `work_mode` VARCHAR(30) NOT NULL DEFAULT ''office'' AFTER `work_location`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `availability_status` (available, busy, on_leave, allocated)
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'availability_status');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `availability_status` VARCHAR(30) NOT NULL DEFAULT ''available'' AFTER `status`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `avatar_url`
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'avatar_url');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `avatar_url` VARCHAR(255) NULL AFTER `availability_status`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `experience_years`
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'experience_years');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `experience_years` DECIMAL(4,1) NULL DEFAULT 0.0 AFTER `joining_date`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Foreign key on reporting_manager_id
SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND CONSTRAINT_NAME = 'fk_employees_reporting_manager');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD CONSTRAINT `fk_employees_reporting_manager` FOREIGN KEY (`reporting_manager_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Indexes on new columns
SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND INDEX_NAME = 'idx_employees_dept');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD INDEX `idx_employees_dept` (`department`)',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND INDEX_NAME = 'idx_employees_work_mode');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD INDEX `idx_employees_work_mode` (`work_mode`)',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND INDEX_NAME = 'idx_employees_availability');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD INDEX `idx_employees_availability` (`availability_status`)',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ------------------------------------------------------------------ employee_skills table

CREATE TABLE IF NOT EXISTS `employee_skills` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`  INT UNSIGNED NOT NULL,
  `skill_name`   VARCHAR(100) NOT NULL,
  `proficiency`  TINYINT UNSIGNED NOT NULL DEFAULT 3, -- 1 to 5
  `is_primary`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_emp_skills_employee` (`employee_id`),
  KEY `idx_emp_skills_name` (`skill_name`),
  KEY `idx_emp_skills_prof` (`skill_name`, `proficiency`),
  CONSTRAINT `fk_emp_skills_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ employee_profiles_360 table

CREATE TABLE IF NOT EXISTS `employee_profiles_360` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`        INT UNSIGNED NOT NULL UNIQUE,
  `interests`          JSON NULL,
  `hobbies`            JSON NULL,
  `strengths`          JSON NULL,
  `development_areas`  JSON NULL,
  `career_interests`   JSON NULL,
  `bio`                TEXT NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_emp_profile_employee` (`employee_id`),
  CONSTRAINT `fk_emp_profile_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
