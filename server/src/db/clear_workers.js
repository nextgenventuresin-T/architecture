'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { pool } = require('../config/db');

async function clear() {
  const c = await pool.getConnection();
  await c.beginTransaction();
  try {
    // Unlink workers from all FK tables first
    await c.query('DELETE FROM task_assigned_workers');
    await c.query('DELETE FROM labour_assignments');
    await c.query('DELETE FROM labour_request_assignments');
    await c.query('DELETE FROM attendance_records');
    await c.query('UPDATE task_worker_logs SET worker_id = NULL');
    // Delete all workers (daily wage + company labour)
    await c.query('DELETE FROM contractor_workers');
    await c.commit();
    console.log('✅ All workers (daily wage + company labour) cleared.');
  } catch (e) {
    await c.rollback();
    console.error('❌ Failed:', e.message);
  } finally {
    c.release();
    process.exit(0);
  }
}
clear();
