-- Architecture ERP — Procurement flows (destination/source + warehouse link).
--
-- Applied AFTER schema_procurement.sql and schema_warehouse_contractors.sql.
-- It does NOT create a second procurement table or a second stock system. It
-- only ADDS columns to `procurement_requests` so one request can describe:
--   * where the material is going  (a project/site, the central warehouse, or
--     a contractor warehouse), and
--   * where it comes from          (an outside supplier, the central warehouse,
--     another contractor, or another site),
-- and can hold the single warehouse-ledger movement that fulfils it, plus the
-- purchase/bill details Finance reads for external purchases.
--
-- The one genuinely-required change to an existing column: `project_id` is made
-- NULLABLE, because a central-warehouse purchase legitimately has no project.
-- Existing rows keep their project_id and are backfilled to the 'project_site'
-- kind, so nothing that already works changes behaviour.
--
-- Portability: information_schema-guarded prepared statements (MariaDB + MySQL 8),
-- safe to re-run. Nothing is dropped, renamed, re-typed or deleted.

USE `architecture_erp`;

-- --------------------------------------------------- project_id -> NULLABLE

SET @nn := (SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'procurement_requests' AND COLUMN_NAME = 'project_id');
SET @stmt := IF(@nn = 'NO',
  'ALTER TABLE `procurement_requests` MODIFY COLUMN `project_id` INT UNSIGNED NULL',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- --------------------------------------------------- new columns (guarded)

-- helper pattern repeated per column: add only when missing.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='procurement_kind');
SET @stmt := IF(@exists=0, "ALTER TABLE `procurement_requests` ADD COLUMN `procurement_kind` VARCHAR(30) NOT NULL DEFAULT 'project_site' AFTER `status`", 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='source_type');
SET @stmt := IF(@exists=0, "ALTER TABLE `procurement_requests` ADD COLUMN `source_type` VARCHAR(30) NULL AFTER `procurement_kind`", 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='destination_type');
SET @stmt := IF(@exists=0, "ALTER TABLE `procurement_requests` ADD COLUMN `destination_type` VARCHAR(30) NULL AFTER `source_type`", 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='source_warehouse_id');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `source_warehouse_id` INT UNSIGNED NULL AFTER `destination_type`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='destination_warehouse_id');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `destination_warehouse_id` INT UNSIGNED NULL AFTER `source_warehouse_id`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='source_contractor_id');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `source_contractor_id` INT UNSIGNED NULL AFTER `destination_warehouse_id`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='destination_contractor_id');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `destination_contractor_id` INT UNSIGNED NULL AFTER `source_contractor_id`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='source_site_id');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `source_site_id` INT UNSIGNED NULL AFTER `destination_contractor_id`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='destination_site_id');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `destination_site_id` INT UNSIGNED NULL AFTER `source_site_id`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='supplier_contact');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `supplier_contact` VARCHAR(150) NULL AFTER `supplier`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='purchase_rate');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `purchase_rate` DECIMAL(12,2) NULL AFTER `estimated_rate`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='total_amount');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `total_amount` DECIMAL(14,2) NULL AFTER `purchase_rate`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='purchase_date');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `purchase_date` DATE NULL AFTER `total_amount`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='bill_reference');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `bill_reference` VARCHAR(255) NULL AFTER `purchase_date`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='reason');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `reason` VARCHAR(255) NULL AFTER `notes`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='warehouse_transaction_id');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `warehouse_transaction_id` INT UNSIGNED NULL AFTER `bill_reference`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND COLUMN_NAME='fulfilled_at');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD COLUMN `fulfilled_at` DATETIME NULL AFTER `warehouse_transaction_id`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- --------------------------------------------------- indexes (guarded)

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND INDEX_NAME='idx_proc_kind');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD INDEX `idx_proc_kind` (`procurement_kind`)', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND INDEX_NAME='idx_proc_dest_contractor');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD INDEX `idx_proc_dest_contractor` (`destination_contractor_id`)', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND INDEX_NAME='idx_proc_src_contractor');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD INDEX `idx_proc_src_contractor` (`source_contractor_id`)', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- --------------------------------------------------- foreign keys (guarded)

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND CONSTRAINT_NAME='fk_proc_dest_warehouse');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD CONSTRAINT `fk_proc_dest_warehouse` FOREIGN KEY (`destination_warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE SET NULL', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND CONSTRAINT_NAME='fk_proc_src_warehouse');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD CONSTRAINT `fk_proc_src_warehouse` FOREIGN KEY (`source_warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE SET NULL', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND CONSTRAINT_NAME='fk_proc_dest_contractor');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD CONSTRAINT `fk_proc_dest_contractor` FOREIGN KEY (`destination_contractor_id`) REFERENCES `contractors` (`id`) ON DELETE SET NULL', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND CONSTRAINT_NAME='fk_proc_src_contractor');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD CONSTRAINT `fk_proc_src_contractor` FOREIGN KEY (`source_contractor_id`) REFERENCES `contractors` (`id`) ON DELETE SET NULL', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='procurement_requests' AND CONSTRAINT_NAME='fk_proc_wtx');
SET @stmt := IF(@exists=0, 'ALTER TABLE `procurement_requests` ADD CONSTRAINT `fk_proc_wtx` FOREIGN KEY (`warehouse_transaction_id`) REFERENCES `warehouse_transactions` (`id`) ON DELETE SET NULL', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- --------------------------------------------------- backfill existing rows

-- Everything already on file is a project/site request going to a project/site.
UPDATE `procurement_requests`
SET `procurement_kind` = 'project_site',
    `destination_type` = 'project_site',
    `source_type` = COALESCE(`source_type`, 'supplier')
WHERE `procurement_kind` = 'project_site' AND `destination_type` IS NULL;
