const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_m7CITpRkVZi2@ep-spring-queen-b3iqo648-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });

async function fixConstraints() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // auction_bids
    await client.query(`
      ALTER TABLE auction_bids 
      DROP CONSTRAINT IF EXISTS auction_bids_security_id_fkey,
      ADD CONSTRAINT auction_bids_security_id_fkey FOREIGN KEY (security_id) REFERENCES auction_securities(id);
    `);

    // auction_holdings
    await client.query(`
      ALTER TABLE auction_holdings 
      DROP CONSTRAINT IF EXISTS auction_holdings_security_id_fkey,
      ADD CONSTRAINT auction_holdings_security_id_fkey FOREIGN KEY (security_id) REFERENCES auction_securities(id);
    `);

    await client.query('COMMIT');
    console.log('Constraints fixed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error fixing constraints', err);
  } finally {
    client.release();
    pool.end();
  }
}

fixConstraints();
