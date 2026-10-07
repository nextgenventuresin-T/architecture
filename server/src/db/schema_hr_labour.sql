-- Architecture ERP — Interface 11: HR & Labour Management.
-- Applied last, after every other schema file (needs users, roles, employees,
-- contractors, projects, sites, permissions and role_permissions).
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES NOT DO
-- ---------------------------------------------------------------------------
-- It does not touch `employees`, `contractors`, `projects`, `sites`, `users`,
-- `roles` or the existing `labour_records` table (Interface 3's per-site daily
-- headcount, still used by Site Activities). Nothing here is dropped,
-- renamed, re-typed or deleted, and no existing row is altered outside the
-- narrow, guarded backfills below. Every statement is safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHAT'S NEW
-- ---------------------------------------------------------------------------
--   contractor_workers        — a contractor's own labour roster; each worker
--                                belongs to exactly one contractor.
--   labour_assignments        — company or contractor labour posted to a
--                                project/site for a date range.
--   labour_requests           — a contractor's request for labour on a site
--                                they are assigned to, with Admin/HR review.
--   labour_request_assignments— which specific workers were assigned to fill
--                                a request (supports partial fulfilment).
--   attendance_records        — per-worker daily attendance, company and
--                                contractor labour alike.
--   leave_records              — leave applications for company employees.
--
-- Portability: same information_schema-guard style used by every other
-- schema_*.sql file in this project — required because
-- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is MariaDB-only syntax and a
-- hard error on MySQL 8.

USE `architecture_erp`;

-- ============================================================== contractor_workers

