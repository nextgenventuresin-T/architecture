'use strict';

const { pool } = require('../config/db');

/**
 * SITE TEAMS — several contractors and several engineers on one project / site.
 *
 * Lists live in project_contractors / site_contractors / project_engineers / site_engineers.
 * The old single columns keep the FIRST of each list (screens that show one name).
 *
 * Rules used everywhere:
 *   - A contractor works on a site when it is on the site's list, or on the project's list
 *     and the site has no contractor list of its own. Every contractor on a site shares it
 *     equally (no lead).
 *   - A site with exactly one contractor keeps that contractor's own stock; a site with
 *     several contractors (or none) works from its shared Site Store.
 */

const toIds = (list) => [...new Set((Array.isArray(list) ? list : [list])
  .map(Number).filter((n) => Number.isInteger(n) && n > 0))];

/**
 * SQL: the site aliased `s` (of project `p`) has contractor ?.  Params: [cid, cid, cid, cid].
 * Includes the old single columns so a row written before the lists existed still counts.
 */
function contractorOnSiteSql(s = 's', p = 'p') {
  return `(${s}.contractor_id = ?
    OR EXISTS (SELECT 1 FROM site_contractors sc_ WHERE sc_.site_id = ${s}.id AND sc_.contractor_id = ?)
    OR (NOT EXISTS (SELECT 1 FROM site_contractors sc0_ WHERE sc0_.site_id = ${s}.id) AND ${s}.contractor_id IS NULL
        AND (${p}.contractor_id = ? OR EXISTS (SELECT 1 FROM project_contractors pc_ WHERE pc_.project_id = ${p}.id AND pc_.contractor_id = ?))))`;
}
const contractorOnSiteParams = (cid) => [cid, cid, cid, cid];

/** SQL: project aliased `p` has contractor ? itself or on any of its sites.  Params: 4 x cid. */
function contractorOnProjectSql(p = 'p') {
  return `(${p}.contractor_id = ?
    OR EXISTS (SELECT 1 FROM project_contractors pc_ WHERE pc_.project_id = ${p}.id AND pc_.contractor_id = ?)
    OR ${p}.id IN (SELECT project_id FROM sites WHERE contractor_id = ?)
    OR ${p}.id IN (SELECT st_.project_id FROM site_contractors scp_ JOIN sites st_ ON st_.id = scp_.site_id WHERE scp_.contractor_id = ?))`;
}
const contractorOnProjectParams = (cid) => [cid, cid, cid, cid];

/** Contractor ids working on a site (site list, else the project's list). */
async function siteContractorIds(projectId, siteId, conn = pool) {
  if (siteId) {
    const [[s]] = await conn.query('SELECT project_id, contractor_id FROM sites WHERE id = ? LIMIT 1', [siteId]);
    if (s) {
      const [rows] = await conn.query('SELECT contractor_id FROM site_contractors WHERE site_id = ?', [siteId]);
      const ids = toIds([...rows.map((r) => r.contractor_id), s.contractor_id].filter(Boolean));
      if (ids.length) return ids;
      projectId = projectId || s.project_id; // eslint-disable-line no-param-reassign
    }
  }
  if (!projectId) return [];
  const [[p]] = await conn.query('SELECT contractor_id FROM projects WHERE id = ? LIMIT 1', [projectId]);
  const [rows] = await conn.query('SELECT contractor_id FROM project_contractors WHERE project_id = ?', [projectId]);
  return toIds([...rows.map((r) => r.contractor_id), p?.contractor_id].filter(Boolean));
}

/** True when this contractor works on the site (or, with no site, on the project). */
async function contractorWorksOn(contractorId, projectId, siteId) {
  if (!contractorId) return false;
  if (siteId) return (await siteContractorIds(projectId, siteId)).includes(Number(contractorId));
  const [[row]] = await pool.query(
    `SELECT 1 AS ok FROM projects p WHERE p.id = ? AND ${contractorOnProjectSql('p')} LIMIT 1`,
    [projectId, ...contractorOnProjectParams(Number(contractorId))]
  );
  return Boolean(row);
}

/** Replaces a list and keeps the old single column = first entry. */
async function setList(table, owner, member, legacyTable, legacyColumn, ownerId, ids) {
  const list = toIds(ids);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM \`${table}\` WHERE \`${owner}\` = ?`, [ownerId]);
    if (list.length) {
      await conn.query(`INSERT INTO \`${table}\` (\`${owner}\`, \`${member}\`) VALUES ?`, [list.map((id) => [ownerId, id])]);
    }
    await conn.query(`UPDATE \`${legacyTable}\` SET \`${legacyColumn}\` = ? WHERE id = ?`, [list[0] || null, ownerId]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  return list;
}

