-- Architecture ERP — Phase Budgeting, Tools, Contractor Daily Progress & Site Warehouse Schema
USE `architecture_erp`;

-- clients extensions
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'notes');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `notes` TEXT NULL AFTER `address`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'updated_at');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `clients` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- tools master
CREATE TABLE IF NOT EXISTS `tools` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(30)  NOT NULL,
  `name`        VARCHAR(150) NOT NULL,
  `type`        VARCHAR(80)  NOT NULL DEFAULT 'Equipment',
  `description` TEXT NULL,
  `status`      VARCHAR(20)  NOT NULL DEFAULT 'active',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tools_code` (`code`),
  UNIQUE KEY `uq_tools_name` (`name`),
  KEY `idx_tools_status` (`status`),
  KEY `idx_tools_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `tools` (`code`, `name`, `type`, `description`, `status`) VALUES
  ('TOOL-0001', 'Tower Crane', 'Heavy Machinery', 'High-capacity vertical tower crane for lifting materials', 'active'),
  ('TOOL-0002', 'Excavator (JCB)', 'Heavy Machinery', 'Hydraulic excavator for earthmoving and site clearing', 'active'),
  ('TOOL-0003', 'Concrete Mixer Machine', 'Heavy Machinery', 'Batching and continuous drum concrete mixer', 'active'),
  ('TOOL-0004', 'Concrete Needle Vibrator', 'Power Tool', 'High-frequency concrete compaction vibrator', 'active'),
  ('TOOL-0005', 'Bar Bending Machine', 'Power Tool', 'Electric rebar bending and cutting unit', 'active'),
  ('TOOL-0006', 'Scaffolding Pipe & Coupler Set', 'Safety & Scaffolding', 'Modular MS scaffolding set with walkways', 'active'),
  ('TOOL-0007', 'Total Station / Theodolite', 'Measuring Equipment', 'Electronic optical instrument for surveying and levelling', 'active'),
  ('TOOL-0008', 'Diesel Generator Set (62.5 kVA)', 'Power Tool', 'Continuous site power generation unit', 'active'),
  ('TOOL-0009', 'Submersible De-watering Pump', 'Power Tool', 'High-discharge drainage and de-watering pump', 'active'),
  ('TOOL-0010', 'Plate Compactor', 'Power Tool', 'Vibratory plate compactor for soil and sub-base', 'active'),
  ('TOOL-0011', 'Trolley / Hand Cart', 'Hand Tool', 'Manual two-wheel heavy material trolley', 'active'),
  ('TOOL-0012', 'Welding Inverter Machine', 'Power Tool', 'Portable arc welding set with accessories', 'active')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `type` = VALUES(`type`);

-- project_documents extensions
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_documents' AND COLUMN_NAME = 'site_id');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `project_documents` ADD COLUMN `site_id` INT UNSIGNED NULL AFTER `project_id`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_documents' AND COLUMN_NAME = 'file_name');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `project_documents` ADD COLUMN `file_name` VARCHAR(255) NULL AFTER `file_path`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_documents' AND COLUMN_NAME = 'file_type');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `project_documents` ADD COLUMN `file_type` VARCHAR(100) NULL AFTER `file_name`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_documents' AND COLUMN_NAME = 'file_size');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `project_documents` ADD COLUMN `file_size` INT UNSIGNED NULL AFTER `file_type`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project_documents' AND COLUMN_NAME = 'created_at');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `project_documents` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `uploaded_on`', 'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- project_phases
CREATE TABLE IF NOT EXISTS `project_phases` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`      INT UNSIGNED NOT NULL,
  `phase_number`    TINYINT UNSIGNED NOT NULL,
  `phase_title`     VARCHAR(180) NOT NULL,
  `duration_months` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `material_cost`   DECIMAL(15,2) NOT NULL DEFAULT 0,
  `tool_cost`       DECIMAL(15,2) NOT NULL DEFAULT 0,
  `labour_cost`     DECIMAL(15,2) NOT NULL DEFAULT 0,
  `misc_cost`       DECIMAL(15,2) NOT NULL DEFAULT 0,
  `total_cost`      DECIMAL(15,2) NOT NULL DEFAULT 0,
  `progress`        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `status`          VARCHAR(30) NOT NULL DEFAULT 'on-track',
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_proj_phase_num` (`project_id`, `phase_number`),
  KEY `idx_phase_proj` (`project_id`),
  CONSTRAINT `fk_phase_proj` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- project_phase_materials
