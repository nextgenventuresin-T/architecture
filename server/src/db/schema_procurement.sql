-- Architecture ERP — Interface 7: Procurement Management.
-- Applied after schema.sql, schema_projects.sql, schema_contractors.sql,
-- schema_employees.sql and schema_materials.sql.
--
-- Procurement does NOT introduce parallel Project, Site, Material or Supplier
-- systems. It links straight into what already exists:
--   `projects`, `sites`   — Interface 3
--   `materials`           — Interface 3 / Interface 6 catalogue
--   `material_entries`    — Interface 6 stock ledger (a receipt against an
--                           ordered procurement line also lands a row here,
--                           the same way Interface 6's own "add stock" does,
--                           so current stock keeps coming from one place)
--   `users`                — Interface 1 (requested_by / received_by)
--
-- Supplier stays a plain free-text column, exactly like `material_entries`.
-- `default_supplier` on `materials` already established that pattern for this
-- project, so procurement follows it rather than introducing a dedicated
-- supplier-management table the rest of the schema doesn't have.
--
-- Two new tables only. Nothing existing is dropped, renamed, re-typed or
-- otherwise altered.
--
-- Portability: identical IF-NOT-EXISTS / information_schema-guard style used
-- by schema_materials.sql, so this file is safe to re-run.

USE `architecture_erp`;

-- ------------------------------------------------------- procurement_requests

-- One row per purchase request. It carries the request through Draft ->
-- Requested -> Pending Approval -> Approved -> Ordered, and once ordered it
-- doubles as the purchase order record (po_number, ordered_quantity,
-- order_date, expected_delivery_date) rather than duplicating supplier,
-- material, project and site into a second table.
CREATE TABLE IF NOT EXISTS `procurement_requests` (
  `id`                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_number`          VARCHAR(30)  NOT NULL,
  `project_id`              INT UNSIGNED NOT NULL,
  `site_id`                 INT UNSIGNED NULL,
  `material_id`             INT UNSIGNED NOT NULL,
  `supplier`                VARCHAR(150) NULL,
  `quantity`                DECIMAL(12,2) NOT NULL DEFAULT 0,
  `unit`                    VARCHAR(20)  NOT NULL DEFAULT '',
  `estimated_rate`          DECIMAL(12,2) NOT NULL DEFAULT 0,
  `required_date`           DATE NULL,
  -- low | medium | high | urgent
  `priority`                VARCHAR(20)  NOT NULL DEFAULT 'medium',
  `requested_by`            BIGINT UNSIGNED NULL,
  `notes`                   TEXT NULL,
  -- draft | requested | pending_approval | approved | rejected | ordered |
  -- partially_received | received | cancelled
  `status`                  VARCHAR(30)  NOT NULL DEFAULT 'draft',
  -- Purchase-order fields. Populated once the request reaches "approved" /
  -- "ordered"; NULL until then.
  `po_number`               VARCHAR(30)  NULL,
  `ordered_quantity`        DECIMAL(12,2) NULL,
  `order_date`              DATE NULL,
  `expected_delivery_date`  DATE NULL,
  `created_at`              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_procurement_request_number` (`request_number`),
  UNIQUE KEY `uq_procurement_po_number` (`po_number`),
  KEY `idx_procurement_status` (`status`),
  KEY `idx_procurement_project` (`project_id`),
  KEY `idx_procurement_site` (`site_id`),
  KEY `idx_procurement_material` (`material_id`),
  KEY `idx_procurement_supplier` (`supplier`),
  CONSTRAINT `fk_procurement_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_procurement_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_procurement_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`),
  CONSTRAINT `fk_procurement_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------- procurement_receipts

-- One row per receiving event against an ordered request. Received/remaining
-- quantity is derived by summing these rows against `ordered_quantity` rather
-- than stored on the request, the same "derive, don't cache" rule
-- schema_projects.sql set for material_entries stock.
--
-- Each receipt also lands a row in `material_entries` (material_entry_id
-- keeps the link) so stock levels keep coming from the single Interface 6
-- ledger instead of a second, competing stock calculation.
CREATE TABLE IF NOT EXISTS `procurement_receipts` (
  `id`                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `procurement_request_id`  INT UNSIGNED NOT NULL,
  `received_quantity`       DECIMAL(12,2) NOT NULL DEFAULT 0,
  `receiving_date`          DATE NOT NULL,
  `notes`                   VARCHAR(255) NULL,
  `received_by`             BIGINT UNSIGNED NULL,
  `material_entry_id`       INT UNSIGNED NULL,
  `created_at`              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_receipts_request` (`procurement_request_id`),
  CONSTRAINT `fk_receipts_request` FOREIGN KEY (`procurement_request_id`) REFERENCES `procurement_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_receipts_received_by` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_receipts_material_entry` FOREIGN KEY (`material_entry_id`) REFERENCES `material_entries` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
