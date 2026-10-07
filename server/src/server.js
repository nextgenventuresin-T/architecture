'use strict';

const app = require('./app');
const env = require('./config/env');
const { verifyConnection } = require('./config/db');

async function start() {
  try {
    await verifyConnection();
    console.log(`MySQL connected (${env.db.database}@${env.db.host}:${env.db.port}).`);
  } catch (error) {
    console.error('Could not reach MySQL:', error.message);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`Architecture ERP API listening on http://localhost:${env.port}`);
  });
}

start();
