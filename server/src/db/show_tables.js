'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { pool } = require('../config/db');

pool.query('SHOW TABLES').then(([rows]) => {
  rows.forEach(r => console.log(Object.values(r)[0]));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
