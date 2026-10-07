'use strict';

const { pool } = require('../config/db');

async function migrate() {
  const connection = await pool.getConnection();
  try {
    console.log('Running notifications table migration...');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`notifications\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT UNSIGNED NULL,
        \`role\` VARCHAR(50) NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`message\` TEXT NOT NULL,
        \`type\` ENUM('info', 'warning', 'success', 'error', 'approval', 'task', 'material', 'expense', 'system') NOT NULL DEFAULT 'info',
        \`category\` VARCHAR(50) NOT NULL DEFAULT 'system',
        \`action_url\` VARCHAR(255) NULL,
        \`is_read\` TINYINT(1) NOT NULL DEFAULT 0,
        \`read_at\` DATETIME NULL,
        \`metadata\` JSON NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_notif_user\` (\`user_id\`),
        KEY \`idx_notif_role\` (\`role\`),
        KEY \`idx_notif_is_read\` (\`is_read\`),
        KEY \`idx_notif_created\` (\`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('Notifications table created or confirmed.');

    // Seed helpful initial system notifications
    const [[{ count }]] = await connection.query('SELECT COUNT(*) AS count FROM notifications');
    if (count === 0) {
      await connection.query(`
        INSERT INTO notifications (title, message, type, category, action_url, is_read) VALUES
        ('System Initialized', 'Database was reset to clean slate. You are ready to create projects, sites, and tasks.', 'success', 'system', '/admin/projects', 0),
        ('New Vendor Management Section', 'Vendor master records can now be registered and linked with central procurement.', 'info', 'material', '/admin/vendors', 0),
        ('Unified Task Labour & Daily Work', 'Site operational updates and workforce attendance are now tracked together under Daily Work.', 'info', 'task', '/admin/labour', 0)
      `);
      console.log('Seeded initial system notifications.');
    }

  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    connection.release();
  }
}

migrate()
  .then(() => {
    console.log('Notifications migration completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
