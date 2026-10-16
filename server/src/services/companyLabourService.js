'use strict';

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const areaService = require('./areaService');
const pmScope = require('./pmScopeService');

/**
 * Company labour: workers the COMPANY engages and pays (not a contractor's own
 * workers). They live in contractor_workers with is_company_labour = 1 and no
 * contractor, so every existing worker picker keeps working.
 *
 * Admin / HR registers them and records their attendance against a project, site,
 * task (optionally subtask and area) with the day's wage. Each PRESENT / HALF_DAY
 * attendance produces exactly ONE costed task_worker_logs row
 * (worker_type 'company_attendance', attendance_id set). That ledger is what every
 * labour total reads, so company labour cost appears in task planning, Budget vs
 * Actual, project cost and profitability - once. A contractor mentioning the same
 * company worker on their daily work for that day is merged into it, never added.
 */
const STATUSES = { PRESENT: 1, HALF_DAY: 0.5, ABSENT: 0, LEAVE: 0 };
const COSTED_TYPE = 'company_attendance';

const num = (v) => Number(Number(v || 0).toFixed(2));
const COMPANY_WHERE = "(w.is_company_labour = 1 OR w.worker_type = 'company_labour')";

function toWorker(r) {
  return {
    id: r.id,
    code: r.worker_code,
    name: r.full_name,
    phone: r.phone || null,
    skill: r.skill_category || 'general',
    dailyRate: num(r.daily_rate),
    aadhaarNumber: r.aadhaar_number || null,
    joiningDate: r.joining_date || null,
    status: r.status,
    notes: r.notes || null,
    label: `${r.full_name}${r.phone ? ` (${r.phone})` : ''}`,
    daysWorked: r.days_worked != null ? num(r.days_worked) : undefined,
    totalWages: r.total_wages != null ? num(r.total_wages) : undefined,
    lastWorked: r.last_worked || null,
  };
}

const STATS_SELECT = `
  (SELECT COALESCE(SUM(l.hours_worked / 8), 0) FROM task_worker_logs l WHERE l.worker_id = w.id AND l.attendance_id IS NOT NULL) AS days_worked,
  (SELECT COALESCE(SUM(l.hours_worked / 8 * l.daily_wage), 0) FROM task_worker_logs l WHERE l.worker_id = w.id AND l.attendance_id IS NOT NULL) AS total_wages,
  (SELECT MAX(l.work_date) FROM task_worker_logs l WHERE l.worker_id = w.id AND l.attendance_id IS NOT NULL) AS last_worked`;

async function listWorkers({ search = '', status = 'all' } = {}) {
  const where = [COMPANY_WHERE];
  const params = [];
  if (status && status !== 'all') { where.push('w.status = ?'); params.push(status); }
  for (const word of String(search || '').trim().split(/\s+/).filter(Boolean).slice(0, 6)) {
    where.push('(w.full_name LIKE ? OR w.phone LIKE ? OR w.worker_code LIKE ? OR w.skill_category LIKE ?)');
    const q = `%${word}%`;
    params.push(q, q, q, q);
  }
  const [rows] = await pool.query(
    `SELECT w.*, ${STATS_SELECT} FROM contractor_workers w WHERE ${where.join(' AND ')} ORDER BY w.status = 'active' DESC, w.full_name`,
    params
  );
  return rows.map(toWorker);
}

async function findCompanyWorker(id, conn = pool) {
  const [[row]] = await conn.query(`SELECT w.*, ${STATS_SELECT} FROM contractor_workers w WHERE w.id = ? AND ${COMPANY_WHERE}`, [Number(id)]);
  return row || null;
}

