-- Architecture ERP — Interface 13: Reports & Analytics.
-- Applied last, after every other schema file (needs roles, permissions,
-- role_permissions — all created by schema_user_access.sql).
--
-- ---------------------------------------------------------------------------
-- NO NEW TABLES. NO NEW ENTITY DATA.
-- ---------------------------------------------------------------------------
-- Reports & Analytics is a read-only layer over every module that already
-- exists (projects, sites, contractors, employees, materials, procurement,
-- warehouse, finance, HR & labour, approvals). It introduces no table of its
-- own — every figure it shows is computed live from the tables those
-- interfaces already own.
--
-- The `reports` permission module (view/create/edit/delete/approve) was
-- already added to the `permissions` catalogue by schema_user_access.sql, and
-- ADMIN/FINANCE/HR/PROCUREMENT/WAREHOUSE were already seeded with
-- `reports:view`. What is missing is CONTRACTOR and EMPLOYEE: the brief
-- requires a contractor to see reports scoped to their own labour, projects,
-- sites and requests, and an employee to see whatever the existing access
-- system already permits them.
--
-- Gated per-role-per-module rather than on "role_permissions is completely
-- empty" (schema_user_access.sql's gate, which tripped closed long before
-- this file exists): this only seeds `reports` defaults for a role the first
-- time it has zero `reports` permissions, so it fires once on upgrade and
-- never again overwrites an admin's later tuning of the matrix.
--
-- Portability: same information_schema-guard style used by every other
-- schema_*.sql file in this project. Safe to re-run. Nothing existing is
-- dropped, renamed, re-typed or deleted.

USE `architecture_erp`;

SET @contractor_reports_seeded := (
  SELECT COUNT(*) FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.slug = 'contractor' AND p.module = 'reports'
);
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'contractor' AND @contractor_reports_seeded = 0
  AND p.module = 'reports' AND p.action = 'view'
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

SET @employee_reports_seeded := (
  SELECT COUNT(*) FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE r.slug = 'employee' AND p.module = 'reports'
);
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `roles` r JOIN `permissions` p
WHERE r.slug = 'employee' AND @employee_reports_seeded = 0
  AND p.module = 'reports' AND p.action = 'view'
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);
