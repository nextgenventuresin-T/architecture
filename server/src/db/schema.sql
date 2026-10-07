-- Architecture ERP — authentication schema (Interface 1).
-- Only the tables needed to sign a user in and route them by role.
-- ERP domain tables (projects, materials, procurement, finance, ...) are
-- intentionally NOT created here; they arrive with their own interfaces.

CREATE DATABASE IF NOT EXISTS `architecture_erp`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `architecture_erp`;

-- Roles are rows rather than an ENUM so new roles can be added without
-- an ALTER TABLE on a large users table later on.
CREATE TABLE IF NOT EXISTS `roles` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `slug`        VARCHAR(50)  NOT NULL,
  `name`        VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `full_name`           VARCHAR(150) NOT NULL,
  `email`               VARCHAR(191) NOT NULL,
  `username`            VARCHAR(60)  NULL,
  -- bcrypt digest, never a plain-text password
  `password_hash`       VARCHAR(255) NOT NULL,
  `role_id`             INT UNSIGNED NOT NULL,
  `preferred_language`  VARCHAR(10)  NOT NULL DEFAULT 'en',
  `is_active`           TINYINT(1)   NOT NULL DEFAULT 1,
  -- brute-force throttling state
  `failed_login_count`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until`        DATETIME     NULL,
  `last_login_at`       DATETIME     NULL,
  `created_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_username` (`username`),
  KEY `idx_users_role` (`role_id`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Refresh tokens are stored hashed so a database leak cannot be replayed
-- as a valid session. Revoking a session = deleting/flagging a row here.
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64)     NOT NULL,
  `user_agent` VARCHAR(255) NULL,
  `ip_address` VARCHAR(45)  NULL,
  `expires_at` DATETIME     NOT NULL,
  `revoked_at` DATETIME     NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refresh_token_hash` (`token_hash`),
  KEY `idx_refresh_user` (`user_id`),
  CONSTRAINT `fk_refresh_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Password reset support for the "Forgot password" link. The token itself is
-- only ever emailed; the table keeps a hash.
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64)  NOT NULL,
  `expires_at` DATETIME  NOT NULL,
  `used_at`    DATETIME  NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reset_token_hash` (`token_hash`),
  KEY `idx_reset_user` (`user_id`),
  CONSTRAINT `fk_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `roles` (`slug`, `name`, `description`) VALUES
  ('admin',       'Administrator',      'Full oversight of every module and site'),
  ('finance',     'Finance',            'Budgets, payments, invoices and cost control'),
  ('hr',          'Human Resources',    'Employees, attendance and payroll records'),
  ('procurement', 'Procurement',        'Purchase requests, vendors and orders'),
  ('warehouse',   'Warehouse',          'Stock, issue notes and material movement'),
  ('contractor',  'Labour Contractor',  'Assigned sites, labour and daily progress'),
  ('employee',    'Employee',           'Own tasks, attendance and requests')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `description` = VALUES(`description`);