async function getWorker(id) {
  const row = await findCompanyWorker(id);
  if (!row) throw ApiError.notFound('That company worker does not exist.');
  const [history] = await pool.query(
    `SELECT a.id, a.attendance_date, a.status, a.daily_wage, a.remarks,
            p.name AS project_name, s.name AS site_name, t.name AS task_name, st.name AS subtask_name,
            ar.name AS area_name, par.name AS area_parent_name, l.hours_worked
     FROM attendance_records a
     LEFT JOIN projects p ON p.id = a.project_id
     LEFT JOIN sites s ON s.id = a.site_id
     LEFT JOIN project_tasks t ON t.id = a.task_id
     LEFT JOIN task_subtasks st ON st.id = a.subtask_id
     LEFT JOIN project_areas ar ON ar.id = a.area_id
     LEFT JOIN project_areas par ON par.id = ar.parent_id
     LEFT JOIN task_worker_logs l ON l.id = a.worker_log_id
     WHERE a.contractor_worker_id = ? AND a.labour_type = 'company_labour'
     ORDER BY a.attendance_date DESC, a.id DESC LIMIT 500`,
    [Number(id)]
  );
  return {
    worker: toWorker(row),
    attendance: history.map((h) => ({
      id: h.id,
      date: h.attendance_date,
      status: h.status,
      days: STATUSES[h.status] ?? 0,
      dailyWage: num(h.daily_wage),
      amount: num((STATUSES[h.status] ?? 0) * Number(h.daily_wage || 0)),
      projectName: h.project_name, siteName: h.site_name, taskName: h.task_name, subtaskName: h.subtask_name,
      areaName: h.area_name ? (h.area_parent_name ? `${h.area_parent_name} › ${h.area_name}` : h.area_name) : null,
      remarks: h.remarks,
    })),
  };
}

function cleanWorker(payload, existing = null) {
  const name = payload.name !== undefined || payload.full_name !== undefined ? String(payload.name ?? payload.full_name ?? '').trim() : existing?.full_name;
  if (!name) throw ApiError.badRequest('Check the highlighted fields.', { name: 'Enter the worker name.' });
  const phone = payload.phone !== undefined ? (String(payload.phone || '').trim() || null) : (existing?.phone ?? null);
  const rateRaw = payload.dailyRate ?? payload.daily_rate;
  const dailyRate = rateRaw !== undefined && rateRaw !== '' ? Number(rateRaw) : Number(existing?.daily_rate || 0);
  if (!Number.isFinite(dailyRate) || dailyRate < 0) throw ApiError.badRequest('Check the highlighted fields.', { dailyRate: 'Enter a valid daily wage.' });
  const status = payload.status ?? existing?.status ?? 'active';
  if (!['active', 'inactive'].includes(status)) throw ApiError.badRequest('Check the highlighted fields.', { status: 'Choose active or inactive.' });
  return {
    full_name: name.slice(0, 150),
    phone: phone ? phone.slice(0, 30) : null,
    skill_category: String(payload.skill ?? payload.skill_category ?? existing?.skill_category ?? 'general').trim().slice(0, 80) || 'general',
    daily_rate: dailyRate,
    aadhaar_number: payload.aadhaarNumber !== undefined || payload.aadhaar_number !== undefined
      ? (String(payload.aadhaarNumber ?? payload.aadhaar_number ?? '').trim() || null) : (existing?.aadhaar_number ?? null),
    joining_date: payload.joiningDate !== undefined || payload.joining_date !== undefined
      ? (payload.joiningDate ?? payload.joining_date ?? null) || null : (existing?.joining_date ?? null),
    status,
    notes: payload.notes !== undefined ? (String(payload.notes || '').trim() || null) : (existing?.notes ?? null),
  };
}

async function assertPhoneFree(phone, exceptId = 0) {
  if (!phone) return;
  const [[dupe]] = await pool.query(
    `SELECT w.id, w.full_name FROM contractor_workers w WHERE ${COMPANY_WHERE} AND w.phone = ? AND w.id <> ? LIMIT 1`,
    [phone, exceptId]
  );
  if (dupe) throw ApiError.badRequest('Check the highlighted fields.', { phone: `This phone is already registered to ${dupe.full_name}.` });
}

