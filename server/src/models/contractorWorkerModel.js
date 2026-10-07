'use strict';

const { pool } = require('../config/db');

/**
 * Read/write access for a contractor's own labour roster. Every query here
 * that lists or mutates workers takes an explicit `contractorId` filter —
 * callers (the service layer) are responsible for passing the signed-in
 * contractor's own id when the caller is a CONTRACTOR, never a value taken
 * from the request body.
 */

const LIST_SELECT = `
  SELECT
    w.id, w.contractor_id, w.worker_code, w.full_name, w.phone, w.aadhaar_number, w.skill_category,
    w.daily_rate, w.status, w.joining_date, w.notes, w.created_at, w.updated_at,
    c.name AS contractor_name,
    COALESCE(active_assign.total, 0) AS active_assignment_count,
    curr_assign.project_name,
    curr_assign.project_code,
    curr_assign.site_name,
    curr_assign.work_notes
  FROM contractor_workers w
  JOIN contractors c ON c.id = w.contractor_id
  LEFT JOIN (
    SELECT contractor_worker_id, COUNT(*) AS total
    FROM labour_assignments
    WHERE status = 'active' AND contractor_worker_id IS NOT NULL
    GROUP BY contractor_worker_id
  ) active_assign ON active_assign.contractor_worker_id = w.id
  LEFT JOIN (
    SELECT
      la1.contractor_worker_id,
      MAX(p1.name) AS project_name,
      MAX(p1.code) AS project_code,
      MAX(s1.name) AS site_name,
      MAX(la1.notes) AS work_notes
    FROM labour_assignments la1
    JOIN projects p1 ON p1.id = la1.project_id
    LEFT JOIN sites s1 ON s1.id = la1.site_id
    WHERE la1.status = 'active'
    GROUP BY la1.contractor_worker_id
  ) curr_assign ON curr_assign.contractor_worker_id = w.id
`;

function buildFilters({ contractorId, search, status, skillCategory }) {
  const where = [];
  const params = [];

  // Ownership filter — always applied when provided. The service layer
  // supplies this unconditionally for a CONTRACTOR caller.
  if (contractorId) {
    where.push('w.contractor_id = ?');
    params.push(Number(contractorId));
  }
  if (search) {
    where.push('(w.full_name LIKE ? OR w.worker_code LIKE ? OR w.phone LIKE ?)');
    params.push(...Array(3).fill(`%${search}%`));
  }
  if (status && status !== 'all') {
    where.push('w.status = ?');
    params.push(status);
  }
  if (skillCategory && skillCategory !== 'all') {
    where.push('w.skill_category = ?');
    params.push(skillCategory);
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function findAll({ page = 1, pageSize = 10, ...filters }) {
  const { whereSql, params } = buildFilters(filters);
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query(
    `${LIST_SELECT} ${whereSql} ORDER BY w.full_name LIMIT ? OFFSET ?`,
    [...params, Number(pageSize), Number(offset)]
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM contractor_workers w ${whereSql}`,
    params
  );

  return { rows, total };
}

/** Fetches one worker, optionally constrained to a contractor — pass
 * `contractorId` for a CONTRACTOR caller so a cross-contractor id 404s
 * instead of ever returning another contractor's worker. */
async function findById(id, contractorId = null) {
  const where = contractorId ? 'w.id = ? AND w.contractor_id = ?' : 'w.id = ?';
  const params = contractorId ? [id, contractorId] : [id];
  const [rows] = await pool.query(`${LIST_SELECT} WHERE ${where} LIMIT 1`, params);
  return rows[0] || null;
}

async function findByCode(code) {
  const [rows] = await pool.query('SELECT id FROM contractor_workers WHERE worker_code = ? LIMIT 1', [code]);
  return rows[0] || null;
}

/** Highest worker code number in play, so a generated CW-#### never collides. */
async function nextCodeNumber() {
  const [rows] = await pool.query(
    `SELECT GREATEST(
              COALESCE(MAX(CASE WHEN worker_code REGEXP '^CW-[0-9]+$'
                                THEN CAST(SUBSTRING(worker_code, 4) AS UNSIGNED) END), 0),
              COALESCE(MAX(id), 0)
            ) AS max_num
     FROM contractor_workers`
  );
  return Number(rows[0]?.max_num || 0) + 1;
}

const WRITABLE = [
  'contractor_id', 'worker_code', 'full_name', 'phone', 'aadhaar_number', 'skill_category',
  'daily_rate', 'status', 'joining_date', 'notes',
];

async function create(payload) {
  const columns = WRITABLE.filter((key) => payload[key] !== undefined);
  const [result] = await pool.query(
    `INSERT INTO contractor_workers (${columns.map((c) => `\`${c}\``).join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((key) => payload[key])
  );
  return result.insertId;
}

async function update(id, payload) {
  const columns = WRITABLE.filter((key) => payload[key] !== undefined && key !== 'contractor_id');
  if (columns.length === 0) return;
  await pool.query(
    `UPDATE contractor_workers SET ${columns.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((key) => payload[key]), id]
  );
}

/** Distinct skill categories in use, for the list filter dropdown. */
async function findSkillCategories() {
  const [rows] = await pool.query(
    "SELECT DISTINCT skill_category FROM contractor_workers WHERE skill_category <> '' ORDER BY skill_category"
  );
  return rows.map((row) => row.skill_category);
}

module.exports = {
  findAll, findById, findByCode, nextCodeNumber, create, update, findSkillCategories,
};
