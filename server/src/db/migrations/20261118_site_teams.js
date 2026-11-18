'use strict';

/**
 * Migration 20261118 — several contractors and several engineers on one project / site.
 *
 *   project_contractors (project_id, contractor_id)
 *   site_contractors    (site_id, contractor_id)
 *   project_engineers   (project_id, employee_id)
 *   site_engineers      (site_id, employee_id)
 *
 * The old single columns (projects.contractor_id / site_engineer_id, sites.contractor_id /
 * site_engineer_id) stay, holding the FIRST of each list, so screens that show one name
 * keep working. A table created here is filled once from those columns; after that the
 * lists are the source of truth (see services/siteTeam.js).
 */
const TABLES = [
  { name: 'project_contractors', owner: 'project_id', ownerTable: 'projects', member: 'contractor_id', memberTable: 'contractors', legacy: 'contractor_id' },
  { name: 'site_contractors', owner: 'site_id', ownerTable: 'sites', member: 'contractor_id', memberTable: 'contractors', legacy: 'contractor_id' },
  { name: 'project_engineers', owner: 'project_id', ownerTable: 'projects', member: 'employee_id', memberTable: 'employees', legacy: 'site_engineer_id' },
  { name: 'site_engineers', owner: 'site_id', ownerTable: 'sites', member: 'employee_id', memberTable: 'employees', legacy: 'site_engineer_id' },
];

async function tableExists(conn, name) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
    [name]
  );
  return rows.length > 0;
}

async function up(conn) {
  for (const t of TABLES) {
    if (await tableExists(conn, t.name)) continue;
    await conn.query(`
      CREATE TABLE \`${t.name}\` (
        \`${t.owner}\` INT UNSIGNED NOT NULL,
        \`${t.member}\` INT UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`${t.owner}\`, \`${t.member}\`),
        KEY \`idx_${t.name}_member\` (\`${t.member}\`),
        CONSTRAINT \`fk_${t.name}_owner\` FOREIGN KEY (\`${t.owner}\`) REFERENCES \`${t.ownerTable}\` (id) ON DELETE CASCADE,
        CONSTRAINT \`fk_${t.name}_member\` FOREIGN KEY (\`${t.member}\`) REFERENCES \`${t.memberTable}\` (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await conn.query(
      `INSERT IGNORE INTO \`${t.name}\` (\`${t.owner}\`, \`${t.member}\`)
       SELECT id, \`${t.legacy}\` FROM \`${t.ownerTable}\` WHERE \`${t.legacy}\` IS NOT NULL`
    );
  }
}

module.exports = { up };