async function createWorker(payload) {
  const row = cleanWorker(payload);
  await assertPhoneFree(row.phone);
  const [[next]] = await pool.query(
    "SELECT COALESCE(MAX(CAST(SUBSTRING(worker_code, 4) AS UNSIGNED)), 0) + 1 AS n FROM contractor_workers WHERE worker_code REGEXP '^CL-[0-9]+$'"
  );
  const [res] = await pool.query(
    `INSERT INTO contractor_workers (contractor_id, worker_type, is_company_labour, worker_code, full_name, phone, aadhaar_number,
       skill_category, daily_rate, status, joining_date, notes)
     VALUES (NULL, 'company_labour', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [`CL-${String(next.n).padStart(4, '0')}`, row.full_name, row.phone, row.aadhaar_number, row.skill_category, row.daily_rate, row.status, row.joining_date, row.notes]
  );
  return toWorker(await findCompanyWorker(res.insertId));
}

async function updateWorker(id, payload) {
  const existing = await findCompanyWorker(id);
  if (!existing) throw ApiError.notFound('That company worker does not exist.');
  const row = cleanWorker(payload, existing);
  await assertPhoneFree(row.phone, Number(id));
  await pool.query(
    `UPDATE contractor_workers SET full_name = ?, phone = ?, aadhaar_number = ?, skill_category = ?, daily_rate = ?, status = ?,
       joining_date = ?, notes = ? WHERE id = ?`,
    [row.full_name, row.phone, row.aadhaar_number, row.skill_category, row.daily_rate, row.status, row.joining_date, row.notes, Number(id)]
  );
  return toWorker(await findCompanyWorker(id));
}

/** Active company labour for the contractor's "Company labour" dropdown: name (phone) only, no wages. */
async function lookup() {
  const [rows] = await pool.query(
    `SELECT w.id, w.worker_code, w.full_name, w.phone, w.skill_category FROM contractor_workers w
     WHERE ${COMPANY_WHERE} AND w.status = 'active' ORDER BY w.full_name`
  );
  return rows.map((r) => ({
    id: r.id, code: r.worker_code, name: r.full_name, phone: r.phone || null, skill: r.skill_category || 'general',
    label: `${r.full_name}${r.phone ? ` (${r.phone})` : ''}`,
  }));
}

/** The costed labour line for a company worker: their skill, never a 'company…' label (that means "not costed"). */
const costedLabourType = (skill) => {
  const s = String(skill || '').trim();
  if (!s || /company/i.test(s) || s.toLowerCase() === 'general') return 'General Labour';
  return s.slice(0, 100);
};

/**
 * Records company-labour attendance for one day at one project / site / task (and
 * optionally subtask / area), for one or many workers. Re-marking the same worker
 * on the same day updates that day (one attendance per worker per day).
 */
async function markAttendance(payload, actorUserId) {
  const date = String(payload.date || payload.attendance_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw ApiError.badRequest('Check the highlighted fields.', { date: 'Enter the attendance date.' });
  if (date > new Date().toISOString().slice(0, 10)) throw ApiError.badRequest('Check the highlighted fields.', { date: 'Attendance cannot be in the future.' });

  const projectId = Number(payload.project_id ?? payload.projectId);
  const siteId = payload.site_id ?? payload.siteId ? Number(payload.site_id ?? payload.siteId) : null;
  const taskId = Number(payload.task_id ?? payload.taskId);
  const subtaskId = payload.subtask_id ?? payload.subtaskId ? Number(payload.subtask_id ?? payload.subtaskId) : null;
  if (!projectId) throw ApiError.badRequest('Check the highlighted fields.', { project_id: 'Select the project.' });
  if (!taskId) throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'Select the task the labour worked on.' });

  const [[task]] = await pool.query('SELECT id, project_id, site_id, area_id FROM project_tasks WHERE id = ?', [taskId]);
  if (!task || Number(task.project_id) !== projectId) throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'That task does not belong to this project.' });
  const effectiveSite = siteId || task.site_id || null;
  if (siteId) {
    const [[site]] = await pool.query('SELECT project_id FROM sites WHERE id = ?', [siteId]);
    if (!site || Number(site.project_id) !== projectId) throw ApiError.badRequest('Check the highlighted fields.', { site_id: 'That site does not belong to this project.' });
    if (task.site_id && Number(task.site_id) !== siteId) throw ApiError.badRequest('Check the highlighted fields.', { task_id: 'That task belongs to a different site.' });
  }
  let subtask = null;
  if (subtaskId) {
    [[subtask]] = await pool.query('SELECT id, task_id, area_id FROM task_subtasks WHERE id = ?', [subtaskId]);
    if (!subtask || Number(subtask.task_id) !== taskId) throw ApiError.badRequest('Check the highlighted fields.', { subtask_id: 'That subtask does not belong to this task.' });
  }
  const areaId = payload.area_id ?? payload.areaId
    ? await areaService.assertAreaFor(payload.area_id ?? payload.areaId, projectId, effectiveSite)
    : (subtask?.area_id || task.area_id || null);

  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (!entries.length) throw ApiError.badRequest('Check the highlighted fields.', { entries: 'Add at least one worker.' });
  // Shown to the responsible contractor (days only) on their labour summary.
  const responsibleContractor = await pmScope.responsibleContractorId(projectId, effectiveSite).catch(() => null);

  const conn = await pool.getConnection();
  const saved = [];
  try {
    await conn.beginTransaction();
    for (const e of entries) {
      const workerId = Number(e.worker_id ?? e.workerId);
      const status = String(e.status || 'PRESENT').toUpperCase();
      if (!(status in STATUSES)) throw ApiError.badRequest('Check the highlighted fields.', { status: 'Use Present, Half day, Absent or Leave.' });
      const worker = await findCompanyWorker(workerId, conn);
      if (!worker) throw ApiError.badRequest('Check the highlighted fields.', { entries: `Worker #${workerId} is not company labour.` });
      const wageRaw = e.daily_wage ?? e.dailyWage;
      const wage = wageRaw !== undefined && wageRaw !== null && wageRaw !== '' ? Number(wageRaw) : Number(worker.daily_rate || 0);
      if (!Number.isFinite(wage) || wage < 0) throw ApiError.badRequest('Check the highlighted fields.', { entries: `Enter a valid wage for ${worker.full_name}.` });
      const fraction = STATUSES[status];
      const remarks = e.remarks ? String(e.remarks).trim().slice(0, 255) : null;

      const [[existing]] = await conn.query(
        'SELECT * FROM attendance_records WHERE contractor_worker_id = ? AND attendance_date = ? FOR UPDATE',
        [workerId, date]
      );
      let attendanceId;
      if (existing) {
        attendanceId = existing.id;
        await conn.query(
          `UPDATE attendance_records SET labour_type = 'company_labour', project_id = ?, site_id = ?, task_id = ?, subtask_id = ?, area_id = ?,
             status = ?, daily_wage = ?, remarks = ?, recorded_by = ?, contractor_id = ? WHERE id = ?`,
          [projectId, effectiveSite, taskId, subtaskId, areaId, status, wage, remarks, actorUserId || null, responsibleContractor, attendanceId]
        );
      } else {
        const [ins] = await conn.query(
          `INSERT INTO attendance_records (attendance_date, labour_type, contractor_worker_id, contractor_id, project_id, site_id, task_id,
             subtask_id, area_id, status, daily_wage, remarks, recorded_by)
           VALUES (?, 'company_labour', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [date, workerId, responsibleContractor, projectId, effectiveSite, taskId, subtaskId, areaId, status, wage, remarks, actorUserId || null]
        );
        attendanceId = ins.insertId;
      }

      // ---- the one costed labour log for this worker-day
      let logId = existing?.worker_log_id || null;
      if (logId) {
        const [[still]] = await conn.query('SELECT id FROM task_worker_logs WHERE id = ?', [logId]);
        if (!still) logId = null;
      }
      if (fraction > 0) {
        const values = [taskId, subtaskId, projectId, effectiveSite, null, workerId, COSTED_TYPE, worker.full_name,
          worker.worker_code, costedLabourType(worker.skill_category), date, 8 * fraction, wage, areaId, attendanceId];
        if (!logId) {
          // Merge the contractor's uncosted mention of this worker on this task/day, if any.
          const [[mention]] = await conn.query(
            `SELECT id FROM task_worker_logs WHERE worker_id = ? AND work_date = ? AND task_id = ? AND attendance_id IS NULL
               AND worker_type = 'company_labour' ORDER BY id LIMIT 1`,
            [workerId, date, taskId]
          );
          logId = mention?.id || null;
        }
        if (logId) {
          await conn.query(
            `UPDATE task_worker_logs SET task_id = ?, subtask_id = ?, project_id = ?, site_id = ?, contractor_id = ?, worker_id = ?,
               worker_type = ?, worker_name = ?, worker_code = ?, labour_type = ?, work_date = ?, hours_worked = ?, daily_wage = ?,
               area_id = ?, attendance_id = ? WHERE id = ?`,
            [...values, logId]
          );
        } else {
          const [log] = await conn.query(
            `INSERT INTO task_worker_logs (task_id, subtask_id, project_id, site_id, contractor_id, worker_id, worker_type, worker_name,
               worker_code, labour_type, work_date, hours_worked, daily_wage, area_id, attendance_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [...values, actorUserId || null]
          );
          logId = log.insertId;
        }
        // Any other uncosted mention of the same worker that day is the same day of work.
        await conn.query(
          `DELETE FROM task_worker_logs WHERE worker_id = ? AND work_date = ? AND attendance_id IS NULL
             AND worker_type = 'company_labour' AND daily_work_id IS NULL AND id <> ?`,
          [workerId, date, logId]
        );
        await conn.query('UPDATE attendance_records SET worker_log_id = ? WHERE id = ?', [logId, attendanceId]);
      } else if (logId) {
        await removeCostedLog(conn, logId);
        await conn.query('UPDATE attendance_records SET worker_log_id = NULL WHERE id = ?', [attendanceId]);
      }
      saved.push(attendanceId);
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  return listAttendance({ ids: saved });
}

/** A costed log that started as the contractor's daily-work mention goes back to an uncosted mention; otherwise it is removed. */
async function removeCostedLog(conn, logId) {
  const [[log]] = await conn.query('SELECT id, daily_work_id FROM task_worker_logs WHERE id = ?', [logId]);
  if (!log) return;
  if (log.daily_work_id) {
    await conn.query(
      "UPDATE task_worker_logs SET worker_type = 'company_labour', labour_type = 'Company Labour', daily_wage = 0, attendance_id = NULL WHERE id = ?",
      [logId]
    );
  } else {
    await conn.query('DELETE FROM task_worker_logs WHERE id = ?', [logId]);
  }
}

async function deleteAttendance(id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query("SELECT * FROM attendance_records WHERE id = ? AND labour_type = 'company_labour' FOR UPDATE", [id]);
    if (!row) throw ApiError.notFound('That attendance record does not exist.');
    if (row.worker_log_id) await removeCostedLog(conn, row.worker_log_id);
    await conn.query('DELETE FROM attendance_records WHERE id = ?', [id]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  return { id: Number(id) };
}

async function listAttendance({ ids, from, to, date, projectId, siteId, taskId, workerId, page = 1, pageSize = 100 } = {}) {
  const where = ["a.labour_type = 'company_labour'"];
  const params = [];
  if (ids) { where.push(ids.length ? 'a.id IN (?)' : '1 = 0'); params.push(ids); }
  if (date) { where.push('a.attendance_date = ?'); params.push(date); }
  if (from) { where.push('a.attendance_date >= ?'); params.push(from); }
  if (to) { where.push('a.attendance_date <= ?'); params.push(to); }
  if (projectId) { where.push('a.project_id = ?'); params.push(Number(projectId)); }
  if (siteId) { where.push('a.site_id = ?'); params.push(Number(siteId)); }
  if (taskId) { where.push('a.task_id = ?'); params.push(Number(taskId)); }
  if (workerId) { where.push('a.contractor_worker_id = ?'); params.push(Number(workerId)); }
  const size = Math.min(500, Math.max(1, Number(pageSize) || 100));
  const offset = (Math.max(1, Number(page) || 1) - 1) * size;
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM attendance_records a ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT a.*, w.full_name, w.phone, w.worker_code, p.name AS project_name, s.name AS site_name, t.name AS task_name,
            st.name AS subtask_name, ar.name AS area_name, par.name AS area_parent_name
     FROM attendance_records a
     JOIN contractor_workers w ON w.id = a.contractor_worker_id
     LEFT JOIN projects p ON p.id = a.project_id
     LEFT JOIN sites s ON s.id = a.site_id
     LEFT JOIN project_tasks t ON t.id = a.task_id
     LEFT JOIN task_subtasks st ON st.id = a.subtask_id
     LEFT JOIN project_areas ar ON ar.id = a.area_id
     LEFT JOIN project_areas par ON par.id = ar.parent_id
     ${whereSql}
     ORDER BY a.attendance_date DESC, w.full_name LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  const records = rows.map((r) => {
    const days = STATUSES[r.status] ?? 0;
    return {
      id: r.id,
      date: r.attendance_date,
      worker: { id: r.contractor_worker_id, name: r.full_name, phone: r.phone, code: r.worker_code },
      project: r.project_id ? { id: r.project_id, name: r.project_name } : null,
      site: r.site_id ? { id: r.site_id, name: r.site_name } : null,
      task: r.task_id ? { id: r.task_id, name: r.task_name } : null,
      subtask: r.subtask_id ? { id: r.subtask_id, name: r.subtask_name } : null,
      area: r.area_id ? { id: r.area_id, name: r.area_parent_name ? `${r.area_parent_name} › ${r.area_name}` : r.area_name } : null,
      status: r.status,
      days,
      dailyWage: num(r.daily_wage),
      amount: num(days * Number(r.daily_wage || 0)),
      remarks: r.remarks,
    };
  });
  return {
    records,
    totals: { days: num(records.reduce((s, r) => s + r.days, 0)), amount: num(records.reduce((s, r) => s + r.amount, 0)) },
    pagination: { page: Number(page) || 1, pageSize: size, total: Number(total), totalPages: Math.max(1, Math.ceil(Number(total) / size)) },
  };
}

// --------------------------------------------------------------- labour report

const COUNTED_LOG_SQL = "COALESCE(l.worker_type, 'daily_wage') NOT IN ('company_labour', 'company_employee') AND LOWER(COALESCE(l.labour_type, '')) NOT LIKE '%company%'";

/**
 * Project / site-wise labour report: one row per worker per task / subtask / area with
 * the dates worked, days, daily wage and cost - read from the same labour ledger the
 * finance totals use, so the report always reconciles with them.
 *
 * `forContractorId` limits it to that contractor's work and hides company-labour wages.
 */
async function labourReport({ projectId, siteId, taskId, areaId, workerKind = 'all', contractorId, from, to, search } = {}, { forContractorId = null } = {}) {
  const where = ['1 = 1'];
  const params = [];
  if (projectId) { where.push('l.project_id = ?'); params.push(Number(projectId)); }
  if (siteId) { where.push('l.site_id = ?'); params.push(Number(siteId)); }
  if (taskId) { where.push('l.task_id = ?'); params.push(Number(taskId)); }
  if (areaId) { where.push('(l.area_id = ? OR l.area_id IN (SELECT id FROM project_areas WHERE parent_id = ?))'); params.push(Number(areaId), Number(areaId)); }
  if (from) { where.push('l.work_date >= ?'); params.push(from); }
  if (to) { where.push('l.work_date <= ?'); params.push(to); }
  if (workerKind === 'company') where.push("l.worker_type IN ('company_attendance', 'company_labour')");
  if (workerKind === 'contractor') where.push("l.worker_type NOT IN ('company_attendance', 'company_labour', 'company_employee')");
  if (contractorId) { where.push('l.contractor_id = ?'); params.push(Number(contractorId)); }
  if (forContractorId) {
    // Their own workers, plus company labour Admin recorded on their sites.
    where.push(`(l.contractor_id = ? OR (l.attendance_id IS NOT NULL AND (l.site_id IN (SELECT id FROM sites WHERE contractor_id = ?)
      OR l.project_id IN (SELECT id FROM projects WHERE contractor_id = ?))))`);
    params.push(Number(forContractorId), Number(forContractorId), Number(forContractorId));
  }
  if (search && String(search).trim()) {
    where.push('(l.worker_name LIKE ? OR cw.phone LIKE ?)');
    params.push(`%${String(search).trim()}%`, `%${String(search).trim()}%`);
  }

  const [rows] = await pool.query(
    `SELECT
       COALESCE(l.worker_id, 0) AS worker_id, l.worker_name, MAX(cw.phone) AS phone, MAX(cw.worker_code) AS worker_code,
       MAX(l.worker_type) AS worker_type, MAX(cw.is_company_labour) AS is_company, MAX(c.name) AS contractor_name,
       l.project_id, MAX(p.name) AS project_name, l.site_id, MAX(s.name) AS site_name,
       l.task_id, MAX(t.name) AS task_name, l.subtask_id, MAX(st.name) AS subtask_name,
       l.area_id, MAX(ar.name) AS area_name, MAX(par.name) AS area_parent_name,
       MAX(l.labour_type) AS labour_type,
       MIN(l.work_date) AS first_date, MAX(l.work_date) AS last_date,
       GROUP_CONCAT(DISTINCT DATE_FORMAT(l.work_date, '%Y-%m-%d') ORDER BY l.work_date SEPARATOR ',') AS dates,
       SUM(l.hours_worked / 8) AS days,
       MAX(CASE WHEN ${COUNTED_LOG_SQL} THEN l.daily_wage END) AS daily_wage,
       SUM(CASE WHEN ${COUNTED_LOG_SQL} THEN l.hours_worked / 8 * l.daily_wage ELSE 0 END) AS amount
     FROM task_worker_logs l
     LEFT JOIN contractor_workers cw ON cw.id = l.worker_id
     LEFT JOIN contractors c ON c.id = cw.contractor_id
     LEFT JOIN projects p ON p.id = l.project_id
     LEFT JOIN sites s ON s.id = l.site_id
     LEFT JOIN project_tasks t ON t.id = l.task_id
     LEFT JOIN task_subtasks st ON st.id = l.subtask_id
     LEFT JOIN project_areas ar ON ar.id = l.area_id
     LEFT JOIN project_areas par ON par.id = ar.parent_id
     WHERE ${where.join(' AND ')}
     GROUP BY COALESCE(l.worker_id, 0), l.worker_name, l.project_id, l.site_id, l.task_id, l.subtask_id, l.area_id
     ORDER BY MAX(p.name), MAX(s.name), MAX(t.name), l.worker_name`,
    params
  );

  const out = rows.map((r) => {
    const isCompany = ['company_attendance', 'company_labour'].includes(r.worker_type) || Number(r.is_company) === 1;
    const hideWage = Boolean(forContractorId) && isCompany;
    return {
      workerId: Number(r.worker_id) || null,
      workerName: r.worker_name,
      phone: r.phone || null,
      workerCode: r.worker_code || null,
      kind: isCompany ? 'company' : 'contractor',
      kindLabel: isCompany ? 'Company labour' : (r.contractor_name || 'Contractor worker'),
      trade: r.labour_type,
      project: r.project_id ? { id: r.project_id, name: r.project_name } : null,
      site: r.site_id ? { id: r.site_id, name: r.site_name } : null,
      task: r.task_id ? { id: r.task_id, name: r.task_name } : null,
      subtask: r.subtask_id ? { id: r.subtask_id, name: r.subtask_name } : null,
      area: r.area_id ? { id: r.area_id, name: r.area_parent_name ? `${r.area_parent_name} › ${r.area_name}` : r.area_name } : null,
      firstDate: r.first_date,
      lastDate: r.last_date,
      dates: r.dates ? r.dates.split(',') : [],
      daysWorked: num(r.days),
      dailyWage: hideWage ? null : (r.daily_wage != null ? num(r.daily_wage) : null),
      wages: hideWage ? null : num(r.amount),
      // Company labour a contractor merely mentioned (not yet in Admin attendance) carries no cost yet.
      pendingAttendance: r.worker_type === 'company_labour',
    };
  });

  const sum = (rowsIn, key) => num(rowsIn.reduce((s, r) => s + Number(r[key] || 0), 0));
  const workers = new Set(out.map((r) => `${r.workerId || ''}|${r.workerName}`));
  return {
    rows: out,
    totals: {
      workers: workers.size,
      daysWorked: sum(out, 'daysWorked'),
      wages: sum(out.filter((r) => r.wages != null), 'wages'),
      companyWages: forContractorId ? null : sum(out.filter((r) => r.kind === 'company'), 'wages'),
      contractorWages: sum(out.filter((r) => r.kind === 'contractor'), 'wages'),
    },
  };
}

module.exports = {
  STATUSES, listWorkers, getWorker, createWorker, updateWorker, lookup,
  markAttendance, listAttendance, deleteAttendance, labourReport,
};
