-- Architecture ERP — Interface 10: Users & Access Management.
-- Applied last, after every other schema file.
--
-- ---------------------------------------------------------------------------
-- THE AUTHENTICATION SYSTEM IS NOT REPLACED.
-- ---------------------------------------------------------------------------
-- schema.sql (Interface 1) already created `users`, `roles`, `refresh_tokens`
-- and `password_resets`, and already stores bcrypt digests in
-- `users.password_hash`. This interface adds NO second users table, NO second
-- roles table and NO second login path. It adds:
--
--   users.phone / department / notes  — profile columns the admin screen needs
--   roles.is_active / is_system       — so a role can be retired without being
--                                       deleted, and the Admin role can be
--                                       protected from ever being disabled
--   permissions                       — the module x action catalogue
--   role_permissions                  — which role may do what (the matrix)
--   user_project_access               — per-user project scoping
--   user_site_access                  — per-user site scoping
--
-- All seven roles from Interface 1 (admin, finance, hr, procurement,
-- warehouse, contractor, employee) are reused as-is. The INSERTs below are
-- guarded so no role row is duplicated and no existing role is overwritten.
--
-- ---------------------------------------------------------------------------
-- WHY PROJECT/SITE ACCESS IS "EMPTY MEANS ALL"
-- ---------------------------------------------------------------------------
-- A user with no rows in user_project_access is treated as unrestricted rather
-- than locked out. Interfaces 1-9 shipped without these tables, so every
-- existing user has zero rows; defaulting to "denied" would have locked the
-- entire organisation out of the ERP the moment this migration ran. Scoping
-- therefore switches on per user, the moment an admin grants their first
-- explicit project. The service layer documents this in one place
-- (userAccessService.scopeFor) so the rule cannot drift.
--
-- Portability: same information_schema-guard style as schema_materials.sql and
-- schema_finance.sql. Safe to re-run. Nothing is dropped, renamed, re-typed or
-- deleted, and no existing user, role or password hash is touched.

USE `architecture_erp`;

-- ================================================================== users

-- `phone`
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(30) NULL AFTER `username`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `department`
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'department');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `users` ADD COLUMN `department` VARCHAR(100) NULL AFTER `phone`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `notes`
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'notes');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `users` ADD COLUMN `notes` TEXT NULL AFTER `last_login_at`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `created_by` — which admin provisioned the account.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'created_by');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `users` ADD COLUMN `created_by` BIGINT UNSIGNED NULL AFTER `notes`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND CONSTRAINT_NAME = 'fk_users_created_by');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `users` ADD CONSTRAINT `fk_users_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_active');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `users` ADD INDEX `idx_users_active` (`is_active`)',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `has_custom_permissions`
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_custom_permissions');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `users` ADD COLUMN `has_custom_permissions` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS `user_permissions` (
  `user_id`       BIGINT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED    NOT NULL,
  `created_at`    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `permission_id`),
  KEY `idx_up_permission` (`permission_id`),
  CONSTRAINT `fk_up_user`       FOREIGN KEY (`user_id`)       REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_up_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================================================================== roles

-- `is_active` — a role can be retired without deleting it, which would orphan
-- every user holding it.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'is_active');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `roles` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `description`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- `is_system` — marks the Admin role. A system role can never be deactivated
-- and never have its permissions stripped, so the ERP cannot be locked out of
-- its own administration.
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'is_system');
SET @stmt := IF(@exists = 0,
  'ALTER TABLE `roles` ADD COLUMN `is_system` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`',
  'DO 0');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE `roles` SET `is_system` = 1 WHERE `slug` = 'admin';

-- ============================================================ permissions

-- The module x action catalogue. Rows, not an ENUM, so the matrix screen can
-- render straight from the database rather than a hardcoded list.
CREATE TABLE IF NOT EXISTS `permissions` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `module`      VARCHAR(50)  NOT NULL,
  `action`      VARCHAR(20)  NOT NULL,
  `label`       VARCHAR(150) NOT NULL,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_module_action` (`module`, `action`),
  KEY `idx_permissions_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which role holds which permission. A missing row means "not permitted", so
