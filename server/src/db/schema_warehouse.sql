-- Architecture ERP — Interface 8: Warehouse / Inventory Management.
-- Applied after schema.sql, schema_projects.sql, schema_contractors.sql,
-- schema_employees.sql, schema_materials.sql and schema_procurement.sql.
--
-- Warehouse does NOT introduce a parallel Material, Project, Site or User
-- system. It links straight into what already exists:
--   `materials`            — Interface 3 / Interface 6 catalogue. Name, code,
--                            category, unit and min_stock all keep coming from
--                            there; nothing is copied into this interface.
--   `projects`, `sites`    — Interface 3.
--   `procurement_receipts` — Interface 7 receiving events.
--   `users`                — Interface 1 (performed_by).
--
-- ---------------------------------------------------------------------------
-- WHY THIS DOES NOT DOUBLE-COUNT PROCUREMENT
-- ---------------------------------------------------------------------------
-- Interface 7's receive() already writes a row into `material_entries`, and
-- Interface 6 derives every stock figure by SUMming that table. If Interface 8
-- also wrote into `material_entries`, Interface 6's numbers would double.
--
-- So the two ledgers are kept deliberately distinct and answer different
-- questions:
--
--   material_entries    — "how much has been DELIVERED to this project/site?"
--                         (Interface 6, untouched by this interface)
--   warehouse_stock     — "how much is PHYSICALLY HELD in this warehouse
--                          right now?" (Interface 8)
--
-- A procurement receipt is pulled into a warehouse through an explicit action.
-- `warehouse_transactions.procurement_receipt_id` records the link and carries
-- a UNIQUE index, so the same procurement receipt can never be posted to
-- warehouse stock twice — the database refuses it, not just the application
-- code. That is the "clear reference between Procurement receiving and
-- Warehouse transaction" the interface calls for.
--
-- ---------------------------------------------------------------------------
-- BALANCE vs LEDGER
-- ---------------------------------------------------------------------------
-- `warehouse_transactions` is the source of truth: it is an append-only ledger
-- of every movement. `warehouse_stock` is the running balance kept alongside
-- it so stock screens do not have to re-sum the whole ledger on every request.
--
-- Both are always written inside ONE database transaction, so they cannot
-- drift apart.
--
-- A UNIQUE KEY cannot enforce one-row-per-slot here, because project_id and
-- site_id are NULLable and both engines treat every NULL as distinct — a
-- plain UNIQUE KEY would happily allow unlimited duplicate "unassigned" rows.
-- Stored generated columns (COALESCE(project_id, 0)) would solve that, but
-- MariaDB refuses to build one over a column carrying an ON DELETE SET NULL
-- foreign key, and changing those FKs to RESTRICT would stop Interface 3 from
-- deleting a site that ever held stock.
--
-- So uniqueness is enforced in the service layer instead: every stock-changing
-- operation opens a transaction and takes a row lock on the `warehouses` row
-- first (SELECT ... FOR UPDATE). That serialises all movements for a given
-- warehouse, which makes the read-then-insert-or-update sequence safe without
-- constraining how projects and sites may be deleted.
--
-- Portability: same IF-NOT-EXISTS / information_schema-guard style used by
-- schema_materials.sql and schema_procurement.sql. Safe to re-run. Nothing
-- existing is dropped, renamed, re-typed or truncated.

USE `architecture_erp`;

-- ----------------------------------------------------------------- warehouses

CREATE TABLE IF NOT EXISTS `warehouses` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(30)  NOT NULL,
  `name`        VARCHAR(150) NOT NULL,
  `location`    VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  -- active | inactive
  `status`      VARCHAR(20)  NOT NULL DEFAULT 'active',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_warehouses_code` (`code`),
  KEY `idx_warehouses_status` (`status`),
  KEY `idx_warehouses_location` (`location`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------- warehouse_stock

-- Running balance, one row per (warehouse, material, project, site) slot.
-- project_id / site_id are NULL when stock is held generally rather than
-- earmarked for a particular job, which is why the generated *_key columns
-- exist (see the note at the top of this file).
CREATE TABLE IF NOT EXISTS `warehouse_stock` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `warehouse_id` INT UNSIGNED NOT NULL,
  `material_id`  INT UNSIGNED NOT NULL,
  `project_id`   INT UNSIGNED NULL,
  `site_id`      INT UNSIGNED NULL,
  `quantity`     DECIMAL(14,2) NOT NULL DEFAULT 0,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wstock_slot` (`warehouse_id`, `material_id`, `project_id`, `site_id`),
  KEY `idx_wstock_material` (`material_id`),
  KEY `idx_wstock_project` (`project_id`),
  KEY `idx_wstock_site` (`site_id`),
  CONSTRAINT `fk_wstock_warehouse` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wstock_material`  FOREIGN KEY (`material_id`)  REFERENCES `materials` (`id`),
  CONSTRAINT `fk_wstock_project`   FOREIGN KEY (`project_id`)   REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wstock_site`      FOREIGN KEY (`site_id`)      REFERENCES `sites` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------- warehouse_transactions

