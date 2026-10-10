'use strict';

const { pool } = require('../config/db');

async function createUpdate({
  project_id,
  site_id,
  contractor_id,
  task_id,
  phase_number,
  phase_title,
  subcategory,
  material_id,
  quantity_used,
  unit,
  warehouse_transaction_id,
  expense_id,
  work_date,
  work_done,
  work_status = 'in-progress',
  progress_percentage = 0,
  remarks,
  created_by,
  misc_description,
  misc_amount,
  misc_remarks,
  misc_receipt_path,
  tool_id,
  tool_name,
  tool_cost,
  tool_remarks,
  unit_cost,
  material_cost,
}) {
  const [result] = await pool.query(
    `INSERT INTO daily_work_updates
      (project_id, site_id, contractor_id, task_id, phase_number, phase_title, subcategory,
       material_id, quantity_used, unit, warehouse_transaction_id, expense_id,
       work_date, work_done, work_status, progress_percentage, remarks, created_by,
       misc_description, misc_amount, misc_remarks, misc_receipt_path,
       tool_id, tool_name, tool_cost, tool_remarks, unit_cost, material_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project_id,
      site_id || null,
      contractor_id,
      task_id || null,
      phase_number || null,
      phase_title || null,
      subcategory || null,
      material_id || null,
      quantity_used || null,
      unit || null,
      warehouse_transaction_id || null,
      expense_id || null,
      work_date,
      work_done,
      work_status,
      progress_percentage,
      remarks || null,
      created_by || null,
      misc_description || null,
      misc_amount ? Number(misc_amount) : 0,
      misc_remarks || null,
      misc_receipt_path || null,
      tool_id || null,
      tool_name || null,
      tool_cost ? Number(tool_cost) : 0,
      tool_remarks || null,
      unit_cost != null ? Number(unit_cost) : null,
      material_cost != null ? Number(material_cost) : null,
    ]
  );
  return result.insertId;
}

async function addPhoto({
  work_update_id,
  project_id,
  site_id,
  task_id,
  phase_number,
  subcategory,
  file_path,
  file_name,
  file_type,
  file_size,
}) {
  const [result] = await pool.query(
    `INSERT INTO daily_work_photos
      (work_update_id, project_id, site_id, task_id, phase_number, subcategory, file_path, file_name, file_type, file_size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      work_update_id,
      project_id,
      site_id,
      task_id || null,
      phase_number || null,
      subcategory || null,
      file_path,
      file_name,
      file_type,
      file_size,
    ]
  );
  return result.insertId;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT dwu.*, p.name AS project_name, p.code AS project_code,
            s.name AS site_name, c.name AS contractor_name, u.email AS created_by_email,
            pt.name AS task_name, pt.status AS task_status,
            m.name AS material_name, m.code AS material_code, m.category AS material_category,
            wt.transaction_number AS transaction_number
     FROM daily_work_updates dwu
     JOIN projects p ON p.id = dwu.project_id
     LEFT JOIN sites s ON s.id = dwu.site_id
     LEFT JOIN project_tasks pt ON pt.id = dwu.task_id
     JOIN contractors c ON c.id = dwu.contractor_id
     LEFT JOIN users u ON u.id = dwu.created_by
     LEFT JOIN materials m ON m.id = dwu.material_id
     LEFT JOIN warehouse_transactions wt ON wt.id = dwu.warehouse_transaction_id
     WHERE dwu.id = ? LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;

  const [photos] = await pool.query(
    'SELECT * FROM daily_work_photos WHERE work_update_id = ? ORDER BY id ASC',
    [id]
  );

  return { ...rows[0], photos };
}

async function findAll({ projectId, siteId, contractorId, taskId, date, pmProjectIds, page = 1, pageSize = 20 } = {}) {
  const where = [];
  const params = [];

  // Project Manager: only their assigned projects (deny-by-default).
  if (Array.isArray(pmProjectIds)) {
    if (pmProjectIds.length === 0) where.push('1 = 0');
    else { where.push(`dwu.project_id IN (${pmProjectIds.map(() => '?').join(',')})`); params.push(...pmProjectIds.map(Number)); }
  }

  if (projectId) {
    where.push('dwu.project_id = ?');
    params.push(Number(projectId));
  }
  if (siteId) {
    where.push('dwu.site_id = ?');
    params.push(Number(siteId));
  }
  if (contractorId) {
    where.push('dwu.contractor_id = ?');
    params.push(Number(contractorId));
  }
  if (taskId) {
    where.push('dwu.task_id = ?');
    params.push(Number(taskId));
  }
  if (date) {
    where.push('dwu.work_date = ?');
    params.push(date);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `SELECT dwu.*, p.name AS project_name, p.code AS project_code,
            s.name AS site_name, c.name AS contractor_name,
            pt.name AS task_name, pt.status AS task_status,
            m.name AS material_name, m.code AS material_code, m.category AS material_category,
            wt.transaction_number AS transaction_number
     FROM daily_work_updates dwu
     JOIN projects p ON p.id = dwu.project_id
     LEFT JOIN sites s ON s.id = dwu.site_id
     LEFT JOIN project_tasks pt ON pt.id = dwu.task_id
     JOIN contractors c ON c.id = dwu.contractor_id
     LEFT JOIN materials m ON m.id = dwu.material_id
     LEFT JOIN warehouse_transactions wt ON wt.id = dwu.warehouse_transaction_id
     ${whereSql}
     ORDER BY dwu.work_date DESC, dwu.id DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM daily_work_updates dwu ${whereSql}`,
    params
  );

  const ids = rows.map((r) => r.id);
  let photos = [];
  if (ids.length) {
    const [pRows] = await pool.query(
      `SELECT * FROM daily_work_photos WHERE work_update_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    photos = pRows;
  }

  return {
    rows: rows.map((r) => ({
      ...r,
      photos: photos.filter((p) => p.work_update_id === r.id),
    })),
    total,
  };
}

module.exports = { createUpdate, addPhoto, findById, findAll };
