'use strict';

const { pool } = require('../config/db');

async function clearProcurements() {
  const connection = await pool.getConnection();
  console.log('Starting transaction to clear procurement data (preserving materials)...');

  try {
    await connection.beginTransaction();

    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // 1. Unlink references in material_movements
    const [unlinkedMm] = await connection.query(
      'UPDATE material_movements SET procurement_request_id = NULL WHERE procurement_request_id IS NOT NULL'
    );
    console.log(`- Unlinked procurement_request_id on ${unlinkedMm.affectedRows} material movements`);

    // 2. Unlink references in warehouse_transactions
    const [unlinkedWt] = await connection.query(
      'UPDATE warehouse_transactions SET procurement_receipt_id = NULL, procurement_request_id = NULL WHERE procurement_receipt_id IS NOT NULL OR procurement_request_id IS NOT NULL'
    );
    console.log(`- Unlinked procurement references on ${unlinkedWt.affectedRows} warehouse transactions`);

    // 3. Clear material_entries created from procurement deliveries
    const [delEntries] = await connection.query(
      "DELETE FROM material_entries WHERE notes LIKE 'Procurement PR-%'"
    );
    console.log(`- Deleted ${delEntries.affectedRows} procurement-generated material entries`);

    // 4. Delete all procurement receipts
    const [delReceipts] = await connection.query('DELETE FROM procurement_receipts');
    console.log(`- Deleted ${delReceipts.affectedRows} procurement receipts`);

    // 5. Delete all procurement requests
    const [delRequests] = await connection.query('DELETE FROM procurement_requests');
    console.log(`- Deleted ${delRequests.affectedRows} procurement requests`);

    // Verify materials are untouched
    const [[{ matCount }]] = await connection.query('SELECT COUNT(*) as matCount FROM materials');
    console.log(`\nVerified: materials table intact with ${matCount} master material items.`);

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    await connection.commit();
    console.log('\nTRANSACTION COMMITTED: All procurement records cleared successfully!');
  } catch (error) {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.rollback();
    console.error('ERROR OCCURRED, TRANSACTION ROLLED BACK:', error);
    throw error;
  } finally {
    connection.release();
  }
}

clearProcurements()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
