'use strict';

const { pool } = require('../config/db');

async function findAll() {
  const [clients] = await pool.query('SELECT id, name, contact_person, email, phone FROM clients WHERE status IS NULL OR status = "active" ORDER BY name');
  const [contractors] = await pool.query('SELECT id, name, speciality FROM contractors WHERE is_active = 1 ORDER BY name');
  const [employees] = await pool.query('SELECT id, full_name, designation FROM employees WHERE is_active = 1 ORDER BY full_name');
  const [materials] = await pool.query('SELECT id, name, category, unit, default_rate FROM materials WHERE status = "active" ORDER BY category, name');
  const [tools] = await pool.query('SELECT id, code, name, type, description FROM tools WHERE status = "active" ORDER BY type, name');
  const [vendors] = await pool.query('SELECT id, name, contact_person, phone, email, gst_number FROM vendors WHERE status = "active" ORDER BY name');

  return {
    clients,
    contractors,
    materials,
    tools,
    employees,
    vendors,
    projectManagers: employees.filter((e) => e.designation === 'Project Manager'),
    architects: employees.filter((e) => e.designation === 'Architect'),
    siteEngineers: employees.filter((e) => e.designation === 'Site Engineer'),
  };
}

module.exports = { findAll };
