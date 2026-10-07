-- Architecture ERP — Interface 12: Approvals Management.
-- Applied last, after every other schema file (needs users, roles, projects,
-- sites, permissions, role_permissions, approval_requests, labour_requests,
-- procurement_requests and expenses).
--
-- ---------------------------------------------------------------------------
-- NO SECOND APPROVAL SYSTEM IS CREATED HERE.
-- ---------------------------------------------------------------------------
-- Interface 12 is a central processing/view layer over approval workflows that
-- already exist. It does NOT copy requests into a new table, and it does NOT
-- own status. The source of truth for each approvable item stays exactly where
-- it is today:
--
--   general      -> `approval_requests`     (Interface 3, status pending/approved/rejected)
--   hr_labour    -> `labour_requests`       (Interface 11, SUBMITTED/UNDER_REVIEW -> APPROVED/REJECTED)
--   procurement  -> `procurement_requests`  (Interface 7, pending_approval -> approved/rejected)
--   finance      -> `expenses`              (Interface 9, pending -> approved/rejected)
--
-- Approving through this interface calls each module's own service, so each
-- module's own transition rules keep applying. Nothing about those tables is
-- dropped, renamed, re-typed or backfilled.
--
-- ---------------------------------------------------------------------------
-- WHAT'S NEW
-- ---------------------------------------------------------------------------
--   approval_history — an append-only audit trail of who decided what, when,
--                      with the comment and the previous/new status.
--
-- This is the one thing genuinely missing. None of the four source tables
-- records a *sequence* of actions: `approval_requests` keeps a single
-- decision_note, `labour_requests` a single decision_note, and
-- `procurement_requests`/`expenses` keep no note at all. The brief requires
-- Action / User / Date-time / Comment / Previous status / New status and
-- requires that history is never deleted — that needs its own table.
--
-- Rows here are INSERT-only. Nothing in the codebase updates or deletes them,
-- and `actor_name` / `actor_role` are denormalised copies so the trail still
-- reads correctly after a user is renamed or deactivated.
--
-- Portability: same information_schema-guard style as every other schema_*.sql
-- file in this project. Safe to re-run.

USE `architecture_erp`;

-- ============================================================ approval_history

CREATE TABLE IF NOT EXISTS `approval_history` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Which module's table `reference_id` points at: general | hr_labour |
  -- procurement | finance. A plain column rather than a foreign key, because
  -- one history table deliberately spans four unrelated source tables — the
  -- alternative is four near-identical history tables.
  `module`           VARCHAR(30)  NOT NULL,
  `reference_id`     INT UNSIGNED NOT NULL,
  -- Human-readable identifier of the source record (LR-0002, PR-0004, ...),
  -- stored so the trail stays readable even if the source row is later
  -- removed by a cascade.
  `reference`        VARCHAR(60)  NULL,
  -- SUBMITTED | APPROVED | REJECTED | COMMENTED
  `action`           VARCHAR(30)  NOT NULL,
  `previous_status`  VARCHAR(40)  NULL,
  `new_status`       VARCHAR(40)  NULL,
  `comment`          VARCHAR(500) NULL,
  `actor_user_id`    BIGINT UNSIGNED NULL,
  `actor_name`       VARCHAR(150) NULL,
  `actor_role`       VARCHAR(50)  NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- Drives "history for this record", in insertion order.
  KEY `idx_ah_record` (`module`, `reference_id`, `id`),
  -- Drives the "approved today / rejected today" dashboard counts.
  KEY `idx_ah_action_date` (`action`, `created_at`),
  KEY `idx_ah_actor` (`actor_user_id`),
  CONSTRAINT `fk_ah_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================= permission grants
--
-- The `approvals` module permissions already exist (added by
-- schema_user_access.sql) — this interface reuses them rather than creating a
-- new module. ADMIN holds everything via its blanket grant; FINANCE already
-- holds approvals:view + approvals:approve; HR, PROCUREMENT and WAREHOUSE
-- already hold approvals:view.
--
-- What is missing is CONTRACTOR and EMPLOYEE, who under this interface may
-- see the status of requests *they* raised (and may never decide anything).
-- Only `approvals:view` is granted — never `approvals:approve`.
--
-- Gated per-role-per-module rather than on "role_permissions is completely
-- empty" (schema_user_access.sql's gate, which tripped closed long before this
-- file exists): this seeds a role's approvals defaults only the first time it
-- has zero approvals permissions, so it fires once on upgrade and never
-- overwrites an admin's later tuning of the matrix.

SET @contractor_appr_seeded := (
  SELECT COUNT(*) FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.slug = 'contractor' AND p.module = 'approvals'
);
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'contractor' AND @contractor_appr_seeded = 0
  AND p.module = 'approvals' AND p.action = 'view'
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

SET @employee_appr_seeded := (
  SELECT COUNT(*) FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.slug = 'employee' AND p.module = 'approvals'
);
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'employee' AND @employee_appr_seeded = 0
  AND p.module = 'approvals' AND p.action = 'view'
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);
