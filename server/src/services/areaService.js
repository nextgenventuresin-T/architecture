'use strict';

const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

/**
 * Site areas: the area / floor / room / zone / block a piece of work happens in.
 *
 * Areas belong to a project and optionally to one of its sites, and may nest
 * (a room inside a floor). Tasks, subtasks and procurement requests carry an
 * optional area_id so work, materials and tools can be organised and tracked
 * by area. Deleting an area never deletes work: the rows simply lose their area.
 */
const AREA_TYPES = ['area', 'floor', 'room', 'zone', 'block', 'wing', 'unit'];

function toArea(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    siteId: row.site_id,
    siteName: row.site_name || null,
    parentId: row.parent_id,
    parentName: row.parent_name || null,
    name: row.name,
    areaType: row.area_type,
    description: row.description,
    sortOrder: Number(row.sort_order || 0),
    // "Ground Floor › Kitchen" - what dropdowns show.
    label: row.parent_name ? `${row.parent_name} › ${row.name}` : row.name,
    taskCount: row.task_count != null ? Number(row.task_count) : undefined,
  };
}

async function list(projectId, { siteId } = {}) {
  const params = [Number(projectId)];
  let siteSql = '';
  if (siteId) {
    // Areas of this site plus project-wide areas (no site).
    siteSql = ' AND (a.site_id = ? OR a.site_id IS NULL)';
    params.push(Number(siteId));
  }
  const [rows] = await pool.query(
    `SELECT a.*, s.name AS site_name, pa.name AS parent_name,
            (SELECT COUNT(*) FROM project_tasks t WHERE t.area_id = a.id) AS task_count
     FROM project_areas a
     LEFT JOIN sites s ON s.id = a.site_id
     LEFT JOIN project_areas pa ON pa.id = a.parent_id
     WHERE a.project_id = ?${siteSql}
     ORDER BY s.name IS NULL DESC, s.name, COALESCE(pa.sort_order, a.sort_order), COALESCE(pa.name, a.name), a.parent_id IS NOT NULL, a.sort_order, a.name`,
    params
  );
  return rows.map(toArea);
}

async function findById(id) {
  const [[row]] = await pool.query(
    `SELECT a.*, s.name AS site_name, pa.name AS parent_name
     FROM project_areas a
     LEFT JOIN sites s ON s.id = a.site_id
     LEFT JOIN project_areas pa ON pa.id = a.parent_id
     WHERE a.id = ?`,
    [id]
  );
  return row || null;
}

/**
 * Confirms an area_id belongs to the project (and, when a site is given, is either
 * project-wide or on that site). Returns the normalised id or null. Throws a
 * field error on `field` otherwise.
 */
async function assertAreaFor(areaId, projectId, siteId = null, field = 'area_id') {
  if (areaId === undefined || areaId === null || areaId === '') return null;
  const id = Number(areaId);
  const area = Number.isInteger(id) && id > 0 ? await findById(id) : null;
  if (!area || Number(area.project_id) !== Number(projectId)) {
    throw ApiError.badRequest('Check the highlighted fields.', { [field]: 'That area does not belong to this project.' });
  }
  if (siteId && area.site_id && Number(area.site_id) !== Number(siteId)) {
    throw ApiError.badRequest('Check the highlighted fields.', { [field]: 'That area belongs to a different site.' });
  }
  return id;
}

