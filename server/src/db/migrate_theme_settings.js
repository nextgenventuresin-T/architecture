'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function migrateThemeSettings() {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true,
  });

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema_theme_settings.sql'), 'utf8');
    await connection.query(sql);
    console.log('✓ company_theme_settings table created and seeded successfully.');
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  migrateThemeSettings().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = migrateThemeSettings;
