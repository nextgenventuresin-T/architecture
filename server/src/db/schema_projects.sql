-- Architecture ERP — Interface 3: Project & Site Management.
-- Applied after schema.sql, which owns roles/users/refresh_tokens.
-- Every statement is IF NOT EXISTS so migration stays re-runnable.

USE `architecture_erp`;

-- ---------------------------------------------------------------- directory

CREATE TABLE IF NOT EXISTS `clients` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(150) NOT NULL,
  `contact_person` VARCHAR(120) NULL,
  `email`         VARCHAR(191) NULL,
  `phone`         VARCHAR(30)  NULL,
  `address`       VARCHAR(255) NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_clients_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff who can be assigned to a project team. `user_id` links to a login
-- account when the person also signs in; team members without accounts are
-- still assignable.
CREATE TABLE IF NOT EXISTS `employees` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NULL,
  `full_name`  VARCHAR(150) NOT NULL,
  `designation` VARCHAR(80) NOT NULL,
  `email`      VARCHAR(191) NULL,
  `phone`      VARCHAR(30)  NULL,
  `is_active`  TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_employees_designation` (`designation`),
  CONSTRAINT `fk_employees_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contractors` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT UNSIGNED NULL,
  `name`           VARCHAR(150) NOT NULL,
  `contact_person` VARCHAR(120) NULL,
  `email`          VARCHAR(191) NULL,
  `phone`          VARCHAR(30)  NULL,
  `address`        VARCHAR(255) NULL,
  `speciality`     VARCHAR(120) NULL,
  `rating`         DECIMAL(3,1) NULL,
  `is_active`      TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_contractors_name` (`name`),
  CONSTRAINT `fk_contractors_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- projects

CREATE TABLE IF NOT EXISTS `projects` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`              VARCHAR(20)  NOT NULL,
  `name`              VARCHAR(180) NOT NULL,
  `client_id`         INT UNSIGNED NULL,
  `project_type`      VARCHAR(60)  NOT NULL DEFAULT 'residential',
  `description`       TEXT NULL,
  `location`          VARCHAR(255) NOT NULL,
  `start_date`        DATE NOT NULL,
  `expected_completion` DATE NOT NULL,
  `estimated_budget`  DECIMAL(15,2) NOT NULL DEFAULT 0,
  `project_manager_id` INT UNSIGNED NULL,
  `architect_id`      INT UNSIGNED NULL,
  `site_engineer_id`  INT UNSIGNED NULL,
  `contractor_id`     INT UNSIGNED NULL,
  -- on-track | attention | delayed | on-hold | completed
  `status`            VARCHAR(30) NOT NULL DEFAULT 'on-track',
  `progress`          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `current_phase`     VARCHAR(80) NULL,
  `is_archived`       TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_projects_code` (`code`),
  KEY `idx_projects_status` (`status`),
  KEY `idx_projects_client` (`client_id`),
  KEY `idx_projects_contractor` (`contractor_id`),
  CONSTRAINT `fk_projects_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_projects_pm` FOREIGN KEY (`project_manager_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_projects_architect` FOREIGN KEY (`architect_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_projects_engineer` FOREIGN KEY (`site_engineer_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_projects_contractor` FOREIGN KEY (`contractor_id`) REFERENCES `contractors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sites` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`       INT UNSIGNED NOT NULL,
  `name`             VARCHAR(180) NOT NULL,
  `address`          VARCHAR(255) NOT NULL,
  `site_engineer_id` INT UNSIGNED NULL,
  `contractor_id`    INT UNSIGNED NULL,
  `labour_count`     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `progress`         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `status`           VARCHAR(30) NOT NULL DEFAULT 'on-track',
  -- safe | caution | incident
  `safety_status`    VARCHAR(20) NOT NULL DEFAULT 'safe',
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sites_project` (`project_id`),
  CONSTRAINT `fk_sites_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sites_engineer` FOREIGN KEY (`site_engineer_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sites_contractor` FOREIGN KEY (`contractor_id`) REFERENCES `contractors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Planned vs actual progress comes from tasks rather than a typed-in number.
CREATE TABLE IF NOT EXISTS `project_tasks` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`     INT UNSIGNED NOT NULL,
  `phase`          VARCHAR(80) NOT NULL,
  `name`           VARCHAR(180) NOT NULL,
  -- completed | in-progress | pending | delayed
  `status`         VARCHAR(20) NOT NULL DEFAULT 'pending',
  `planned_start`  DATE NULL,
  `planned_end`    DATE NULL,
  `actual_end`     DATE NULL,
  `weight`         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_tasks_project` (`project_id`),
  CONSTRAINT `fk_tasks_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------- daily site records

CREATE TABLE IF NOT EXISTS `site_activities` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `site_id`            INT UNSIGNED NOT NULL,
  `activity_date`      DATE NOT NULL,
  `work_completed`     TEXT NOT NULL,
  `labour_present`     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `contractor_activity` VARCHAR(255) NULL,
  `equipment_used`     VARCHAR(255) NULL,
  `expenses`           DECIMAL(13,2) NOT NULL DEFAULT 0,
  `issues`             TEXT NULL,
  `notes`              TEXT NULL,
  `document_name`      VARCHAR(255) NULL,
  `recorded_by`        BIGINT UNSIGNED NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_activity_per_site_day` (`site_id`, `activity_date`),
  CONSTRAINT `fk_activity_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_activity_user` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `labour_records` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `site_id`        INT UNSIGNED NOT NULL,
  `contractor_id`  INT UNSIGNED NULL,
  `category`       VARCHAR(80) NOT NULL,
  `worker_count`   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `present_count`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `record_date`    DATE NOT NULL,
  `daily_rate`     DECIMAL(10,2) NOT NULL DEFAULT 0,
  -- pending | cleared | overdue
  `payment_status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`id`),
  KEY `idx_labour_site_date` (`site_id`, `record_date`),
  CONSTRAINT `fk_labour_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_labour_contractor` FOREIGN KEY (`contractor_id`) REFERENCES `contractors` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- materials

CREATE TABLE IF NOT EXISTS `materials` (
  `id`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`     VARCHAR(120) NOT NULL,
  `category` VARCHAR(80)  NOT NULL,
  `unit`     VARCHAR(20)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_materials_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per delivery to a site. Remaining quantity is derived