async function normalise(projectId, payload, existing = null) {
  const name = payload.name !== undefined ? String(payload.name || '').trim() : existing?.name;
  if (!name) throw ApiError.badRequest('Check the highlighted fields.', { name: 'Enter the area name.' });
  if (name.length > 150) throw ApiError.badRequest('Check the highlighted fields.', { name: 'Keep the name under 150 characters.' });

  const areaType = payload.area_type ?? payload.areaType ?? existing?.area_type ?? 'area';
  if (!AREA_TYPES.includes(areaType)) {
    throw ApiError.badRequest('Check the highlighted fields.', { area_type: 'Choose a valid area type.' });
  }

  const rawSite = payload.site_id !== undefined ? payload.site_id : (payload.siteId !== undefined ? payload.siteId : existing?.site_id);
  const siteId = rawSite ? Number(rawSite) : null;
  if (siteId) {
    const [[site]] = await pool.query('SELECT id, project_id FROM sites WHERE id = ?', [siteId]);
    if (!site || Number(site.project_id) !== Number(projectId)) {
      throw ApiError.badRequest('Check the highlighted fields.', { site_id: 'That site does not belong to this project.' });
    }
  }

  const rawParent = payload.parent_id !== undefined ? payload.parent_id : (payload.parentId !== undefined ? payload.parentId : existing?.parent_id);
  const parentId = rawParent ? Number(rawParent) : null;
  if (parentId) {
    if (existing && Number(existing.id) === parentId) {
      throw ApiError.badRequest('Check the highlighted fields.', { parent_id: 'An area cannot be inside itself.' });
    }
    const parent = await findById(parentId);
    if (!parent || Number(parent.project_id) !== Number(projectId)) {
      throw ApiError.badRequest('Check the highlighted fields.', { parent_id: 'That parent area does not belong to this project.' });
    }
    if (parent.parent_id) {
      throw ApiError.badRequest('Check the highlighted fields.', { parent_id: 'Areas can be nested one level deep (e.g. Floor › Room).' });
    }
    if (siteId && parent.site_id && Number(parent.site_id) !== siteId) {
      throw ApiError.badRequest('Check the highlighted fields.', { parent_id: 'The parent area is on a different site.' });
    }
  }

  // MySQL treats NULLs in a UNIQUE key as distinct, so check duplicates explicitly.
  const [dupes] = await pool.query(
    `SELECT id FROM project_areas
     WHERE project_id = ? AND name = ? AND site_id <=> ? AND parent_id <=> ? AND id <> ? LIMIT 1`,
    [Number(projectId), name, siteId, parentId, existing?.id || 0]
  );
  if (dupes.length) {
    throw ApiError.badRequest('Check the highlighted fields.', { name: 'An area with this name already exists here.' });
  }

  const description = payload.description !== undefined ? (String(payload.description || '').trim() || null) : (existing?.description ?? null);
  const sortOrder = payload.sort_order !== undefined || payload.sortOrder !== undefined
    ? Math.max(0, Number(payload.sort_order ?? payload.sortOrder) || 0)
    : Number(existing?.sort_order || 0);

  return { name, area_type: areaType, site_id: siteId, parent_id: parentId, description, sort_order: sortOrder };
}

