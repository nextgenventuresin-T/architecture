'use strict';

/**
 * Applies every schema file in order. Safe to re-run: each statement is
 * IF NOT EXISTS or an upsert. Run with `npm run db:migrate`.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

const SCHEMA_FILES = [
  'schema.sql', 'schema_projects.sql', 'schema_contractors.sql', 'schema_employees.sql',
  'schema_materials.sql', 'schema_procurement.sql', 'schema_warehouse.sql',
  'schema_warehouse_contractors.sql', 'schema_procurement_flows.sql', 'schema_finance.sql',
  'schema_user_access.sql', 'schema_hr_labour.sql', 'schema_approvals.sql',
  'schema_reports.sql', 'schema_material_movements.sql', 'schema_procurement_bill_files.sql',
  'schema_contractor_expenses.sql', 'schema_phase_budgeting.sql', 'schema_clients_extension.sql',
  'schema_contractor_pos.sql', 'schema_theme_settings.sql', 'schema_phase_labour_duration.sql',
  'schema_contractor_details.sql',
];

async function migrate() {
  const connConfig = {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true,
  };
  if (env.db.ssl) connConfig.ssl = env.db.ssl;
  const connection = await mysql.createConnection(connConfig);

  try {
    for (const file of SCHEMA_FILES) {
      let sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
      if (sql.charCodeAt(0) === 0xfeff) {
        sql = sql.slice(1);
      }
      await connection.query(sql);
      console.log(`Applied ${file}`);
    }
    await require('./migrations/20261009_serials_receipts_cost').up(connection);
    await require('./migrations/20261010_task_tool_days').up(connection);
    await require('./migrations/20261010_transport_expenses').up(connection);
    console.log(`Schema up to date on "${env.db.database}".`);
  } finally {
    await connection.end();
  }
}

migrate().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
