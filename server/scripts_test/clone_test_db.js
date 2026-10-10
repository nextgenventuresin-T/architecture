'use strict';
/**
 * Copies the configured database (DB_NAME) into <DB_NAME>_test so integration
 * tests can create, receive and consume real rows without touching live data.
 *
 * Run: node scripts_test/clone_test_db.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

(async () => {
  const source = process.env.DB_NAME || 'architecture_erp';
  const target = `${source}_test`;
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${target}\``);
  await conn.query(`CREATE DATABASE \`${target}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const [tables] = await conn.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
    [source]
  );
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { TABLE_NAME: t } of tables) {
    await conn.query(`CREATE TABLE \`${target}\`.\`${t}\` LIKE \`${source}\`.\`${t}\``);
  }
  for (const { TABLE_NAME: t } of tables) {
    // Generated columns cannot be copied by value; list the real ones.
    const [cols] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND EXTRA NOT LIKE '%GENERATED%' ORDER BY ORDINAL_POSITION",
      [source, t]
    );
    const list = cols.map((c) => `\`${c.COLUMN_NAME}\``).join(', ');
    await conn.query(`INSERT INTO \`${target}\`.\`${t}\` (${list}) SELECT ${list} FROM \`${source}\`.\`${t}\``);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log(`Cloned ${tables.length} tables: ${source} -> ${target}`);
  await conn.end();
})().catch((e) => { console.error(e); process.exit(1); });
