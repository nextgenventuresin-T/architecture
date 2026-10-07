-- Architecture ERP — Warehouse ownership (Central vs Contractor).
--
-- Applied AFTER schema_warehouse.sql. It does NOT introduce a second stock
-- system: warehouse_stock and warehouse_transactions stay exactly as they are.
-- The only thing missing to represent "Central Company Warehouse" vs each
-- "Contractor Warehouse" was a way to say which warehouse belongs to whom, so
-- this file only ADDS two columns to `warehouses` and provisions one warehouse
-- row per contractor. A Central -> Contractor issue and a Contractor ->
-- Contractor transfer are then just ordinary `transfer` rows in the existing
-- ledger (warehouse_id = source, destination_warehouse_id = target), which is
-- already atomic and already finance-free.
--
-- Portability: same information_schema-guarded prepared-statement style as
-- schema_contractors.sql (ADD COLUMN IF NOT EXISTS is MariaDB-only and a hard
-- error on MySQL 8). Safe to re-run — nothing is dropped, renamed or reset.

USE `architecture_erp`;

-- ------------------------------------------------------------------ columns

-- `type` — 'central' (the company's own warehouse) or 'contractor'. Existing
-- rows default to 'central', so the warehouse seeded by schema_warehouse.sql
-- becomes the Central Company Warehouse with no data change.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouses' AND COLUMN_NAME = 'type');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `warehouses` ADD COLUMN `type` VARCHAR(20) NOT NULL DEFAULT ''central'' AFTER `status`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `contractor_id` — set only on a contractor warehouse; NULL for central.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouses' AND COLUMN_NAME = 'contractor_id');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `warehouses` ADD COLUMN `contractor_id` INT UNSIGNED NULL AFTER `type`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ------------------------------------------------------------------ indexes

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouses' AND INDEX_NAME = 'idx_warehouses_type');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `warehouses` ADD INDEX `idx_warehouses_type` (`type`)',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouses' AND INDEX_NAME = 'idx_warehouses_contractor');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `warehouses` ADD INDEX `idx_warehouses_contractor` (`contractor_id`)',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Foreign key (guarded). ON DELETE SET NULL keeps a contractor's historical
-- stock/movements intact if the contractor record is ever removed.
SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'warehouses'
    AND CONSTRAINT_NAME = 'fk_warehouses_contractor');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `warehouses` ADD CONSTRAINT `fk_warehouses_contractor` FOREIGN KEY (`contractor_id`) REFERENCES `contractors` (`id`) ON DELETE SET NULL',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ------------------------------------------------------------------ backfill

-- Any warehouse already tied to a contractor is a contractor warehouse.
UPDATE `warehouses` SET `type` = 'contractor'
WHERE `contractor_id` IS NOT NULL AND `type` <> 'contractor';

-- Provision one warehouse per contractor that does not already have one. The
-- WHERE NOT EXISTS guard makes this safe to re-run and means new contractors
-- picked up on a later migration get their warehouse without duplicating any.
-- Location is NOT NULL, so fall back to a placeholder when the contractor has
-- no address on file.
INSERT INTO `warehouses` (`code`, `name`, `location`, `description`, `status`, `type`, `contractor_id`)
SELECT CONCAT('WH-C', LPAD(c.`id`, 3, '0')),
       CONCAT(c.`name`, ' Warehouse'),
       COALESCE(NULLIF(TRIM(c.`address`), ''), 'Contractor site'),
       'Contractor-held stock',
       'active',
       'contractor',
       c.`id`
FROM `contractors` c
WHERE NOT EXISTS (SELECT 1 FROM `warehouses` w WHERE w.`contractor_id` = c.`id`);
