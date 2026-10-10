'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { pool } = require('../config/db');

async function check() {
  const [pr] = await pool.query('SELECT id, material_id, status, estimated_rate, purchase_rate FROM procurement_requests LIMIT 10');
  console.log('procurement_requests:');
  console.table(pr);

  const [me] = await pool.query('SELECT id, material_id, rate FROM material_entries LIMIT 10');
  console.log('material_entries:');
  console.table(me);

  process.exit(0);
}
check();
