const { Pool } = require('pg');
const dotenv = require('dotenv');
const { migrateSecurities } = require('./dist/db/database.js');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Running migrateSecurities...');
    await migrateSecurities(undefined, client);
    console.log('Done!');
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
