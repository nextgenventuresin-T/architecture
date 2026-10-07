-- Architecture ERP: Contractor Documents, POs, Milestones & Contracts Schema
-- Idempotent migration for Contractor Enhancements

USE `architecture_erp`;

-- ---------------------------------------------------------------------------
-- 1. Contractor Documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `contractor_documents` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `contractor_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `document_type` VARCHAR(50) NOT NULL DEFAULT 'other',
  `file_path` VARCHAR(255) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_size` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `file_type` VARCHAR(100) NULL,
  `uploaded_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cd_contractor` (`contractor_id`),
  KEY `idx_cd_type` (`document_type`),
  CONSTRAINT `fk_cd_contractor` FOREIGN KEY (`contractor_id`) REFERENCES `contractors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cd_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Contractor Purchase / Work Orders (contractor_pos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `contractor_pos` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `po_number` VARCHAR(30) NOT NULL,
  `contractor_id` INT UNSIGNED NOT NULL,
  `project_id` INT UNSIGNED NOT NULL,
  `site_id` INT UNSIGNED NULL,
  `po_date` DATE NOT NULL,
  `validity_date` DATE NULL,
  `work_description` TEXT NULL,
  `total_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `advance_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `material_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `labour_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `payment_terms` TEXT NULL,
  `terms_conditions` MEDIUMTEXT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'draft',
  `rejection_reason` TEXT NULL,
  `pdf_path` VARCHAR(255) NULL,
  `signed_pdf_path` VARCHAR(255) NULL,
  `contractor_signature_path` VARCHAR(255) NULL,
  `contractor_signed_name` VARCHAR(150) NULL,
  `contractor_signed_at` DATETIME NULL,
  `company_signature_path` VARCHAR(255) NULL,
  `company_signed_name` VARCHAR(150) NULL,
  `company_signed_designation` VARCHAR(100) NULL,
  `company_signed_at` DATETIME NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cpo_number` (`po_number`),
  KEY `idx_cpo_contractor` (`contractor_id`),
  KEY `idx_cpo_project` (`project_id`),
  KEY `idx_cpo_site` (`site_id`),
  KEY `idx_cpo_status` (`status`),
  CONSTRAINT `fk_cpo_contractor` FOREIGN KEY (`contractor_id`) REFERENCES `contractors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cpo_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cpo_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cpo_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. Contractor PO Milestones (contractor_po_milestones)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `contractor_po_milestones` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `po_id` INT UNSIGNED NOT NULL,
  `milestone_name` VARCHAR(255) NOT NULL,
  `percentage` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `condition_trigger` VARCHAR(255) NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `completed_at` DATETIME NULL,
  `remarks` TEXT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cpom_po` (`po_id`),
  KEY `idx_cpom_status` (`status`),
  CONSTRAINT `fk_cpom_po` FOREIGN KEY (`po_id`) REFERENCES `contractor_pos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