CREATE TABLE IF NOT EXISTS `project_phase_materials` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `phase_id`      INT UNSIGNED NOT NULL,
  `project_id`    INT UNSIGNED NOT NULL,
  `material_id`   INT UNSIGNED NOT NULL,
  `quantity`      DECIMAL(12,2) NOT NULL DEFAULT 0,
  `cost_per_unit` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total_cost`    DECIMAL(15,2) NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ppm_phase` (`phase_id`),
  KEY `idx_ppm_proj` (`project_id`),
  KEY `idx_ppm_mat` (`material_id`),
  CONSTRAINT `fk_ppm_phase` FOREIGN KEY (`phase_id`) REFERENCES `project_phases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ppm_proj` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ppm_mat` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `project_phase_tools` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `phase_id`    INT UNSIGNED NOT NULL,
  `project_id`  INT UNSIGNED NOT NULL,
  `tool_id`     INT UNSIGNED NULL,
  `tool_name`   VARCHAR(180) NOT NULL,
  `rental_type` VARCHAR(40) NOT NULL DEFAULT 'Rent',
  `quantity`    DECIMAL(12,2) NOT NULL DEFAULT 1,
  `cost`        DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total_cost`  DECIMAL(15,2) NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ppt_phase` (`phase_id`),
  KEY `idx_ppt_proj` (`project_id`),
  KEY `idx_ppt_tool` (`tool_id`),
  CONSTRAINT `fk_ppt_phase` FOREIGN KEY (`phase_id`) REFERENCES `project_phases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ppt_proj` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ppt_tool` FOREIGN KEY (`tool_id`) REFERENCES `tools` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `project_phase_labour` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `phase_id`    INT UNSIGNED NOT NULL,
  `project_id`  INT UNSIGNED NOT NULL,
  `labour_type` VARCHAR(40) NOT NULL DEFAULT 'In-House',
  `quantity`    DECIMAL(12,2) NOT NULL DEFAULT 1,
  `cost`        DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total_cost`  DECIMAL(15,2) NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ppl_phase` (`phase_id`),
  KEY `idx_ppl_proj` (`project_id`),
  CONSTRAINT `fk_ppl_phase` FOREIGN KEY (`phase_id`) REFERENCES `project_phases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ppl_proj` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `project_phase_misc` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `phase_id`    INT UNSIGNED NOT NULL,
  `project_id`  INT UNSIGNED NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `amount`      DECIMAL(15,2) NOT NULL DEFAULT 0,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ppmisc_phase` (`phase_id`),
  KEY `idx_ppmisc_proj` (`project_id`),
  CONSTRAINT `fk_ppmisc_phase` FOREIGN KEY (`phase_id`) REFERENCES `project_phases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ppmisc_proj` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- daily_work_updates
CREATE TABLE IF NOT EXISTS `daily_work_updates` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`          INT UNSIGNED NOT NULL,
  `site_id`             INT UNSIGNED NOT NULL,
  `contractor_id`       INT UNSIGNED NOT NULL,
  `phase_number`        TINYINT UNSIGNED NOT NULL,
  `phase_title`         VARCHAR(180) NOT NULL,
  `subcategory`         VARCHAR(180) NOT NULL,
  `work_date`           DATE NOT NULL,
  `work_done`           TEXT NOT NULL,
  `work_status`         VARCHAR(30) NOT NULL DEFAULT 'in-progress',
  `progress_percentage` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `remarks`             TEXT NULL,
  `created_by`          BIGINT UNSIGNED NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dwu_project` (`project_id`),
  KEY `idx_dwu_site` (`site_id`),
  KEY `idx_dwu_contractor` (`contractor_id`),
  KEY `idx_dwu_date` (`work_date`),
  CONSTRAINT `fk_dwu_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dwu_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dwu_contractor` FOREIGN KEY (`contractor_id`) REFERENCES `contractors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dwu_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- daily_work_photos
CREATE TABLE IF NOT EXISTS `daily_work_photos` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `work_update_id` INT UNSIGNED NOT NULL,
  `project_id`     INT UNSIGNED NOT NULL,
  `site_id`        INT UNSIGNED NOT NULL,
  `phase_number`   TINYINT UNSIGNED NOT NULL,
  `subcategory`    VARCHAR(180) NOT NULL,
  `file_path`      VARCHAR(255) NOT NULL,
  `file_name`      VARCHAR(255) NOT NULL,
  `file_type`      VARCHAR(100) NOT NULL,
  `file_size`      INT UNSIGNED NOT NULL,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dwp_update` (`work_update_id`),
  KEY `idx_dwp_project` (`project_id`),
  KEY `idx_dwp_site` (`site_id`),
  CONSTRAINT `fk_dwp_update` FOREIGN KEY (`work_update_id`) REFERENCES `daily_work_updates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dwp_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dwp_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- backfill 8 phases for existing projects
INSERT IGNORE INTO `project_phases` (`project_id`, `phase_number`, `phase_title`)
SELECT p.id, ph.num, ph.title
FROM `projects` p
CROSS JOIN (
  SELECT 1 AS num, 'Site Preparation & Foundation' AS title UNION ALL
  SELECT 2, 'Structural Construction' UNION ALL
  SELECT 3, 'Masonry & External Walls' UNION ALL
  SELECT 4, 'MEP Services' UNION ALL
  SELECT 5, 'Finishing Works' UNION ALL
  SELECT 6, 'External & Site Development' UNION ALL
  SELECT 7, 'Testing, Inspection & Quality Control' UNION ALL
  SELECT 8, 'Handover & Completion'
) ph;
