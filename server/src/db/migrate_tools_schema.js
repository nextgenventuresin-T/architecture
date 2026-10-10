'use strict';

const { pool } = require('../config/db');

async function run() {
  async function addCol(table, col, def) {
    const [cols] = await pool.query('DESCRIBE ' + table);
    if (!cols.find((c) => c.Field === col)) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      console.log(`Added ${col} to ${table}`);
    } else {
      console.log(`${table}.${col} already exists`);
    }
  }

  // 1. tools table
  await addCol('tools', 'total_quantity', 'INT UNSIGNED NOT NULL DEFAULT 1');
  await addCol('tools', 'ownership_type', "VARCHAR(40) NOT NULL DEFAULT 'owned'");
  await addCol('tools', 'default_charge_rate', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00');
  await addCol('tools', 'rental_rate', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00');

  // 2. procurement_requests table
  await addCol('procurement_requests', 'tool_procurement_type', 'VARCHAR(40) NULL DEFAULT NULL');
  await addCol('procurement_requests', 'rental_cost', 'DECIMAL(12,2) NULL DEFAULT NULL');
  await addCol('procurement_requests', 'usage_charge_rate', 'DECIMAL(12,2) NULL DEFAULT NULL');
  await addCol('procurement_requests', 'rental_days', 'DECIMAL(10,2) NULL DEFAULT NULL');
  await addCol('procurement_requests', 'rental_start_date', 'DATE NULL DEFAULT NULL');
  await addCol('procurement_requests', 'rental_end_date', 'DATE NULL DEFAULT NULL');

  // 3. task_tools table
  await addCol('task_tools', 'contractor_id', 'INT UNSIGNED NULL DEFAULT NULL');
  await addCol('task_tools', 'status', "VARCHAR(20) NOT NULL DEFAULT 'allocated'");
  await addCol('task_tools', 'start_date', 'DATE NULL DEFAULT NULL');
  await addCol('task_tools', 'end_date', 'DATE NULL DEFAULT NULL');
  await addCol('task_tools', 'requested_by', 'BIGINT UNSIGNED NULL DEFAULT NULL');

  // 4. Update default rates for materials if they are 0
  const rates = {
    'Cement (OPC 53)': 380,
    'Sand': 1600,
    'Stone / Patthar': 1400,
    'Bricks': 8000,
    'Steel / Sariya': 70, // unit is kg or tonne, ₹70/kg
    'Ready Mix Concrete': 4200,
    'Tiles': 450,
    'Marble': 120,
    'Granite': 180,
    'Wood': 950,
    'Glass': 85,
    'Paint': 350,
    'Electrical Fittings': 2500,
    'Plumbing Fittings': 2200,
    'Hardware': 1800,
  };
  for (const [name, rate] of Object.entries(rates)) {
    await pool.query(
      'UPDATE materials SET default_rate = ? WHERE name = ? AND (default_rate IS NULL OR default_rate = 0)',
      [rate, name]
    );
  }
  console.log('Materials default rates updated.');
}

run()
  .then(() => {
    console.log('Migration completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
