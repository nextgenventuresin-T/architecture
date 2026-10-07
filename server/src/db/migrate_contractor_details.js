'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function migrate() {
  console.log('Running contractor details migration...');
  const sqlPath = path.join(__dirname, 'schema_contractor_details.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  const connection = await pool.getConnection();
  try {
    for (const stmt of statements) {
      await connection.query(stmt);
    }
    console.log('✓ Contractors table updated with PAN, Aadhaar, GST and Bank details.');
    console.log('✓ Attendance records table updated with nullable project_id and site_id.');
  } finally {
    connection.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
