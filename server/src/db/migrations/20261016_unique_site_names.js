'use strict';

/**
 * Migration 20261016 — one site name per project.
 *
 *   sites: UNIQUE (project_id, name)   a double click on "Add site" / "Quick add Site 1"
 *                                      can no longer create the same site twice.
 *
 * Existing duplicates (if any) are renamed "<name> (2)", "(3)"... first - nothing is
 * deleted, since a duplicate site may already carry tasks, stock or daily work.
 * Idempotent.
 */
async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [table, index]
  );
  return rows.length > 0;
}

async function up(conn) {
  if (await indexExists(conn, 'sites', 'uq_sites_project_name')) return;

  const [dups] = await conn.query(
    `SELECT s.id, s.project_id, s.name FROM sites s
     JOIN (SELECT project_id, LOWER(TRIM(name)) AS n FROM sites GROUP BY project_id, LOWER(TRIM(name)) HAVING COUNT(*) > 1) d
       ON d.project_id = s.project_id AND d.n = LOWER(TRIM(s.name))
     ORDER BY s.project_id, LOWER(TRIM(s.name)), s.id`
  );
  let key = null;
  let n = 0;
  for (const s of dups) {
    const k = `${s.project_id}|${String(s.name).trim().toLowerCase()}`;
    n = k === key ? n + 1 : 1;
    key = k;
    if (n > 1) {
      await conn.query('UPDATE sites SET name = ? WHERE id = ?', [`${String(s.name).trim()} (${n})`.slice(0, 150), s.id]);
      console.log(`Renamed duplicate site #${s.id} to "${String(s.name).trim()} (${n})"`);
    }
  }
  await conn.query('ALTER TABLE `sites` ADD UNIQUE INDEX `uq_sites_project_name` (`project_id`, `name`)');
}

module.exports = { up };