-- Append-only movement ledger. Every receipt, issue, transfer and adjustment
-- lands exactly one row here, written in the same transaction as the balance
-- update above.
--
-- A transfer is a SINGLE row: warehouse_id is the source, destination_warehouse_id
-- the target. Recording it once keeps the history honest — one movement, one
-- entry — rather than showing an unexplained issue next to an unexplained
-- receipt.
CREATE TABLE IF NOT EXISTS `warehouse_transactions` (
  `id`                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `transaction_number`       VARCHAR(30) NOT NULL,
  -- receipt | issue | transfer | adjustment
  `transaction_type`         VARCHAR(20) NOT NULL,
  `material_id`              INT UNSIGNED NOT NULL,
  -- Source warehouse for issue/transfer, target for receipt/adjustment.
  `warehouse_id`             INT UNSIGNED NOT NULL,
  -- Only set on a transfer.
  `destination_warehouse_id` INT UNSIGNED NULL,
  `project_id`               INT UNSIGNED NULL,
  `site_id`                  INT UNSIGNED NULL,
  `quantity`                 DECIMAL(12,2) NOT NULL,
  `unit`                     VARCHAR(20) NOT NULL DEFAULT '',
  -- increase | decrease. Only set on an adjustment.
  `adjustment_type`          VARCHAR(20) NULL,
  `reason`                   VARCHAR(255) NULL,
  `reference`                VARCHAR(150) NULL,
  -- Link back to Interface 7. UNIQUE, so one procurement receipt can only ever
  -- be brought into warehouse stock once.
  `procurement_receipt_id`   INT UNSIGNED NULL,
  `procurement_request_id`   INT UNSIGNED NULL,
  `transaction_date`         DATE NOT NULL,
  `performed_by`             BIGINT UNSIGNED NULL,
  `notes`                    TEXT NULL,
  `created_at`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wtx_number` (`transaction_number`),
  UNIQUE KEY `uq_wtx_procurement_receipt` (`procurement_receipt_id`),
  KEY `idx_wtx_type` (`transaction_type`),
  KEY `idx_wtx_material` (`material_id`),
  KEY `idx_wtx_warehouse` (`warehouse_id`),
  KEY `idx_wtx_destination` (`destination_warehouse_id`),
  KEY `idx_wtx_project` (`project_id`),
  KEY `idx_wtx_site` (`site_id`),
  KEY `idx_wtx_date` (`transaction_date`),
  CONSTRAINT `fk_wtx_warehouse`   FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wtx_destination` FOREIGN KEY (`destination_warehouse_id`) REFERENCES `warehouses` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wtx_material`    FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`),
  CONSTRAINT `fk_wtx_project`     FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wtx_site`        FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wtx_receipt`     FOREIGN KEY (`procurement_receipt_id`) REFERENCES `procurement_receipts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wtx_request`     FOREIGN KEY (`procurement_request_id`) REFERENCES `procurement_requests` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wtx_user`        FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------- seeding

-- A single default warehouse so the module is usable on a fresh install and
-- procurement receipts have somewhere to land. INSERT ... SELECT WHERE NOT
-- EXISTS rather than a plain INSERT, so re-running never creates a second one
-- and never overwrites an admin's edits to this row.
INSERT INTO `warehouses` (`code`, `name`, `location`, `description`, `status`)
SELECT 'WH-001', 'Main Store', 'Patiala', 'Central material store', 'active'
WHERE NOT EXISTS (SELECT 1 FROM `warehouses`);
