-- Architecture ERP — Interface 5: Employee Management.
-- Applied after schema.sql, schema_projects.sql and schema_contractors.sql.
-- schema_projects.sql already created `employees` for Interface 3 (project
-- team assignment) and `projects`/`sites` hold foreign keys onto it. This file
-- only ADDS columns, indexes and one new table — it never drops, renames or
-- alters an existing column, index, row or constraint.
--
-- Portability note: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is MariaDB-only
-- syntax and a hard syntax error on MySQL 8, so every change is guarded by an
-- information_schema lookup applied through a prepared statement. Valid on
-- both engines and safe to re-run.

USE `architecture_erp`;

-- ------------------------------------------------------------------ columns

-- `employee_code`  — human-facing Employee ID (EMP-0001).
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'employee_code');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `employee_code` VARCHAR(30) NULL AFTER `id`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `address` — postal address.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'address');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `address` VARCHAR(255) NULL AFTER `phone`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `employee_type` — engagement type, distinct from `designation` (the job title).
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'employee_type');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `employee_type` VARCHAR(30) NOT NULL DEFAULT ''full-time'' AFTER `designation`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `joining_date` — date the employee joined.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'joining_date');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `joining_date` DATE NULL AFTER `employee_type`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `status` — richer lifecycle than the existing `is_active` flag, which
--            Interface 3's team pickers still read as-is.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'status');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT ''active'' AFTER `is_active`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `notes` — free-text admin notes.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'notes');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD COLUMN `notes` TEXT NULL AFTER `status`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- ------------------------------------------------------------------ indexes

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND INDEX_NAME = 'idx_employees_status');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD INDEX `idx_employees_status` (`status`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND INDEX_NAME = 'idx_employees_type');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD INDEX `idx_employees_type` (`employee_type`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- ------------------------------------------------------- employee code fill

-- Backfill codes BEFORE the unique index goes on, so existing Interface 3 rows
-- do not collide on NULL-vs-value. Only rows without a code are touched.
UPDATE `employees`
SET `employee_code` = CONCAT('EMP-', LPAD(`id`, 4, '0'))
WHERE `employee_code` IS NULL OR `employee_code` = '';

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND INDEX_NAME = 'uq_employees_code');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `employees` ADD UNIQUE INDEX `uq_employees_code` (`employee_code`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- --------------------------------------------------------------- assignments

-- Explicit posting of an employee to a project and/or one of its sites.
-- Interface 3 already records three specific team roles as columns on
-- `projects` (project_manager_id, architect_id, site_engineer_id) and one on
-- `sites` (site_engineer_id). Those stay exactly as they are and are still the
-- source of truth for team pickers; this table covers everyone else — a
-- supervisor, storekeeper or surveyor posted to a site — without widening the
-- existing tables. Employee Management reads both and merges them.
CREATE TABLE IF NOT EXISTS `employee_assignments` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` INT UNSIGNED NOT NULL,
  `project_id`  INT UNSIGNED NULL,
  `site_id`     INT UNSIGNED NULL,
  `role`        VARCHAR(80) NULL,
  `assigned_on` DATE NOT NULL,
  `end_date`    DATE NULL,
  `is_current`  TINYINT(1) NOT NULL DEFAULT 1,
  `notes`       TEXT NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_emp_assign_employee` (`employee_id`, `is_current`),
  KEY `idx_emp_assign_project` (`project_id`),
  KEY `idx_emp_assign_site` (`site_id`),
  CONSTRAINT `fk_emp_assign_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_emp_assign_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_emp_assign_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ backfill

-- Safe-to-repeat: only touches rows still holding the default, so re-running
-- is a no-op and admin edits made later are never overwritten.
UPDATE `employees` SET `status` = 'inactive' WHERE `is_active` = 0 AND `status` = 'active';
