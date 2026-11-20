'use strict';

/**
 * Migration 20261120c — the Site Engineer role.
 *
 * A Site Engineer has the same screens and access as a Project Manager (the /pm
 * workspace), limited to the sites granted to them in Users & Access (and any
 * site their linked employee record is the engineer of) - see pmScopeService.
 *
 * Created once with a copy of the Project Manager role's current permissions;
 * after that its permissions are edited on the Roles page like any other role.
 * Idempotent: an existing site_engineer role is left alone.
 */
async function up(conn) {
  const [[existing]] = await conn.query("SELECT id FROM roles WHERE slug = 'site_engineer' LIMIT 1");
  if (existing) return;

  const [result] = await conn.query(
    `INSERT INTO roles (slug, name, description, is_active, is_system)
     VALUES ('site_engineer', 'Site Engineer', 'Same access as a Project Manager, limited to the sites assigned to them', 1, 0)`
  );
  const roleId = result.insertId;
  const [copied] = await conn.query(
    `INSERT IGNORE INTO role_permissions (role_id, permission_id)
     SELECT ?, rp.permission_id FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id AND r.slug = 'project_manager'`,
    [roleId]
  );
  console.log(`Added Site Engineer role (${copied.affectedRows} permissions copied from Project Manager)`);
}

module.exports = { up };
