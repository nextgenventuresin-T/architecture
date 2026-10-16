'use strict';

/**
 * Migration 20261014 — Project Managers on tasks, site areas, vendor city,
 * transport cost allocation and direct vendor-to-site delivery costs.
 *
 *   vendors.city                         city-wise vendor search / filter
 *   project_areas                        area / floor / room / zone master per project (optionally per site)
 *   project_tasks.area_id                 area-wise tasks
 *   project_tasks.assigned_manager_id     project manager the task is assigned to (employees.id)
 *   task_subtasks.area_id / assigned_manager_id
 *   procurement_requests.area_id          area-wise material / tool tracking
 *   procurement_requests.transport_cost   freight quoted on a vendor delivery
 *   procurement_receipts.transport_cost   freight actually paid for one delivery
 *   procurement_receipts.transport_expense_id
 *
 * Transport expenses already booked for MACHINE shipments are re-labelled
 * 'Machine Transport' so they count under Machines instead of Miscellaneous.
 * The amount, the expense row and its EXP-TR-<id> number are unchanged, so
 * nothing is counted twice.
 *
 * Idempotent and purely additive: no column is dropped, renamed or re-typed.
 */

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
    [table, index]
  );
  return rows.length > 0;
}

async function addColumn(conn, table, column, definition) {
  if (!(await columnExists(conn, table, column))) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function addIndex(conn, table, index, columns) {
  if (!(await indexExists(conn, table, index))) {
    await conn.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${columns})`);
  }
}

async function up(conn) {
  // ---- Vendors: city
  await addColumn(conn, 'vendors', 'city', 'VARCHAR(100) NULL AFTER `address`');
  await addIndex(conn, 'vendors', 'idx_vendors_city', '`city`');

  // ---- Areas (area / floor / room / zone / block) per project, optionally per site
  await conn.query(`
    CREATE TABLE IF NOT EXISTS project_areas (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id INT UNSIGNED NOT NULL,
      site_id INT UNSIGNED NULL,
      parent_id INT UNSIGNED NULL,
      name VARCHAR(150) NOT NULL,
      area_type VARCHAR(20) NOT NULL DEFAULT 'area',
      description VARCHAR(255) NULL,
      sort_order INT UNSIGNED NOT NULL DEFAULT 0,
      created_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_project_areas_project (project_id),
      KEY idx_project_areas_site (site_id),
      KEY idx_project_areas_parent (parent_id),
      UNIQUE KEY uq_project_area_name (project_id, site_id, parent_id, name),
      CONSTRAINT fk_project_areas_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
      CONSTRAINT fk_project_areas_site FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE,
      CONSTRAINT fk_project_areas_parent FOREIGN KEY (parent_id) REFERENCES project_areas (id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ---- Tasks / subtasks: area + assigned project manager
  for (const table of ['project_tasks', 'task_subtasks']) {
    await addColumn(conn, table, 'area_id', 'INT UNSIGNED NULL');
    await addColumn(conn, table, 'assigned_manager_id', 'INT UNSIGNED NULL');
    await addIndex(conn, table, `idx_${table}_area`, '`area_id`');
    await addIndex(conn, table, `idx_${table}_manager`, '`assigned_manager_id`');
  }

  // ---- Procurement: area + transport
  await addColumn(conn, 'procurement_requests', 'area_id', 'INT UNSIGNED NULL');
  await addColumn(conn, 'procurement_requests', 'transport_cost', 'DECIMAL(12,2) NULL');
  await addIndex(conn, 'procurement_requests', 'idx_procurement_requests_area', '`area_id`');
  await addColumn(conn, 'procurement_receipts', 'transport_cost', 'DECIMAL(12,2) NOT NULL DEFAULT 0.00');
  await addColumn(conn, 'procurement_receipts', 'transport_expense_id', 'INT UNSIGNED NULL');

  // ---- Machine shipments' freight belongs under Machines, not Miscellaneous.
  await conn.query(
    `UPDATE expenses e
     JOIN material_movements mm ON mm.id = e.source_id
     SET e.category = 'Machine Transport'
     WHERE e.source_type = 'material_transport' AND e.category = 'Material Transport'
       AND (mm.item_type = 'tool' OR (mm.material_id IS NULL AND mm.tool_id IS NOT NULL))`
  );
}

module.exports = { up };
