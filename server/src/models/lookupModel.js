'use strict';

const { pool } = require('../config/db');

const isProjectManager = (e) => /^project\s*manager$/i.test(String(e.designation || '').trim()) || e.user_role === 'project_manager';

async function findAll() {
  const [clients] = await pool.query('SELECT id, name, contact_person, email, phone FROM clients WHERE status IS NULL OR status = "active" ORDER BY name');
  const [contractors] = await pool.query('SELECT id, name, speciality FROM contractors WHERE is_active = 1 ORDER BY name');
  const [employees] = await pool.query(
    `SELECT e.id, e.full_name, e.designation, e.employee_code, r.slug AS user_role
     FROM employees e
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE e.is_active = 1 ORDER BY e.full_name`
  );
  const [materials] = await pool.query('SELECT id, name, category, unit, default_rate FROM materials WHERE status = "active" ORDER BY category, name');
  const [tools] = await pool.query('SELECT id, code, name, type, description FROM tools WHERE status = "active" ORDER BY type, name');
  const [vendors] = await pool.query('SELECT id, name, contact_person, city, phone, email, gst_number FROM vendors WHERE status = "active" ORDER BY name');

  // Fetch latest actual procurement cost per material (received orders first, then others)
  const [procRates] = await pool.query(
    `SELECT material_id, purchase_rate
     FROM procurement_requests
     WHERE purchase_rate IS NOT NULL AND purchase_rate > 0
     ORDER BY (status = 'received') DESC, id DESC`
  );
  const procRateMap = {};
  for (const r of procRates) {
    if (!procRateMap[r.material_id]) {
      procRateMap[r.material_id] = Number(r.purchase_rate);
    }
  }

  // Attach procurement_rate to each material (0 if never procured)
  const materialsWithRate = materials.map((m) => ({
    ...m,
    procurement_rate: procRateMap[m.id] || 0,
  }));

  return {
    clients,
    contractors,
    materials: materialsWithRate,
    tools,
    employees,
    vendors,
    // Anyone designated Project Manager OR whose login has the Project Manager role,
    // so a manager created from the Project Managers page always shows up here.
    projectManagers: employees.filter((e) => isProjectManager(e)),
    architects: employees.filter((e) => e.designation === 'Architect'),
    siteEngineers: employees.filter((e) => e.designation === 'Site Engineer'),
  };
}

module.exports = { findAll };
