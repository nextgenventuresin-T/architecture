'use strict';

const { pool } = require('../config/db');

async function migrateProjectManagerRole() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Insert or update project_manager in roles table
    await connection.query(
      `INSERT INTO roles (slug, name, description, is_active, is_system)
       VALUES ('project_manager', 'Project Manager', 'Project planning, sites, tasks, materials, labor, and progress tracking', 1, 0)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), is_active = 1`
    );

    const [[pmRole]] = await connection.query("SELECT id FROM roles WHERE slug = 'project_manager' LIMIT 1");
    if (!pmRole) throw new Error('Failed to find or create project_manager role');
    const roleId = pmRole.id;
    console.log(`✓ Project Manager role ready (ID: ${roleId})`);

    // 2. Default permissions for Project Manager
    const pmGrants = [
      ['dashboard', 'view'],
      ['dashboard', 'create'],
      ['dashboard', 'edit'],
      ['projects', 'view'],
      ['projects', 'create'],
      ['projects', 'edit'],
      ['projects', 'approve'],
      ['contractors', 'view'],
      ['contractors', 'create'],
      ['contractors', 'edit'],
      ['employees', 'view'],
      ['materials', 'view'],
      ['materials', 'create'],
      ['materials', 'edit'],
      ['procurement', 'view'],
      ['procurement', 'create'],
      ['procurement', 'edit'],
      ['warehouse', 'view'],
      ['warehouse', 'create'],
      ['approvals', 'view'],
      ['approvals', 'create'],
      ['reports', 'view'],
      ['reports', 'create'],
      ['reports', 'edit'],
      ['notifications', 'view'],
      ['documents', 'view'],
      ['documents', 'create'],
      ['documents', 'edit'],
    ];

    for (const [moduleName, actionName] of pmGrants) {
      const [[perm]] = await connection.query(
        'SELECT id FROM permissions WHERE module = ? AND action = ? LIMIT 1',
        [moduleName, actionName]
      );
      if (perm) {
        await connection.query(
          'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
          [roleId, perm.id]
        );
      }
    }

    await connection.commit();
    console.log(`✓ Successfully granted ${pmGrants.length} default permissions to Project Manager role.`);
  } catch (error) {
    await connection.rollback();
    console.error('Failed to migrate Project Manager role:', error);
    process.exit(1);
  } finally {
    connection.release();
    pool.end();
  }
}

migrateProjectManagerRole();
