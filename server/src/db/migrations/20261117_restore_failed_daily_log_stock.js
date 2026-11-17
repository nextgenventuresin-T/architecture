'use strict';

/**
 * Repair 20261117 — give back material taken by daily-log saves that then failed.
 *
 * A daily-log save issued the material from the site/contractor stock (and recorded a
 * "Material Consumption" expense) BEFORE writing the log row. On Hostinger the row then
 * failed (phase_number NOT NULL), so the stock stayed consumed with no log: the material
 * showed "0 available" in the next daily log. The save is now undone on failure; this puts
 * back what earlier failures took.
 *
 * Orphan = an 'issue' with reference CONSUMPTION-... that no daily_work_updates row points
 * to (both save paths always link it). Only since the Hostinger move (2026-11-11), and older
 * than 10 minutes so a save in progress is never touched. Idempotent: each orphan is removed
 * once its stock is restored, so the next start finds nothing.
 */
async function up(conn) {
  const [orphans] = await conn.query(
    `SELECT t.* FROM warehouse_transactions t
     WHERE t.transaction_type = 'issue' AND t.reference LIKE 'CONSUMPTION-%'
       AND t.created_at >= '2026-11-11' AND t.created_at < NOW() - INTERVAL 10 MINUTE
       AND NOT EXISTS (SELECT 1 FROM daily_work_updates d WHERE d.warehouse_transaction_id = t.id)`
  );
  for (const tx of orphans) {
    await conn.beginTransaction();
    try {
      const [[slot]] = await conn.query(
        `SELECT id FROM warehouse_stock
         WHERE warehouse_id = ? AND material_id = ? AND project_id <=> ? AND site_id <=> ? LIMIT 1 FOR UPDATE`,
        [tx.warehouse_id, tx.material_id, tx.project_id, tx.site_id]
      );
      if (slot) {
        await conn.query('UPDATE warehouse_stock SET quantity = quantity + ? WHERE id = ?', [tx.quantity, slot.id]);
      } else {
        await conn.query(
          'INSERT INTO warehouse_stock (warehouse_id, material_id, project_id, site_id, quantity) VALUES (?, ?, ?, ?, ?)',
          [tx.warehouse_id, tx.material_id, tx.project_id, tx.site_id, tx.quantity]
        );
      }
      await conn.query(
        `DELETE FROM expenses WHERE source_type = 'daily_work_material' AND reference = ?
           AND id NOT IN (SELECT expense_id FROM daily_work_updates WHERE expense_id IS NOT NULL)`,
        [tx.transaction_number]
      );
      await conn.query('DELETE FROM warehouse_transactions WHERE id = ?', [tx.id]);
      await conn.commit();
      console.log(`Restored ${tx.quantity} of material ${tx.material_id} from failed daily log (${tx.transaction_number})`);
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  }
}

module.exports = { up };
