'use strict';

const { pool } = require('../config/db');

async function run() {
  try {
    const [existing] = await pool.query("SELECT * FROM warehouses WHERE type = 'central' LIMIT 1");
    if (existing.length > 0) {
      console.log('Central Warehouse already exists:', existing[0]);
      process.exit(0);
    }

    const [res] = await pool.query(`
      INSERT INTO warehouses (code, name, location, description, status, type, contractor_id)
      VALUES (
        'WH-001',
        'Central Main Warehouse',
        'Headquarters / Main Store Yard',
        'Main central warehouse for procurement, central stock storage, and site material transfers.',
        'active',
        'central',
        NULL
      )
    `);

    console.log('Successfully inserted Central Warehouse, ID:', res.insertId);

    const [all] = await pool.query('SELECT id, code, name, location, type, contractor_id, status FROM warehouses');
    console.log('Current Warehouses:');
    console.table(all);
    process.exit(0);
  } catch (err) {
    console.error('Error adding central warehouse:', err);
    process.exit(1);
  }
}

run();
