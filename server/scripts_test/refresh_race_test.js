'use strict';
/** Two refreshes with the same cookie at once must not sign the user out. Uses the _test DB only. */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const liveDb = (process.env.DB_NAME || 'architecture_erp').replace(/_test$/, '');
process.env.DB_NAME = `${liveDb}_test`;
process.env.NODE_ENV = 'test';
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool } = require('../src/config/db');

let pass = 0; let fail = 0;
const check = (n, c, d = '') => { if (c) { pass += 1; console.log(`  PASS  ${n}`); } else { fail += 1; console.log(`  FAIL  ${n} ${d}`); } };

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const stamp = Date.now().toString(36);
  const [[role]] = await pool.query("SELECT id FROM roles WHERE slug='admin'");
  const email = `race-${stamp}@t.local`;
  await pool.query('INSERT INTO users (full_name,email,password_hash,role_id,is_active) VALUES (?,?,?,?,1)', ['Race', email, await bcrypt.hash('Passw0rd!x', 4), role.id]);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: email, password: 'Passw0rd!x' }) });
  const cookieOf = (res) => (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  const cookie = cookieOf(login);
  check('login', login.status === 200 && cookie, `${login.status}`);
  const refresh = (c) => fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: c } });
  const [a, b] = await Promise.all([refresh(cookie), refresh(cookie)]);
  check('both racing refreshes succeed', a.status === 200 && b.status === 200, `${a.status} ${b.status}`);
  const next = await refresh(cookieOf(a));
  check('session still alive after the race', next.status === 200, `${next.status}`);
  await pool.query("UPDATE refresh_tokens SET revoked_at = NOW() - INTERVAL 10 MINUTE WHERE revoked_at IS NOT NULL AND user_id = (SELECT id FROM users WHERE email=?)", [email]);
  const replay = await refresh(cookie);
  check('an old (long rotated) token is still refused', replay.status === 401, `${replay.status}`);
  console.log(`\n${pass} passed, ${fail} failed`);
  server.close(); await pool.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
