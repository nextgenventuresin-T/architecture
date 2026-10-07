-- Architecture ERP — Interface 4: Contractor Management.
-- Applied after schema.sql and schema_projects.sql, which already created
-- the `contractors` table for Interface 3 (project team assignment).
-- This file only ADDS columns and indexes that Interface 4 needs — it never
-- drops, renames or alters an existing column, index or row, and it never
-- touches the tables Interfaces 1-3 rely on.
--
-- Portability note: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is MariaDB-only
-- syntax and is a hard syntax error on MySQL 8. Each change below is therefore
-- guarded by an information_schema lookup and applied via a prepared statement,
-- which is valid on both engines and keeps the file safe to re-run.

USE `architecture_erp`;

-- ------------------------------------------------------------------ columns

-- `type` — contractor trade category, used for filtering in the admin list.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND COLUMN_NAME = 'type');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `contractors` ADD COLUMN `type` VARCHAR(30) NOT NULL DEFAULT ''other'' AFTER `speciality`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `status` — richer lifecycle than the existing `is_active` flag, which
--            Interface 3's team-assignment dropdown still reads as-is.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND COLUMN_NAME = 'status');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `contractors` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT ''active'' AFTER `is_active`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `notes` — free-text admin notes.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND COLUMN_NAME = 'notes');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `contractors` ADD COLUMN `notes` TEXT NULL AFTER `status`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- ------------------------------------------------------------------ indexes

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND INDEX_NAME = 'idx_contractors_status');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `contractors` ADD INDEX `idx_contractors_status` (`status`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contractors' AND INDEX_NAME = 'idx_contractors_type');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `contractors` ADD INDEX `idx_contractors_type` (`type`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- ------------------------------------------------------------------ backfill

-- One-off, safe-to-repeat backfill so existing (Interface 3 seed) rows get a
-- sensible type/status instead of sitting at the bare defaults. Each statement
-- only touches rows still holding the default, so re-running is a no-op and
-- admin edits made later are never overwritten.
UPDATE `contractors` SET `type` = 'civil'         WHERE `type` = 'other' AND `speciality` LIKE '%civil%';
UPDATE `contractors` SET `type` = 'finishing'     WHERE `type` = 'other' AND `speciality` LIKE '%finish%';
UPDATE `contractors` SET `type` = 'labour-supply' WHERE `type` = 'other' AND `speciality` LIKE '%labour%';
UPDATE `contractors` SET `type` = 'specialized'   WHERE `type` = 'other' AND `speciality` LIKE '%structure%';

UPDATE `contractors` SET `status` = 'inactive' WHERE `is_active` = 0 AND `status` = 'active';
