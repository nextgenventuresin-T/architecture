'use strict';

const { pool } = require('../config/db');

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Running Employee 360 & People Search migration...');

    // Helper to add column if not exists
    async function addColumnIfNotExists(colName, colDef, afterCol) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = ?`,
        [colName]
      );
      if (rows[0].cnt === 0) {
        await connection.query(
          `ALTER TABLE \`employees\` ADD COLUMN \`${colName}\` ${colDef} AFTER \`${afterCol}\``
        );
        console.log(`Added column employees.${colName}`);
      } else {
        console.log(`Column employees.${colName} already exists`);
      }
    }

    // Helper to add index if not exists
    async function addIndexIfNotExists(idxName, idxDef) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND INDEX_NAME = ?`,
        [idxName]
      );
      if (rows[0].cnt === 0) {
        await connection.query(`ALTER TABLE \`employees\` ADD INDEX \`${idxName}\` ${idxDef}`);
        console.log(`Added index employees.${idxName}`);
      }
    }

    // 1. Add columns to employees table
    await addColumnIfNotExists('department', 'VARCHAR(100) NULL', 'designation');
    await addColumnIfNotExists('reporting_manager_id', 'INT UNSIGNED NULL', 'department');
    await addColumnIfNotExists('work_location', 'VARCHAR(150) NULL', 'address');
    await addColumnIfNotExists('work_mode', "VARCHAR(30) NOT NULL DEFAULT 'office'", 'work_location');
    await addColumnIfNotExists('availability_status', "VARCHAR(30) NOT NULL DEFAULT 'available'", 'status');
    await addColumnIfNotExists('avatar_url', 'VARCHAR(255) NULL', 'availability_status');
    await addColumnIfNotExists('experience_years', 'DECIMAL(4,1) NULL DEFAULT 0.0', 'joining_date');

    // 2. Add foreign key on reporting_manager_id if not exists
    const [fkRows] = await connection.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND CONSTRAINT_NAME = 'fk_employees_reporting_manager'`
    );
    if (fkRows[0].cnt === 0) {
      try {
        await connection.query(
          `ALTER TABLE \`employees\` ADD CONSTRAINT \`fk_employees_reporting_manager\`
           FOREIGN KEY (\`reporting_manager_id\`) REFERENCES \`employees\` (\`id\`) ON DELETE SET NULL`
        );
        console.log('Added foreign key fk_employees_reporting_manager');
      } catch (err) {
        console.warn('Could not add fk_employees_reporting_manager:', err.message);
      }
    }

    // 3. Add indexes
    await addIndexIfNotExists('idx_employees_dept', '(`department`)');
    await addIndexIfNotExists('idx_employees_work_mode', '(`work_mode`)');
    await addIndexIfNotExists('idx_employees_availability', '(`availability_status`)');

    // 4. Create employee_skills table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`employee_skills\` (
        \`id\`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`employee_id\`  INT UNSIGNED NOT NULL,
        \`skill_name\`   VARCHAR(100) NOT NULL,
        \`proficiency\`  TINYINT UNSIGNED NOT NULL DEFAULT 3,
        \`is_primary\`   TINYINT(1) NOT NULL DEFAULT 1,
        \`created_at\`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_emp_skills_employee\` (\`employee_id\`),
        KEY \`idx_emp_skills_name\` (\`skill_name\`),
        KEY \`idx_emp_skills_prof\` (\`skill_name\`, \`proficiency\`),
        CONSTRAINT \`fk_emp_skills_employee\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Ensured employee_skills table');

    // 5. Create employee_profiles_360 table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`employee_profiles_360\` (
        \`id\`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`employee_id\`        INT UNSIGNED NOT NULL UNIQUE,
        \`interests\`          JSON NULL,
        \`hobbies\`            JSON NULL,
        \`strengths\`          JSON NULL,
        \`development_areas\`  JSON NULL,
        \`career_interests\`   JSON NULL,
        \`bio\`                TEXT NULL,
        \`created_at\`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_emp_profile_employee\` (\`employee_id\`),
        CONSTRAINT \`fk_emp_profile_employee\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Ensured employee_profiles_360 table');

    console.log('Migration completed successfully!');
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = migrate;