async function create(projectId, payload, userId) {
  const [[project]] = await pool.query('SELECT id FROM projects WHERE id = ?', [projectId]);
  if (!project) throw ApiError.notFound('That project does not exist.');
  const row = await normalise(projectId, payload);
  const [res] = await pool.query(
    `INSERT INTO project_areas (project_id, site_id, parent_id, name, area_type, description, sort_order, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [Number(projectId), row.site_id, row.parent_id, row.name, row.area_type, row.description, row.sort_order, userId || null]
  );
  return toArea(await findById(res.insertId));
}

async function update(projectId, areaId, payload) {
  const existing = await findById(areaId);
  if (!existing || Number(existing.project_id) !== Number(projectId)) throw ApiError.notFound('That area does not exist.');
  const row = await normalise(projectId, payload, existing);
  await pool.query(
    `UPDATE project_areas SET site_id = ?, parent_id = ?, name = ?, area_type = ?, description = ?, sort_order = ? WHERE id = ?`,
    [row.site_id, row.parent_id, row.name, row.area_type, row.description, row.sort_order, Number(areaId)]
  );
  return toArea(await findById(areaId));
}

async function remove(projectId, areaId) {
  const existing = await findById(areaId);
  if (!existing || Number(existing.project_id) !== Number(projectId)) throw ApiError.notFound('That area does not exist.');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Work is never deleted with its area - it just becomes "no area".
    const ids = [Number(areaId)];
    const [children] = await conn.query('SELECT id FROM project_areas WHERE parent_id = ?', [areaId]);
    children.forEach((c) => ids.push(Number(c.id)));
    for (const table of ['project_tasks', 'task_subtasks', 'procurement_requests']) {
      await conn.query(`UPDATE ${table} SET area_id = NULL WHERE area_id IN (?)`, [ids]);
    }
    await conn.query('DELETE FROM project_areas WHERE id IN (?)', [ids]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  return { id: Number(areaId) };
}

/**
 * Area-wise progress for a project: tasks / subtasks, progress, planned budget and
 * the materials & tools requested and received for each area. Work with no area
 * is reported as one "Unassigned" row so the totals reconcile with the project.
 */
async function summary(projectId) {
  const pid = Number(projectId);
  const areas = await list(pid);
  const [taskRows] = await pool.query(
    `SELECT area_id, COUNT(*) AS tasks,
            SUM(status = 'completed' OR progress >= 100) AS completed,
            ROUND(AVG(progress), 1) AS avg_progress,
            COALESCE(SUM(total_budget + approved_additional_budget), 0) AS planned_budget
     FROM project_tasks WHERE project_id = ? GROUP BY area_id`,
    [pid]
  );
  const [subRows] = await pool.query(
    `SELECT area_id, COUNT(*) AS subtasks, ROUND(AVG(progress), 1) AS avg_progress
     FROM task_subtasks WHERE project_id = ? GROUP BY area_id`,
    [pid]
  );
  const [procRows] = await pool.query(
    `SELECT r.area_id,
            SUM(r.item_type = 'material' OR r.material_id IS NOT NULL) AS material_requests,
            SUM(r.item_type = 'tool' OR (r.material_id IS NULL AND r.tool_id IS NOT NULL)) AS tool_requests,
            SUM(r.status IN ('received')) AS delivered,
            SUM(r.status IN ('ordered', 'partially_received')) AS in_transit,
            COALESCE(SUM(COALESCE(r.total_amount, r.quantity * r.estimated_rate, 0)), 0) AS procurement_value
     FROM procurement_requests r
     WHERE r.project_id = ? AND r.status NOT IN ('rejected', 'cancelled')
     GROUP BY r.area_id`,
    [pid]
  );
  const by = (rows) => new Map(rows.map((r) => [r.area_id == null ? 'none' : Number(r.area_id), r]));
  const tasks = by(taskRows);
  const subs = by(subRows);
  const procs = by(procRows);

  const build = (key, base) => {
    const t = tasks.get(key) || {};
    const s = subs.get(key) || {};
    const p = procs.get(key) || {};
    return {
      ...base,
      tasks: Number(t.tasks || 0),
      completedTasks: Number(t.completed || 0),
      taskProgress: t.avg_progress != null ? Number(t.avg_progress) : null,
      subtasks: Number(s.subtasks || 0),
      subtaskProgress: s.avg_progress != null ? Number(s.avg_progress) : null,
      plannedBudget: Number(Number(t.planned_budget || 0).toFixed(2)),
      materialRequests: Number(p.material_requests || 0),
      toolRequests: Number(p.tool_requests || 0),
      deliveredRequests: Number(p.delivered || 0),
      inTransitRequests: Number(p.in_transit || 0),
      procurementValue: Number(Number(p.procurement_value || 0).toFixed(2)),
    };
  };

  const rows = areas.map((a) => build(a.id, a));
  const unassigned = build('none', { id: null, name: 'Unassigned', label: 'Unassigned (no area)', areaType: null });
  if (unassigned.tasks || unassigned.subtasks || unassigned.materialRequests || unassigned.toolRequests) rows.push(unassigned);
  return { areaTypes: AREA_TYPES, rows };
}

module.exports = { AREA_TYPES, list, findById, assertAreaFor, create, update, remove, summary, toArea };
