-- Architecture ERP — Interface 6: Materials Management.
-- Applied after schema.sql, schema_projects.sql, schema_contractors.sql and
-- schema_employees.sql.
--
-- schema_projects.sql already created BOTH tables this interface needs:
--   `materials`        — a global catalogue (unique name, category, unit),
--                        seeded with 15 standard construction materials.
--   `material_entries` — one row per delivery to a project/site, carrying
--                        quantity, used_quantity, rate, supplier and date.
--
-- So Interface 6 extends those rather than introducing a parallel stock
-- system. Two deliberate choices follow from the existing design:
--
--  1. Current stock is NEVER stored. schema_projects.sql states that remaining
--     quantity is derived (quantity - used_quantity) "so it cannot drift", and
--     Interface 3's project/site screens already rely on that. Interface 6
--     keeps deriving it by summing material_entries.
--  2. `materials` stays a global catalogue with a unique name, so project and
--     site association is derived from material_entries too. Adding
--     project_id to `materials` would break the unique-name constraint the
--     moment the same material was stocked on two projects.
--
-- Columns added here are catalogue-level only: an identifying code, a reorder
-- point, default supplier/rate used to prefill new stock entries, plus status
-- and notes. Nothing is dropped, renamed or re-typed, and no existing row,
-- index or foreign key is altered.
--
-- Portability note: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is MariaDB-only
-- syntax and a hard syntax error on MySQL 8, so every change is guarded by an
-- information_schema lookup applied through a prepared statement. Valid on
-- both engines and safe to re-run.

USE `architecture_erp`;

-- ------------------------------------------------------------------ columns

-- `code` — human-facing material code (MAT-0001).
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials' AND COLUMN_NAME = 'code');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `materials` ADD COLUMN `code` VARCHAR(30) NULL AFTER `id`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `min_stock` — reorder point. Stock at or below this flags the material low.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials' AND COLUMN_NAME = 'min_stock');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `materials` ADD COLUMN `min_stock` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `unit`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `default_supplier` — prefills the supplier on a new stock entry. The actual
--                      supplier per delivery still lives on material_entries.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials' AND COLUMN_NAME = 'default_supplier');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `materials` ADD COLUMN `default_supplier` VARCHAR(150) NULL AFTER `min_stock`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `default_rate` — prefills the purchase rate on a new stock entry.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials' AND COLUMN_NAME = 'default_rate');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `materials` ADD COLUMN `default_rate` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `default_supplier`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `status` — active | inactive | discontinued.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials' AND COLUMN_NAME = 'status');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `materials` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT ''active'' AFTER `default_rate`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `notes` — free-text admin notes.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials' AND COLUMN_NAME = 'notes');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `materials` ADD COLUMN `notes` TEXT NULL AFTER `status`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- `created_at` — `materials` predates this interface and has no timestamp.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials' AND COLUMN_NAME = 'created_at');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `materials` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `notes`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- ------------------------------------------------------------------ indexes

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials' AND INDEX_NAME = 'idx_materials_category');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `materials` ADD INDEX `idx_materials_category` (`category`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials' AND INDEX_NAME = 'idx_materials_status');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `materials` ADD INDEX `idx_materials_status` (`status`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- ------------------------------------------------------------- code backfill

-- Backfill BEFORE the unique index goes on, so the 15 catalogue rows seeded by
-- schema_projects.sql all get a code. Only rows without one are touched.
UPDATE `materials`
SET `code` = CONCAT('MAT-', LPAD(`id`, 4, '0'))
WHERE `code` IS NULL OR `code` = '';

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materials' AND INDEX_NAME = 'uq_materials_code');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `materials` ADD UNIQUE INDEX `uq_materials_code` (`code`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- ------------------------------------------------------- material_entries

-- Stock entries recorded from Interface 6 carry a note and a usage date; the
-- Interface 3 columns are untouched.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_entries' AND COLUMN_NAME = 'notes');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `material_entries` ADD COLUMN `notes` VARCHAR(255) NULL AFTER `received_date`',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_entries' AND INDEX_NAME = 'idx_material_entries_material');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `material_entries` ADD INDEX `idx_material_entries_material` (`material_id`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'material_entries' AND INDEX_NAME = 'idx_material_entries_site');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `material_entries` ADD INDEX `idx_material_entries_site` (`site_id`)',
  'DO 0');
PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;

-- ------------------------------------------------------------------ backfill

-- Give the seeded catalogue sensible reorder points and default rates so the
-- low-stock indicator is meaningful on a fresh install. Only rows still at the
-- zero default are touched, so admin edits are never overwritten and re-runs
-- are a no-op.
UPDATE `materials` SET `min_stock` = 200,  `default_rate` = 420    WHERE `min_stock` = 0 AND `unit` = 'bags';
UPDATE `materials` SET `min_stock` = 20,   `default_rate` = 1800   WHERE `min_stock` = 0 AND `unit` = 'cu.m';
UPDATE `materials` SET `min_stock` = 10,   `default_rate` = 62000  WHERE `min_stock` = 0 AND `unit` = 'tonnes';
UPDATE `materials` SET `min_stock` = 5,    `default_rate` = 7500   WHERE `min_stock` = 0 AND `unit` = 'thousand';
UPDATE `materials` SET `min_stock` = 100,  `default_rate` = 85     WHERE `min_stock` = 0 AND `unit` = 'sq.m';
UPDATE `materials` SET `min_stock` = 50,   `default_rate` = 320    WHERE `min_stock` = 0 AND `unit` = 'litres';
UPDATE `materials` SET `min_stock` = 25,   `default_rate` = 2400   WHERE `min_stock` = 0 AND `unit` = 'sets';
UPDATE `materials` SET `min_stock` = 40,   `default_rate` = 1600   WHERE `min_stock` = 0 AND `unit` = 'cu.ft';
