'use strict';

const { pool } = require('../config/db');

const SITE_SELECT = `
  SELECT s.*, p.name AS project_name, p.code AS project_code,
         e.full_name AS site_engineer_name, e.phone AS site_engineer_phone,
         c.name AS contractor_name, c.phone AS contractor_phone
  FROM sites s
  JOIN projects p ON p.id = s.project_id
  LEFT JOIN employees e ON e.id = s.site_engineer_id
  LEFT JOIN contractors c ON c.id = s.contractor_id
`;

async function findById(id) {
  const [rows] = await pool.query(`${SITE_SELECT} WHERE s.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

const WRITABLE = ['project_id', 'name', 'address', 'site_engineer_id', 'contractor_id', 'labour_count', 'progress', 'status', 'safety_status'];

async function create(payload) {
  const columns = WRITABLE.filter((k) => payload[k] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO sites (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((k) => payload[k])
  );
  return result.insertId;
}

async function update(id, payload) {
  const columns = WRITABLE.filter((k) => payload[k] !== undefined && k !== 'project_id');
  if (!columns.length) return;
  await pool.query(
    `UPDATE sites SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((k) => payload[k]), id]
  );
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM sites WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

/** Everything the site detail screen needs, in one round of queries. */
async function findSnapshot(siteId) {
  const [activities] = await pool.query(
    'SELECT * FROM site_activities WHERE site_id = ? ORDER BY activity_date DESC LIMIT 30',
    [siteId]
  );
  const [labour] = await pool.query(
    `SELECT l.*, c.name AS contractor_name, (l.present_count * l.daily_rate) AS daily_cost
     FROM labour_records l LEFT JOIN contractors c ON c.id = l.contractor_id
     WHERE l.site_id = ? ORDER BY l.record_date DESC, l.id`,
    [siteId]
  );
  const [materials] = await pool.query(
    `SELECT me.*, m.name AS material_name, m.unit, m.category,
            (me.quantity - me.used_quantity) AS remaining_quantity,
            (me.quantity * me.rate) AS total_cost
     FROM material_entries me JOIN materials m ON m.id = me.material_id
     WHERE me.site_id = ? ORDER BY me.received_date DESC`,
    [siteId]
  );
  const [issues] = await pool.query(
    `SELECT * FROM project_issues WHERE site_id = ?
     ORDER BY FIELD(status,'open','resolved'), FIELD(severity,'high','medium','low'), raised_on DESC`,
    [siteId]
  );
  const [tasks] = await pool.query(
    `SELECT t.*,
            (SELECT COUNT(*) FROM task_worker_logs twl WHERE twl.task_id = t.id) AS worker_count,
            (SELECT COALESCE(SUM(twl.daily_wage * (twl.hours_worked / 8)), 0) FROM task_worker_logs twl WHERE twl.task_id = t.id) AS actual_labour_cost,
            (SELECT COALESCE(SUM(dwu.quantity_used * COALESCE(tm.cost_per_unit, 0)), 0)
             FROM daily_work_updates dwu
             LEFT JOIN task_materials tm ON tm.task_id = dwu.task_id AND tm.material_id = dwu.material_id
             WHERE dwu.task_id = t.id) AS actual_material_cost,
            (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE task_id = t.id AND status NOT IN ('rejected', 'cancelled')) AS actual_task_expenses,
            (SELECT COUNT(*) FROM daily_work_updates dwu WHERE dwu.task_id = t.id) AS updates_count
     FROM project_tasks t
     WHERE t.site_id = ?
     ORDER BY t.start_date ASC, t.id ASC`,
    [siteId]
  );
  const [[stats]] = await pool.query(
    `SELECT
       (SELECT COALESCE(SUM(present_count),0) FROM labour_records WHERE site_id = ? AND record_date = CURDATE()) AS today_attendance,
       (SELECT COALESCE(SUM(worker_count),0)  FROM labour_records WHERE site_id = ?) AS total_workers,
       (SELECT COALESCE(SUM(expenses),0)      FROM site_activities WHERE site_id = ?) AS total_daily_expenses,
       (SELECT COALESCE(SUM(quantity),0)      FROM material_entries WHERE site_id = ?) AS materials_received,
       (SELECT COALESCE(SUM(used_quantity),0) FROM material_entries WHERE site_id = ?) AS materials_consumed,
       (SELECT COUNT(*) FROM project_issues WHERE site_id = ? AND status = 'open') AS open_issues`,
    Array(6).fill(siteId)
  );

  return { activities, labour, materials, issues, tasks, stats };
}

// ------------------------------------------------------------- daily log

const ACTIVITY_FIELDS = [
  'site_id', 'activity_date', 'work_completed', 'labour_present', 'contractor_activity',
  'equipment_used', 'expenses', 'issues', 'notes', 'document_name', 'recorded_by',
];

async function createActivity(payload) {
  const columns = ACTIVITY_FIELDS.filter((k) => payload[k] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO site_activities (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((k) => payload[k])
  );
  return result.insertId;
}

async function findActivityById(id) {
  const [rows] = await pool.query('SELECT * FROM site_activities WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findActivityByDate(siteId, date) {
  const [rows] = await pool.query(
    'SELECT id FROM site_activities WHERE site_id = ? AND activity_date = ? LIMIT 1',
    [siteId, date]
  );
  return rows[0] || null;
}

module.exports = {
  findById, create, update, remove, findSnapshot,
  createActivity, findActivityById, findActivityByDate,
};
