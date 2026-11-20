'use strict';

/**
 * ONE-TIME data reset 20261120 (asked for by the client): clear all procurement,
 * material movements, stock and the finance entries they created, so the system
 * starts again from empty stock. People are kept (contractors, Project Managers,
 * Site Engineers, employees, users, vendors), as are projects, sites, tasks,
 * the material master and machine types.
 *
 * Runs ONCE: a row in `data_resets` marks it done, so a later restart never
 * clears data entered after it. Before deleting, every table it changes is
 * copied to `bak20261120_<table>` in the same database, so it can be restored.
 *
 * Cleared:
 *   procurement_requests, procurement_receipts, procurement_batches
 *   material_movements, warehouse_transactions, warehouse_stock, material_entries
 *   expenses created by stock flows (material / procurement / machine transport,
 *     material consumption, machine charges) and vendor payments against procurement
 *   machine allocations and rentals; rented machine units (they came with a rental)
 * Changed:
 *   daily work logs keep their work / progress but lose the material used on them
 *   owned machine units return to the Central warehouse as available
 */
const NAME = '20261120_clear_procurement_movements_stock';
const BACKUP_PREFIX = 'bak20261120_';

const BACKUP_TABLES = [
  'procurement_requests', 'procurement_receipts', 'procurement_batches',
  'material_movements', 'warehouse_transactions', 'warehouse_stock', 'material_entries',
  'expenses', 'vendor_payments', 'daily_work_updates',
  'tool_allocations', 'tool_rentals', 'tool_units', 'tool_unit_history',
];

const STOCK_EXPENSE_SOURCES = ['material_transport', 'procurement_transport', 'machine_transport', 'daily_work_material'];

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
    [table]
  );
  return rows.length > 0;
}
async function columnsOf(conn, table) {
  const [rows] = await conn.query(
    'SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table]
  );
  return new Set(rows.map((r) => r.c));
}
async function count(conn, sql, params = []) {
  const [[row]] = await conn.query(sql, params);
  return Number(row.n || 0);
}

async function up(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS data_resets (
       name VARCHAR(100) NOT NULL PRIMARY KEY,
       run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       summary TEXT NULL
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  const [[done]] = await conn.query('SELECT name FROM data_resets WHERE name = ?', [NAME]);
  if (done) return;

  // 1. Backup copies (kept until someone drops them).
  for (const table of BACKUP_TABLES) {
    if (!(await tableExists(conn, table))) continue;
    const backup = `${BACKUP_PREFIX}${table}`;
    if (!(await tableExists(conn, backup))) {
      await conn.query(`CREATE TABLE \`${backup}\` AS SELECT * FROM \`${table}\``);
    }
  }

  const summary = {};
  const run = async (label, sql, params = []) => {
    const [result] = await conn.query(sql, params);
    summary[label] = result.affectedRows || 0;
  };
  const has = async (table) => tableExists(conn, table);

  await conn.beginTransaction();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // 2. Finance entries created by stock flows.
    const expenseCols = await columnsOf(conn, 'expenses');
    const machineExpenseIds = (await has('tool_allocations'))
      ? 'OR id IN (SELECT expense_id FROM (SELECT expense_id FROM tool_allocations WHERE expense_id IS NOT NULL) x)'
      : '';
    await run(
      'expenses',
      `DELETE FROM expenses WHERE source_type IN (?) ${expenseCols.has('tool_unit_id') ? 'OR tool_unit_id IS NOT NULL' : ''} ${machineExpenseIds}`,
      [STOCK_EXPENSE_SOURCES]
    );
    if (await has('vendor_payments')) {
      await run('vendor_payments', 'DELETE FROM vendor_payments WHERE procurement_request_id IS NOT NULL');
    }

    // 3. Daily work logs: keep the work, drop the material used.
    const dwu = await columnsOf(conn, 'daily_work_updates');
    const sets = ['material_id = NULL', 'quantity_used = 0', 'warehouse_transaction_id = NULL'];
    if (dwu.has('unit_cost')) sets.push('unit_cost = NULL');
    if (dwu.has('material_cost')) sets.push('material_cost = NULL');
    if (dwu.has('litres_used')) sets.push('litres_used = NULL');
    await run(
      'daily_work_updates (material removed)',
      `UPDATE daily_work_updates SET ${sets.join(', ')} WHERE material_id IS NOT NULL OR warehouse_transaction_id IS NOT NULL`
    );
    await run(
      'daily_work_updates (expense link removed)',
      'UPDATE daily_work_updates SET expense_id = NULL WHERE expense_id IS NOT NULL AND expense_id NOT IN (SELECT id FROM expenses)'
    );

    // 4. Procurement, movements and stock.
    for (const table of ['procurement_receipts', 'procurement_requests', 'procurement_batches',
      'material_movements', 'warehouse_transactions', 'warehouse_stock', 'material_entries']) {
      if (await has(table)) await run(table, `DELETE FROM \`${table}\``);
    }

    // 5. Machines: allocations and rentals came from procurement.
    if (await has('tool_allocations')) await run('tool_allocations', 'DELETE FROM tool_allocations');
    if (await has('tool_rentals')) await run('tool_rentals', 'DELETE FROM tool_rentals');
    if (await has('tool_units')) {
      if (await has('tool_unit_history')) {
        await run('tool_unit_history (rented units)', "DELETE FROM tool_unit_history WHERE unit_id IN (SELECT id FROM (SELECT id FROM tool_units WHERE ownership_type = 'rented') x)");
      }
      await run('tool_units (rented, removed)', "DELETE FROM tool_units WHERE ownership_type = 'rented'");
      const [[central]] = await conn.query("SELECT id FROM warehouses WHERE type = 'central' ORDER BY id LIMIT 1");
      await run(
        'tool_units (back to Central)',
        `UPDATE tool_units SET current_contractor_id = NULL, current_project_id = NULL, current_site_id = NULL,
                current_task_id = NULL, procurement_request_id = NULL, warehouse_id = ?,
                availability_status = CASE WHEN availability_status IN ('maintenance', 'retired') THEN availability_status ELSE 'available' END`,
        [central ? central.id : null]
      );
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await conn.query('INSERT INTO data_resets (name, summary) VALUES (?, ?)', [NAME, JSON.stringify(summary)]);
    await conn.commit();
    console.log(`[data reset] ${NAME}: ${JSON.stringify(summary)}`);
  } catch (error) {
    await conn.rollback();
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    throw error;
  }
}

module.exports = { up, NAME, count };
