'use strict';

const { pool } = require('../config/db');

function parseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name || null,
    themeId: row.theme_id,
    themeName: row.theme_name,
    isCustom: Boolean(row.is_custom),
    colors: typeof row.colors === 'string' ? JSON.parse(row.colors) : row.colors,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findGlobalTheme() {
  const [rows] = await pool.query(
    'SELECT * FROM company_theme_settings WHERE company_id IS NULL LIMIT 1'
  );
  return parseRow(rows[0]);
}

async function findByCompanyId(companyId) {
  if (!companyId) return findGlobalTheme();
  const [rows] = await pool.query(
    `SELECT ts.*, c.name AS company_name
     FROM company_theme_settings ts
     LEFT JOIN clients c ON c.id = ts.company_id
     WHERE ts.company_id = ?
     LIMIT 1`,
    [companyId]
  );
  return parseRow(rows[0]);
}

async function findAll() {
  const [rows] = await pool.query(
    `SELECT ts.*, c.name AS company_name
     FROM company_theme_settings ts
     LEFT JOIN clients c ON c.id = ts.company_id
     ORDER BY ts.company_id IS NOT NULL, c.name`
  );
  return rows.map(parseRow);
}

async function upsert({ companyId, themeId, themeName, isCustom, colors }) {
  const colorsJson = typeof colors === 'string' ? colors : JSON.stringify(colors);
  const targetCompanyId = companyId || null;

  if (targetCompanyId === null) {
    // Upsert global
    const [existing] = await pool.query(
      'SELECT id FROM company_theme_settings WHERE company_id IS NULL LIMIT 1'
    );
    if (existing.length > 0) {
      await pool.query(
        'UPDATE company_theme_settings SET theme_id = ?, theme_name = ?, is_custom = ?, colors = ? WHERE id = ?',
        [themeId, themeName, isCustom ? 1 : 0, colorsJson, existing[0].id]
      );
      return findGlobalTheme();
    } else {
      const [res] = await pool.query(
        'INSERT INTO company_theme_settings (company_id, theme_id, theme_name, is_custom, colors) VALUES (NULL, ?, ?, ?, ?)',
        [themeId, themeName, isCustom ? 1 : 0, colorsJson]
      );
      return findGlobalTheme();
    }
  }

  await pool.query(
    `INSERT INTO company_theme_settings (company_id, theme_id, theme_name, is_custom, colors)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       theme_id = VALUES(theme_id),
       theme_name = VALUES(theme_name),
       is_custom = VALUES(is_custom),
       colors = VALUES(colors)`,
    [targetCompanyId, themeId, themeName, isCustom ? 1 : 0, colorsJson]
  );

  return findByCompanyId(targetCompanyId);
}

async function deleteByCompanyId(companyId) {
  if (!companyId) return false;
  const [res] = await pool.query(
    'DELETE FROM company_theme_settings WHERE company_id = ?',
    [companyId]
  );
  return res.affectedRows > 0;
}

module.exports = {
  findGlobalTheme,
  findByCompanyId,
  findAll,
  upsert,
  deleteByCompanyId,
};
