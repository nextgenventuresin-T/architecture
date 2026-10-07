-- Architecture ERP — Contractor material movement lifecycle.
--
-- Applied AFTER schema_warehouse.sql, schema_warehouse_contractors.sql and
-- schema_procurement_flows.sql.
--
-- The existing warehouse ledger already moves stock atomically (the tested
-- Central -> Contractor and instant Contractor -> Contractor transfers). This
-- file does NOT replace it. It adds ONE table that records a two-phase
-- contractor-to-contractor shipment:
--
--   SEND MATERIAL  -> source stock is issued now (ledger 'issue'), a movement
--                     row is created with status 'in_transit'. Destination
--                     stock is NOT increased yet.
--   RECEIVE        -> destination stock is received now (ledger 'receipt'),
--                     the movement row flips to 'received'.
--
-- Both stock legs are performed by the existing warehouseService primitives, so
-- there is no second stock system — this table only tracks the shipment, its
-- vehicle/driver/transport details and its PO link, none of which the ledger
-- itself carries.
--
-- Portability: single CREATE TABLE IF NOT EXISTS, safe to re-run. Nothing is
-- dropped, renamed, re-typed or deleted.

USE `architecture_erp`;

CREATE TABLE IF NOT EXISTS `material_movements` (
  `id`                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `movement_number`        VARCHAR(30) NOT NULL,
  `material_id`            INT UNSIGNED NOT NULL,
  `unit`                   VARCHAR(20) NOT NULL DEFAULT '',
  `source_warehouse_id`    INT UNSIGNED NOT NULL,
  `destination_warehouse_id` INT UNSIGNED NOT NULL,
  `source_contractor_id`   INT UNSIGNED NULL,
  `destination_contractor_id` INT UNSIGNED NULL,
  `project_id`             INT UNSIGNED NULL,
  `site_id`                INT UNSIGNED NULL,
  -- requested_quantity: what the destination asked for (PO); may differ from
  -- what the source actually sent. Both stay traceable.
  `requested_quantity`     DECIMAL(12,2) NULL,
  `sent_quantity`          DECIMAL(12,2) NOT NULL,
  `received_quantity`      DECIMAL(12,2) NULL,
  -- in_transit | received | completed | cancelled
  `status`                 VARCHAR(20) NOT NULL DEFAULT 'in_transit',
  `vehicle_number`         VARCHAR(40) NULL,
  `driver_name`            VARCHAR(120) NULL,
  `driver_phone`           VARCHAR(40) NULL,
  `transport_cost`         DECIMAL(12,2) NOT NULL DEFAULT 0,
  `other_expenses`         DECIMAL(12,2) NOT NULL DEFAULT 0,
  `reference`              VARCHAR(60) NULL,
  `remarks`                VARCHAR(255) NULL,
  `procurement_request_id` INT UNSIGNED NULL,
  `issue_transaction_id`   INT UNSIGNED NULL,
  `receive_transaction_id` INT UNSIGNED NULL,
  `sent_by`                BIGINT UNSIGNED NULL,
  `sent_at`                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `received_by`            BIGINT UNSIGNED NULL,
  `received_at`            DATETIME NULL,
  `created_at`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_movement_number` (`movement_number`),
  KEY `idx_mm_status` (`status`),
  KEY `idx_mm_source_wh` (`source_warehouse_id`),
  KEY `idx_mm_dest_wh` (`destination_warehouse_id`),
  KEY `idx_mm_src_contractor` (`source_contractor_id`),
  KEY `idx_mm_dest_contractor` (`destination_contractor_id`),
  KEY `idx_mm_material` (`material_id`),
  CONSTRAINT `fk_mm_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`),
  CONSTRAINT `fk_mm_source_wh` FOREIGN KEY (`source_warehouse_id`) REFERENCES `warehouses` (`id`),
  CONSTRAINT `fk_mm_dest_wh` FOREIGN KEY (`destination_warehouse_id`) REFERENCES `warehouses` (`id`),
  CONSTRAINT `fk_mm_src_contractor` FOREIGN KEY (`source_contractor_id`) REFERENCES `contractors` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mm_dest_contractor` FOREIGN KEY (`destination_contractor_id`) REFERENCES `contractors` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mm_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mm_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mm_procurement` FOREIGN KEY (`procurement_request_id`) REFERENCES `procurement_requests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mm_issue_tx` FOREIGN KEY (`issue_transaction_id`) REFERENCES `warehouse_transactions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mm_receive_tx` FOREIGN KEY (`receive_transaction_id`) REFERENCES `warehouse_transactions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