-- (quantity - used_quantity) rather than stored, so it cannot drift.
CREATE TABLE IF NOT EXISTS `material_entries` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`    INT UNSIGNED NOT NULL,
  `site_id`       INT UNSIGNED NULL,
  `material_id`   INT UNSIGNED NOT NULL,
  `quantity`      DECIMAL(12,2) NOT NULL DEFAULT 0,
  `used_quantity` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `rate`          DECIMAL(12,2) NOT NULL DEFAULT 0,
  `supplier`      VARCHAR(150) NULL,
  `received_date` DATE NOT NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_material_entries_project` (`project_id`),
  CONSTRAINT `fk_me_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_me_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_me_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------- finance

CREATE TABLE IF NOT EXISTS `expenses` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`  INT UNSIGNED NOT NULL,
  `site_id`     INT UNSIGNED NULL,
  -- material | labour | contractor | equipment | overhead | other
  `category`    VARCHAR(40) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `amount`      DECIMAL(13,2) NOT NULL,
  `expense_date` DATE NOT NULL,
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_expenses_project` (`project_id`),
  CONSTRAINT `fk_expenses_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_expenses_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contractor_payments` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`    INT UNSIGNED NOT NULL,
  `contractor_id` INT UNSIGNED NOT NULL,
  `contract_value` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `paid_amount`   DECIMAL(15,2) NOT NULL DEFAULT 0,
  `payment_status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_contract_project_contractor` (`project_id`, `contractor_id`),
  CONSTRAINT `fk_cp_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cp_contractor` FOREIGN KEY (`contractor_id`) REFERENCES `contractors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------- issues, docs, approvals

CREATE TABLE IF NOT EXISTS `project_issues` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`  INT UNSIGNED NOT NULL,
  `site_id`     INT UNSIGNED NULL,
  `title`       VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  -- low | medium | high
  `severity`    VARCHAR(20) NOT NULL DEFAULT 'medium',
  -- open | resolved
  `status`      VARCHAR(20) NOT NULL DEFAULT 'open',
  `raised_on`   DATE NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_issues_project` (`project_id`),
  CONSTRAINT `fk_issues_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_issues_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Metadata only. File storage is not part of this interface; `file_path`
-- holds wherever the binary ends up once uploads are built.
CREATE TABLE IF NOT EXISTS `project_documents` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`    INT UNSIGNED NOT NULL,
  `name`          VARCHAR(200) NOT NULL,
  `document_type` VARCHAR(60) NOT NULL,
  `file_path`     VARCHAR(255) NULL,
  `uploaded_on`   DATE NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_docs_project` (`project_id`),
  CONSTRAINT `fk_docs_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Requests raised on site that need Admin/Finance sign-off.
CREATE TABLE IF NOT EXISTS `approval_requests` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id`    INT UNSIGNED NULL,
  `site_id`       INT UNSIGNED NULL,
  -- material-request | payment-request | purchase-request | expense-claim | contractor-request
  `request_type`  VARCHAR(40) NOT NULL,
  `title`         VARCHAR(200) NOT NULL,
  `requested_by`  VARCHAR(150) NOT NULL,
  `amount`        DECIMAL(13,2) NULL,
  `details`       TEXT NULL,
  -- pending | approved | rejected
  `status`        VARCHAR(20) NOT NULL DEFAULT 'pending',
  `requested_on`  DATE NOT NULL,
  `decided_on`    DATETIME NULL,
  `decided_by`    BIGINT UNSIGNED NULL,
  `decision_note` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_approvals_status` (`status`),
  KEY `idx_approvals_project` (`project_id`),
  CONSTRAINT `fk_appr_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_appr_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_appr_user` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Standard construction material catalogue.
INSERT INTO `materials` (`name`, `category`, `unit`) VALUES
  ('Cement (OPC 53)', 'Cement',     'bags'),
  ('Sand',            'Aggregate',  'cu.m'),
  ('Stone / Patthar', 'Aggregate',  'cu.m'),
  ('Bricks',          'Masonry',    'thousand'),
  ('Steel / Sariya',  'Steel',      'tonnes'),
  ('Ready Mix Concrete', 'Concrete', 'cu.m'),
  ('Tiles',           'Finishing',  'sq.m'),
  ('Marble',          'Finishing',  'sq.m'),
  ('Granite',         'Finishing',  'sq.m'),
  ('Wood',            'Carpentry',  'cu.ft'),
  ('Glass',           'Finishing',  'sq.m'),
  ('Paint',           'Finishing',  'litres'),
  ('Electrical Fittings', 'Electrical', 'sets'),
  ('Plumbing Fittings',   'Plumbing',   'sets'),
  ('Hardware',        'Hardware',   'sets')
ON DUPLICATE KEY UPDATE `category` = VALUES(`category`), `unit` = VALUES(`unit`);
