const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_m7CITpRkVZi2@ep-spring-queen-b3iqo648-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
pool.query(`
  SELECT conname, pg_get_constraintdef(c.oid)
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.connamespace
  WHERE conrelid = 'auction_holdings'::regclass;
`).then(r => { console.log(r.rows); pool.end(); }).catch(e => console.error(e));