const setProjectContractors = (id, ids) => setList('project_contractors', 'project_id', 'contractor_id', 'projects', 'contractor_id', id, ids);
const setSiteContractors = (id, ids) => setList('site_contractors', 'site_id', 'contractor_id', 'sites', 'contractor_id', id, ids);
const setProjectEngineers = (id, ids) => setList('project_engineers', 'project_id', 'employee_id', 'projects', 'site_engineer_id', id, ids);
const setSiteEngineers = (id, ids) => setList('site_engineers', 'site_id', 'employee_id', 'sites', 'site_engineer_id', id, ids);

/**
 * Keeps a list in step when only the old single column was written (older screens):
 * the list becomes that one id, or is left alone when the id is already on it.
 */
async function syncFromSingle(kind, ownerId, singleId) {
  if (singleId === undefined) return;
  const map = {
    projectContractor: ['project_contractors', 'project_id', 'contractor_id', setProjectContractors],
    siteContractor: ['site_contractors', 'site_id', 'contractor_id', setSiteContractors],
    projectEngineer: ['project_engineers', 'project_id', 'employee_id', setProjectEngineers],
    siteEngineer: ['site_engineers', 'site_id', 'employee_id', setSiteEngineers],
  }[kind];
  const [table, owner, member, setter] = map;
  if (!singleId) { await setter(ownerId, []); return; }
  const [[row]] = await pool.query(`SELECT 1 AS ok FROM \`${table}\` WHERE \`${owner}\` = ? AND \`${member}\` = ?`, [ownerId, singleId]);
  if (!row) await setter(ownerId, [singleId]);
}

/** {contractors:[{id,name}], engineers:[{id,name}]} for each id, for display. */
async function teamsFor(kind, ownerIds) {
  const ids = toIds(ownerIds);
  const out = Object.fromEntries(ids.map((id) => [id, { contractors: [], engineers: [] }]));
  if (!ids.length) return out;
  const [ct, en] = kind === 'site'
    ? ['site_contractors', 'site_engineers'] : ['project_contractors', 'project_engineers'];
  const owner = kind === 'site' ? 'site_id' : 'project_id';
  const [cRows] = await pool.query(
    `SELECT x.${owner} AS owner, c.id, c.name FROM ${ct} x JOIN contractors c ON c.id = x.contractor_id
     WHERE x.${owner} IN (?) ORDER BY c.name`, [ids]
  );
  const [eRows] = await pool.query(
    `SELECT x.${owner} AS owner, e.id, e.full_name AS name FROM ${en} x JOIN employees e ON e.id = x.employee_id
     WHERE x.${owner} IN (?) ORDER BY e.full_name`, [ids]
  );
  cRows.forEach((r) => out[r.owner].contractors.push({ id: Number(r.id), name: r.name }));
  eRows.forEach((r) => out[r.owner].engineers.push({ id: Number(r.id), name: r.name }));
  return out;
}

/**
 * Saves the team sent with a project / site form: `contractor_ids` / `site_engineer_ids`
 * (lists, from the new screens) or the old single `contractor_id` / `site_engineer_id`.
 */
async function applyTeam(kind, ownerId, payload = {}) {
  const isSite = kind === 'site';
  if (Array.isArray(payload.contractor_ids)) {
    await (isSite ? setSiteContractors : setProjectContractors)(ownerId, payload.contractor_ids);
  } else if (payload.contractor_id !== undefined) {
    await syncFromSingle(isSite ? 'siteContractor' : 'projectContractor', ownerId, payload.contractor_id ? Number(payload.contractor_id) : null);
  }
  if (Array.isArray(payload.site_engineer_ids)) {
    await (isSite ? setSiteEngineers : setProjectEngineers)(ownerId, payload.site_engineer_ids);
  } else if (payload.site_engineer_id !== undefined) {
    await syncFromSingle(isSite ? 'siteEngineer' : 'projectEngineer', ownerId, payload.site_engineer_id ? Number(payload.site_engineer_id) : null);
  }
}

module.exports = {
  applyTeam,
  toIds,
  contractorOnSiteSql, contractorOnSiteParams, contractorOnProjectSql, contractorOnProjectParams,
  siteContractorIds, contractorWorksOn,
  setProjectContractors, setSiteContractors, setProjectEngineers, setSiteEngineers,
  syncFromSingle, teamsFor,
};
