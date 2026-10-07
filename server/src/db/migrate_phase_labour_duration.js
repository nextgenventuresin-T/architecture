'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function migratePhaseLabourDuration() {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true,
  });

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema_phase_labour_duration.sql'), 'utf8');
    await connection.query(sql);
    console.log('✓ project_phase_labour table updated with worker_count, daily_wage, working_days.');
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  migratePhaseLabourDuration().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = migratePhaseLabourDuration;
