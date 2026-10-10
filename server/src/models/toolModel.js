'use strict';

const { pool } = require('../config/db');

async function findAll({ search, type, status, page = 1, pageSize = 50 } = {}) {
  const where = [];
  const params = [];

  if (search) {
    where.push('(t.name LIKE ? OR t.code LIKE ? OR t.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (type && type !== 'all') {
    where.push('t.type = ?');
    params.push(type);
  }
  if (status && status !== 'all') {
    where.push('t.status = ?');
    params.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT
       t.id, t.code, t.name, t.type, t.description, t.status, t.created_at,
       t.total_quantity, t.ownership_type, t.default_charge_rate, t.rental_rate,
       (SELECT COUNT(*) FROM tool_units u WHERE u.tool_id = t.id AND u.availability_status <> 'retired') AS unit_total,
       (SELECT COUNT(*) FROM tool_units u WHERE u.tool_id = t.id AND u.availability_status = 'allocated') AS allocated_quantity,
       (SELECT COUNT(*) FROM tool_units u WHERE u.tool_id = t.id AND u.availability_status = 'available') AS available_quantity,
       (SELECT COUNT(*) FROM tool_units u WHERE u.tool_id = t.id AND u.availability_status = 'maintenance') AS maintenance_quantity
     FROM tools t ${whereSql}
     ORDER BY t.name ASC LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM tools t ${whereSql}`,
    params
  );

  return {
    rows: rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      description: r.description,
      status: r.status,
      totalQuantity: Number(r.unit_total || 0),
      maintenanceQuantity: Number(r.maintenance_quantity || 0),
      ownershipType: r.ownership_type || 'owned',
      defaultChargeRate: Number(r.default_charge_rate || 0),
      rentalRate: Number(r.rental_rate || 0),
      allocatedQuantity: Number(r.allocated_quantity || 0),
      availableQuantity: Number(r.available_quantity || 0),
      createdAt: r.created_at,
    })),
    total,
  };
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT
       t.id, t.code, t.name, t.type, t.description, t.status, t.created_at,
       t.total_quantity, t.ownership_type, t.default_charge_rate, t.rental_rate,
       (SELECT COUNT(*) FROM tool_units u WHERE u.tool_id = t.id AND u.availability_status <> 'retired') AS unit_total,
       (SELECT COUNT(*) FROM tool_units u WHERE u.tool_id = t.id AND u.availability_status = 'allocated') AS allocated_quantity,
       (SELECT COUNT(*) FROM tool_units u WHERE u.tool_id = t.id AND u.availability_status = 'available') AS available_quantity,
       (SELECT COUNT(*) FROM tool_units u WHERE u.tool_id = t.id AND u.availability_status = 'maintenance') AS maintenance_quantity
     FROM tools t
     WHERE t.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];

  // Active allocations / holders (per serial number)
  const [holders] = await pool.query(
    `SELECT
       a.id, a.task_id, a.project_id, a.site_id, a.contractor_id, a.unit_id, u.serial_number,
       DATE_FORMAT(a.start_date, '%Y-%m-%d') AS start_date,
       DATE_FORMAT(a.expected_return_date, '%Y-%m-%d') AS end_date,
       c.name AS contractor_name,
       p.name AS project_name, p.code AS project_code,
       s.name AS site_name,
       pt.name AS task_name
     FROM tool_allocations a
     JOIN tool_units u ON u.id = a.unit_id
     LEFT JOIN contractors c ON c.id = a.contractor_id
     LEFT JOIN projects p ON p.id = a.project_id
     LEFT JOIN sites s ON s.id = a.site_id
     LEFT JOIN project_tasks pt ON pt.id = a.task_id
     WHERE a.tool_id = ? AND a.status = 'active'
     ORDER BY a.id DESC`,
    [id]
  );

  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    description: r.description,
    status: r.status,
    totalQuantity: Number(r.unit_total || 0),
    maintenanceQuantity: Number(r.maintenance_quantity || 0),
    ownershipType: r.ownership_type || 'owned',
    defaultChargeRate: Number(r.default_charge_rate || 0),
    rentalRate: Number(r.rental_rate || 0),
    allocatedQuantity: Number(r.allocated_quantity || 0),
    availableQuantity: Number(r.available_quantity || 0),
    currentHolders: holders.map((h) => ({
      id: h.id,
      taskId: h.task_id,
      taskName: h.task_name,
      projectId: h.project_id,
      projectName: h.project_name,
      projectCode: h.project_code,
      siteId: h.site_id,
      siteName: h.site_name,
      contractorId: h.contractor_id,
      contractorName: h.contractor_name || 'Direct',
      unitId: h.unit_id,
      serialNumber: h.serial_number,
      quantity: 1,
      startDate: h.start_date,
      endDate: h.end_date,
    })),
    createdAt: r.created_at,
  };
}

async function checkAvailability(toolId, requestedQuantity = 1) {
  const tool = await findById(toolId);
  if (!tool) return null;
  const reqQty = Number(requestedQuantity || 1);
  return {
    isAvailable: tool.availableQuantity >= reqQty,
    availableQuantity: tool.availableQuantity,
    totalQuantity: tool.totalQuantity,
    allocatedQuantity: tool.allocatedQuantity,
    requestedQuantity: reqQty,
    currentHolders: tool.currentHolders,
  };
}

async function findByName(name) {
  const [rows] = await pool.query('SELECT id FROM tools WHERE name = ? LIMIT 1', [name]);
  return rows[0] || null;
}

async function nextCode() {
  const [rows] = await pool.query(
    "SELECT code FROM tools WHERE code LIKE 'TOOL-%' ORDER BY id DESC LIMIT 1"
  );
  if (!rows.length) return 'TOOL-0001';
  const match = rows[0].code.match(/TOOL-(\d+)/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `TOOL-${String(num).padStart(4, '0')}`;
}

async function create({ code, name, type, description, status = 'active', total_quantity = 1, ownership_type = 'owned', default_charge_rate = 0, rental_rate = 0 }) {
  const assignedCode = code || (await nextCode());
  const [result] = await pool.query(
    'INSERT INTO tools (code, name, type, description, status, total_quantity, ownership_type, default_charge_rate, rental_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [assignedCode, name, type, description || null, status, total_quantity || 1, ownership_type || 'owned', default_charge_rate || 0, rental_rate || 0]
  );
  return result.insertId;
}

async function update(id, { name, type, description, status, total_quantity, ownership_type, default_charge_rate, rental_rate }) {
  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (type !== undefined) { updates.push('type = ?'); params.push(type); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (total_quantity !== undefined) { updates.push('total_quantity = ?'); params.push(Number(total_quantity)); }
  if (ownership_type !== undefined) { updates.push('ownership_type = ?'); params.push(ownership_type); }
  if (default_charge_rate !== undefined) { updates.push('default_charge_rate = ?'); params.push(Number(default_charge_rate)); }
  if (rental_rate !== undefined) { updates.push('rental_rate = ?'); params.push(Number(rental_rate)); }

  if (!updates.length) return;
  await pool.query(`UPDATE tools SET ${updates.join(', ')} WHERE id = ?`, [...params, id]);
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM tools WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function allocateTool({ taskId, projectId, siteId, contractorId, toolId, toolName, rentalType, quantity = 1, cost = 0, totalCost = 0, startDate, endDate, requestedBy }) {
  const [res] = await pool.query(
    `INSERT INTO task_tools
       (task_id, project_id, site_id, contractor_id, tool_id, tool_name, rental_type, quantity, cost, total_cost, start_date, end_date, requested_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'allocated')`,
    [
      taskId || null,
      projectId || null,
      siteId || null,
      contractorId || null,
      toolId,
      toolName,
      rentalType || 'owned',
      Number(quantity || 1),
      Number(cost || 0),
      Number(totalCost || 0),
      startDate || null,
      endDate || null,
      requestedBy || null,
    ]
  );
  return res.insertId;
}

async function returnTool(assignmentId) {
  await pool.query("UPDATE task_tools SET status = 'returned' WHERE id = ?", [Number(assignmentId)]);
  return true;
}

module.exports = {
  findAll,
  findById,
  findByName,
  checkAvailability,
  allocateTool,
  returnTool,
  create,
  update,
  remove,
  nextCode,
};