-- A contractor's own workforce. `contractor_id` is NOT NULL — every worker
-- belongs to exactly one contractor, so a worker can never be ownerless or
-- shared, which is what keeps "Contractor A cannot see Contractor B's
-- workers" true at the schema level, not just in application code.
CREATE TABLE IF NOT EXISTS `contractor_workers` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `contractor_id`  INT UNSIGNED NOT NULL,
  `worker_code`    VARCHAR(30)  NULL,
  `full_name`      VARCHAR(150) NOT NULL,
  `phone`          VARCHAR(30)  NULL,
  -- trade/category, e.g. mason, electrician, helper, carpenter, painter
  `skill_category` VARCHAR(80)  NOT NULL DEFAULT 'general',
  `daily_rate`     DECIMAL(10,2) NOT NULL DEFAULT 0,
  -- active | inactive
  `status`         VARCHAR(20)  NOT NULL DEFAULT 'active',
  `joining_date`   DATE NULL,
  `notes`          TEXT NULL,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_contractor_worker_code` (`worker_code`),
  KEY `idx_cw_contractor` (`contractor_id`, `status`),
  KEY `idx_cw_skill` (`skill_category`),
  CONSTRAINT `fk_cw_contractor` FOREIGN KEY (`contractor_id`) REFERENCES `contractors` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================== labour_assignments

-- Posting of a company employee OR a contractor worker to a project/site for
-- a date range. Exactly one of `employee_id` / `contractor_worker_id` is set
-- per row — enforced in the service layer (see labourAssignmentService),
-- mirroring how `employee_assignments` (Interface 5) already separates
-- "who" from "where" without widening `projects`/`sites`.
CREATE TABLE IF NOT EXISTS `labour_assignments` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- company | contractor
  `labour_type`          VARCHAR(20) NOT NULL,
  `employee_id`          INT UNSIGNED NULL,
  `contractor_worker_id` INT UNSIGNED NULL,
  -- denormalised for fast contractor-scoped queries without a join through
  -- contractor_workers on every list/filter call.
  `contractor_id`        INT UNSIGNED NULL,
  `project_id`           INT UNSIGNED NOT NULL,
  `site_id`              INT UNSIGNED NULL,
  `start_date`           DATE NOT NULL,
  `end_date`             DATE NULL,
  -- active | completed | cancelled
  `status`                VARCHAR(20) NOT NULL DEFAULT 'active',
  `assigned_by`          BIGINT UNSIGNED NULL,
  `notes`                TEXT NULL,
  `created_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_la_employee` (`employee_id`, `status`),
  KEY `idx_la_worker` (`contractor_worker_id`, `status`),
  KEY `idx_la_contractor` (`contractor_id`, `status`),
  KEY `idx_la_project` (`project_id`),
  KEY `idx_la_site` (`site_id`),
  CONSTRAINT `fk_la_employee`  FOREIGN KEY (`employee_id`)          REFERENCES `employees`          (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_la_worker`    FOREIGN KEY (`contractor_worker_id`) REFERENCES `contractor_workers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_la_contractor` FOREIGN KEY (`contractor_id`)       REFERENCES `contractors`        (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_la_project`   FOREIGN KEY (`project_id`)           REFERENCES `projects`           (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_la_site`      FOREIGN KEY (`site_id`)              REFERENCES `sites`              (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================== labour_requests

-- A contractor's request for labour on a site they are already assigned to.
-- `contractor_id` identifies who is asking; Admin/HR review and, on
-- approval, fulfil the request by creating labour_assignments for specific
-- workers, tracked through labour_request_assignments below.
CREATE TABLE IF NOT EXISTS `labour_requests` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_number`   VARCHAR(30)  NOT NULL,
  `contractor_id`    INT UNSIGNED NOT NULL,
  `project_id`       INT UNSIGNED NOT NULL,
  `site_id`          INT UNSIGNED NOT NULL,
  `skill_category`   VARCHAR(80)  NOT NULL,
  `quantity`         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `required_date`    DATE NOT NULL,
  -- requested engagement length, in days
  `duration_days`    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  -- low | medium | high | urgent
  `priority`         VARCHAR(20)  NOT NULL DEFAULT 'medium',
  `reason`           TEXT NULL,
  -- DRAFT | SUBMITTED | UNDER_REVIEW | APPROVED | PARTIALLY_ASSIGNED |
  -- FULLY_ASSIGNED | REJECTED | CANCELLED | COMPLETED
  `status`           VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
  `requested_by`     BIGINT UNSIGNED NULL,
  `reviewed_by`      BIGINT UNSIGNED NULL,
  `reviewed_at`      DATETIME NULL,
  `decision_note`    VARCHAR(255) NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_labour_request_number` (`request_number`),
  KEY `idx_lr_contractor` (`contractor_id`, `status`),
  KEY `idx_lr_project` (`project_id`),
  KEY `idx_lr_site` (`site_id`),
  KEY `idx_lr_status` (`status`),
  CONSTRAINT `fk_lr_contractor` FOREIGN KEY (`contractor_id`) REFERENCES `contractors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lr_project`    FOREIGN KEY (`project_id`)    REFERENCES `projects`    (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lr_site`       FOREIGN KEY (`site_id`)       REFERENCES `sites`       (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lr_requester`  FOREIGN KEY (`requested_by`)  REFERENCES `users`       (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lr_reviewer`   FOREIGN KEY (`reviewed_by`)   REFERENCES `users`       (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per worker assigned to (partially or fully) fulfil a request.
-- COUNT(*) against a request gives the assigned-so-far count that drives the
-- PARTIALLY_ASSIGNED / FULLY_ASSIGNED transition.
CREATE TABLE IF NOT EXISTS `labour_request_assignments` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `labour_request_id`    INT UNSIGNED NOT NULL,
  `labour_assignment_id` INT UNSIGNED NULL,
  -- company | contractor — a request is normally filled with the requesting
  -- contractor's own workers, but HR/Admin can also cover it with company
  -- labour, so both sources stay possible.
  `labour_type`          VARCHAR(20) NOT NULL DEFAULT 'contractor',
  `employee_id`          INT UNSIGNED NULL,
  `contractor_worker_id` INT UNSIGNED NULL,
  `assigned_by`          BIGINT UNSIGNED NULL,
  `assigned_on`          DATE NOT NULL,
  `notes`                TEXT NULL,
  `created_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lra_request` (`labour_request_id`),
  KEY `idx_lra_assignment` (`labour_assignment_id`),
  CONSTRAINT `fk_lra_request`    FOREIGN KEY (`labour_request_id`)    REFERENCES `labour_requests`    (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lra_assignment` FOREIGN KEY (`labour_assignment_id`) REFERENCES `labour_assignments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lra_employee`   FOREIGN KEY (`employee_id`)          REFERENCES `employees`          (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lra_worker`     FOREIGN KEY (`contractor_worker_id`) REFERENCES `contractor_workers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lra_assigner`   FOREIGN KEY (`assigned_by`)          REFERENCES `users`               (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================== attendance_records

-- Daily attendance for both company and contractor labour. Exactly one of
-- `employee_id` / `contractor_worker_id` is set per row (service-enforced,
-- same convention as labour_assignments). `contractor_id` is denormalised
-- onto every contractor row so "Contractor A cannot see Contractor B's
-- attendance" is a single indexed WHERE clause, not a join.
CREATE TABLE IF NOT EXISTS `attendance_records` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `attendance_date`      DATE NOT NULL,
  -- company | contractor
  `labour_type`          VARCHAR(20) NOT NULL,
  `employee_id`          INT UNSIGNED NULL,
  `contractor_worker_id` INT UNSIGNED NULL,
  `contractor_id`        INT UNSIGNED NULL,
  `project_id`           INT UNSIGNED NOT NULL,
  `site_id`              INT UNSIGNED NOT NULL,
  -- PRESENT | ABSENT | HALF_DAY | LEAVE
  `status`               VARCHAR(20) NOT NULL DEFAULT 'PRESENT',
  `check_in`             TIME NULL,
  `check_out`            TIME NULL,
  `remarks`              VARCHAR(255) NULL,
  `recorded_by`          BIGINT UNSIGNED NULL,
  `created_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- One record per worker per day. NULL <> NULL in MySQL/MariaDB unique
  -- indexes, so a company-labour row (contractor_worker_id NULL) never
  -- collides with a contractor-labour row on this index, and vice versa.
  UNIQUE KEY `uq_attendance_employee_day` (`attendance_date`, `employee_id`),
  UNIQUE KEY `uq_attendance_worker_day` (`attendance_date`, `contractor_worker_id`),
  KEY `idx_att_contractor_day` (`contractor_id`, `attendance_date`),
  KEY `idx_att_project_day` (`project_id`, `attendance_date`),
  KEY `idx_att_site_day` (`site_id`, `attendance_date`),
  KEY `idx_att_status` (`status`),
  CONSTRAINT `fk_att_employee`   FOREIGN KEY (`employee_id`)          REFERENCES `employees`          (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_worker`     FOREIGN KEY (`contractor_worker_id`) REFERENCES `contractor_workers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_contractor` FOREIGN KEY (`contractor_id`)        REFERENCES `contractors`        (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_project`    FOREIGN KEY (`project_id`)           REFERENCES `projects`           (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_site`       FOREIGN KEY (`site_id`)              REFERENCES `sites`              (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_att_recorder`   FOREIGN KEY (`recorded_by`)          REFERENCES `users`               (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================== leave_records

-- Leave for company employees. Contractor workers are engaged day-to-day
-- through attendance (LEAVE is one of its statuses) rather than a formal
-- leave application, so this table is employee-only by design.
CREATE TABLE IF NOT EXISTS `leave_records` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`    INT UNSIGNED NOT NULL,
  -- casual | sick | earned | unpaid | other
  `leave_type`     VARCHAR(30) NOT NULL DEFAULT 'casual',
  `start_date`     DATE NOT NULL,
  `end_date`       DATE NOT NULL,
  `reason`         TEXT NULL,
  -- PENDING | APPROVED | REJECTED | CANCELLED
  `status`         VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `applied_on`     DATE NOT NULL,
  `decided_by`     BIGINT UNSIGNED NULL,
  `decided_on`     DATETIME NULL,
  `decision_note`  VARCHAR(255) NULL,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_leave_employee` (`employee_id`, `status`),
  KEY `idx_leave_status` (`status`),
  KEY `idx_leave_dates` (`start_date`, `end_date`),
  CONSTRAINT `fk_leave_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_leave_decider`  FOREIGN KEY (`decided_by`)  REFERENCES `users`     (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================== permission grants
--
-- `hr` module permissions already exist (added by schema_user_access.sql) —
-- this interface reuses them rather than creating a new module. ADMIN
-- already holds every permission via its blanket grant; HR already holds
-- hr:view/create/edit/approve. What's missing is CONTRACTOR (their own
-- workers, their own requests, their own workers' attendance) and EMPLOYEE
-- (their own leave/attendance).
--
-- Gated per-role-per-module rather than on "role_permissions is completely
-- empty" (schema_user_access.sql's gate, which already tripped to closed
-- long before this file exists): this only seeds hr defaults for a role the
-- first time it has zero hr permissions, so it fires once on upgrade and
-- never again overwrites an admin's later tuning of the matrix.

SET @contractor_hr_seeded := (
  SELECT COUNT(*) FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.slug = 'contractor' AND p.module = 'hr'
);
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'contractor' AND @contractor_hr_seeded = 0
  AND p.module = 'hr' AND p.action IN ('view','create','edit')
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

SET @employee_hr_seeded := (
  SELECT COUNT(*) FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.slug = 'employee' AND p.module = 'hr'
);
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'employee' AND @employee_hr_seeded = 0
  AND p.module = 'hr' AND p.action IN ('view','create')
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);
