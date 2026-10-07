'use strict';

const { pool } = require('../config/db');

async function migrateLabourName() {
  const [cols1] = await pool.query("SHOW COLUMNS FROM task_labour LIKE 'labour_name'");
  if (!cols1.length) {
    await pool.query("ALTER TABLE task_labour ADD COLUMN labour_name VARCHAR(150) NULL AFTER labour_type");
    console.log('Added labour_name to task_labour');
  } else {
    console.log('labour_name already in task_labour');
  }

  const [cols2] = await pool.query("SHOW COLUMNS FROM project_phase_labour LIKE 'labour_name'");
  if (!cols2.length) {
    await pool.query("ALTER TABLE project_phase_labour ADD COLUMN labour_name VARCHAR(150) NULL AFTER labour_type");
    console.log('Added labour_name to project_phase_labour');
  } else {
    console.log('labour_name already in project_phase_labour');
  }

  process.exit(0);
}

migrateLabourName().catch((err) => {
  console.error(err);
  process.exit(1);
});