-- revoking is a DELETE and the table only ever stores grants.
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id`       INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `idx_rp_permission` (`permission_id`),
  CONSTRAINT `fk_rp_role`       FOREIGN KEY (`role_id`)       REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================================================== project/site access

CREATE TABLE IF NOT EXISTS `user_project_access` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `project_id` INT UNSIGNED NOT NULL,
  `granted_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_upa` (`user_id`, `project_id`),
  KEY `idx_upa_project` (`project_id`),
  CONSTRAINT `fk_upa_user`    FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_upa_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_upa_granter` FOREIGN KEY (`granted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_site_access` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `site_id`    INT UNSIGNED NOT NULL,
  `granted_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usa` (`user_id`, `site_id`),
  KEY `idx_usa_site` (`site_id`),
  CONSTRAINT `fk_usa_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_usa_site` FOREIGN KEY (`site_id`) REFERENCES `sites` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_usa_granter` FOREIGN KEY (`granted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================================== permission catalogue

-- 15 modules x 5 actions. ON DUPLICATE KEY UPDATE refreshes only the label, so
-- re-running never duplicates a permission or disturbs the grants pointing at it.
INSERT INTO `permissions` (`module`, `action`, `label`) VALUES
  ('dashboard','view','View dashboard'),
  ('dashboard','create','Create dashboard items'),
  ('dashboard','edit','Edit dashboard items'),
  ('dashboard','delete','Remove dashboard items'),
  ('dashboard','approve','Approve dashboard items'),
  ('projects','view','View projects and sites'),
  ('projects','create','Create projects and sites'),
  ('projects','edit','Edit projects and sites'),
  ('projects','delete','Archive projects and sites'),
  ('projects','approve','Approve project changes'),
  ('contractors','view','View contractors'),
  ('contractors','create','Create contractors'),
  ('contractors','edit','Edit contractors'),
  ('contractors','delete','Archive contractors'),
  ('contractors','approve','Approve contractor records'),
  ('employees','view','View employees'),
  ('employees','create','Create employees'),
  ('employees','edit','Edit employees'),
  ('employees','delete','Archive employees'),
  ('employees','approve','Approve employee records'),
  ('materials','view','View materials'),
  ('materials','create','Create materials'),
  ('materials','edit','Edit materials'),
  ('materials','delete','Archive materials'),
  ('materials','approve','Approve material records'),
  ('procurement','view','View procurement'),
  ('procurement','create','Raise procurement requests'),
  ('procurement','edit','Edit procurement requests'),
  ('procurement','delete','Cancel procurement requests'),
  ('procurement','approve','Approve procurement requests'),
  ('warehouse','view','View warehouse and stock'),
  ('warehouse','create','Record stock movements'),
  ('warehouse','edit','Edit warehouses'),
  ('warehouse','delete','Archive warehouses'),
  ('warehouse','approve','Approve stock adjustments'),
  ('finance','view','View finance'),
  ('finance','create','Record expenses'),
  ('finance','edit','Edit expenses'),
  ('finance','delete','Cancel expenses'),
  ('finance','approve','Approve payments'),
  ('hr','view','View HR'),
  ('hr','create','Create HR records'),
  ('hr','edit','Edit HR records'),
  ('hr','delete','Archive HR records'),
  ('hr','approve','Approve HR requests'),
  ('approvals','view','View approvals'),
  ('approvals','create','Raise approvals'),
  ('approvals','edit','Edit approvals'),
  ('approvals','delete','Withdraw approvals'),
  ('approvals','approve','Decide approvals'),
  ('reports','view','View reports'),
  ('reports','create','Create reports'),
  ('reports','edit','Edit reports'),
  ('reports','delete','Delete reports'),
  ('reports','approve','Publish reports'),
  ('notifications','view','View notifications'),
  ('notifications','create','Send notifications'),
  ('notifications','edit','Edit notifications'),
  ('notifications','delete','Delete notifications'),
  ('notifications','approve','Approve notifications'),
  ('documents','view','View documents'),
  ('documents','create','Upload documents'),
  ('documents','edit','Edit documents'),
  ('documents','delete','Delete documents'),
  ('documents','approve','Approve documents'),
  ('settings','view','View settings'),
  ('settings','create','Create settings'),
  ('settings','edit','Edit settings'),
  ('settings','delete','Delete settings'),
  ('settings','approve','Approve settings changes'),
  ('users','view','View users and access'),
  ('users','create','Create users'),
  ('users','edit','Edit users and permissions'),
  ('users','delete','Deactivate users'),
  ('users','approve','Approve access requests')
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

-- ======================================================= default grants

-- Seeded ONLY when role_permissions is completely empty. Once an admin has
-- tuned the matrix, re-running the migration must not silently reset their
-- work back to these defaults.
SET @seeded := (SELECT COUNT(*) FROM `role_permissions`);

-- ADMIN — every permission, always.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r CROSS JOIN `permissions` p
WHERE r.slug = 'admin'
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

-- FINANCE — finance, plus the project/approval context a finance user needs.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'finance' AND @seeded = 0 AND (
  (p.module = 'finance'     AND p.action IN ('view','create','edit','approve')) OR
  (p.module = 'dashboard'   AND p.action = 'view') OR
  (p.module = 'projects'    AND p.action = 'view') OR
  (p.module = 'procurement' AND p.action IN ('view','approve')) OR
  (p.module = 'approvals'   AND p.action IN ('view','approve')) OR
  (p.module = 'reports'     AND p.action = 'view')
)
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

-- HR — HR and employees, with read-only project/site context.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'hr' AND @seeded = 0 AND (
  (p.module = 'hr'        AND p.action IN ('view','create','edit','approve')) OR
  (p.module = 'employees' AND p.action IN ('view','create','edit')) OR
  (p.module = 'dashboard' AND p.action = 'view') OR
  (p.module = 'projects'  AND p.action = 'view') OR
  (p.module = 'approvals' AND p.action = 'view') OR
  (p.module = 'reports'   AND p.action = 'view')
)
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

-- PROCUREMENT — procurement and materials, plus warehouse visibility.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'procurement' AND @seeded = 0 AND (
  (p.module = 'procurement' AND p.action IN ('view','create','edit')) OR
  (p.module = 'materials'   AND p.action IN ('view','create','edit')) OR
  (p.module = 'warehouse'   AND p.action IN ('view','create')) OR
  (p.module = 'dashboard'   AND p.action = 'view') OR
  (p.module = 'projects'    AND p.action = 'view') OR
  (p.module = 'approvals'   AND p.action = 'view') OR
  (p.module = 'reports'     AND p.action = 'view')
)
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

-- WAREHOUSE — warehouse and materials, with procurement read for receiving.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'warehouse' AND @seeded = 0 AND (
  (p.module = 'warehouse'   AND p.action IN ('view','create','edit')) OR
  (p.module = 'materials'   AND p.action IN ('view','create','edit')) OR
  (p.module = 'procurement' AND p.action = 'view') OR
  (p.module = 'dashboard'   AND p.action = 'view') OR
  (p.module = 'projects'    AND p.action = 'view') OR
  (p.module = 'reports'     AND p.action = 'view')
)
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

-- CONTRACTOR — read-only, and only for assigned projects/sites.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'contractor' AND @seeded = 0 AND (
  (p.module = 'contractors' AND p.action = 'view') OR
  (p.module = 'dashboard'   AND p.action = 'view') OR
  (p.module = 'projects'    AND p.action = 'view')
)
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

-- Contractors may raise and track their own material requests and purchase
-- orders. The procurement service applies the linked contractor scope; these
-- grants do not provide approval, ordering, receiving or global data access.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'contractor'
  AND ((p.module = 'materials' AND p.action = 'view')
    OR (p.module = 'procurement' AND p.action IN ('view','create','edit')))
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

-- EMPLOYEE — read-only, and only for assigned projects/sites.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'employee' AND @seeded = 0 AND (
  (p.module = 'employees' AND p.action = 'view') OR
  (p.module = 'dashboard' AND p.action = 'view') OR
  (p.module = 'projects'  AND p.action = 'view')
)
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);
