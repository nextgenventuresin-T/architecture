const { pool } = require('./src/config/db');
async function run() {
  const [contractors] = await pool.query('SELECT id, name, user_id FROM contractors LIMIT 5');
  const [users] = await pool.query("SELECT id, username, role, contractor_id FROM users WHERE role = 'contractor' LIMIT 5");
  const [projects] = await pool.query('SELECT id, name, contractor_id FROM projects LIMIT 5');
  const [sites] = await pool.query('SELECT id, name, project_id, contractor_id FROM sites LIMIT 5');
  const [tasks] = await pool.query('SELECT id, project_id, site_id, name, contractor_id FROM project_tasks LIMIT 5');
  console.log(JSON.stringify({ contractors, users, projects, sites, tasks }, null, 2));
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
