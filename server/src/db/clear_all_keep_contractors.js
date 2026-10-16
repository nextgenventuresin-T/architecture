// Clears ALL business data (warehouse, finance, material movements, procurement,
// projects, sites, tasks, materials, tools, labour, etc.) while keeping:
//   - contractors
//   - users / roles / permissions (so you can still log in)
//   - theme settings and active sessions
// Usage: node src/db/clear_all_keep_contractors.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');

const KEEP = new Set([
  'contractors',
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'user_permissions',
  'company_theme_settings',
  'refresh_tokens',
]);

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [tables] = await c.query(
    "SELECT table_name n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
  );
  await c.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const { n } of tables) {
      if (KEEP.has(n)) continue;
      await c.query(`TRUNCATE TABLE \`${n}\``);
      console.log('cleared:', n);
    }
  } finally {
    await c.query('SET FOREIGN_KEY_CHECKS = 1');
  }
  const [contractors] = await c.query('SELECT COUNT(*) AS count FROM contractors');
  console.log('contractors kept:', JSON.stringify(contractors));
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
