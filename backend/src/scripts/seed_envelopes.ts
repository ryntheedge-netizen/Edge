import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const envelopes = [
  { code: '1', name: 'BLANK' },
  { code: '2', name: 'DOULE AMOUNT PLUS' },
  { code: '3', name: 'DOULE AMOUNT SUB' },
  { code: '4', name: 'CANT BID NEXT 20 SHARE' },
  { code: '5', name: 'NEXT 20 SHARE WHAT PRICE YOU WANT WILL BE GIVE ACC TO CORPUS' },
  { code: '6', name: 'HIGH RETURN WILL BE 0' },
  { code: '7', name: 'LOW RETRUN WILL BE DOUBLE IN (POSITIVE)' },
  { code: '8', name: 'NEGATIVE WILL BE DOUBLE (low negative return sec)' },
  { code: '9', name: 'POSTIVE WILL BE DOUBLE (highest positive return sec)' },
  { code: '10', name: 'YOUR PORTFOLIO WILL BE down by 50%' },
  { code: '11', name: 'YOUR PORTFOLIO WILL BE up by 50%' },
  { code: '12', name: 'INFLATION 10 % OVERALL' },
  { code: '13', name: 'DIVEDED 10 OVERALL' },
  { code: '14', name: 'will get pakistan rupee of bid amt of envelop' },
  { code: '15', name: 'we will forfeit one share from your portfolio' }
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Clear existing envelopes if any
    await client.query('TRUNCATE TABLE auction_master_envelopes CASCADE');
    
    for (const env of envelopes) {
      await client.query(`
        INSERT INTO auction_master_envelopes (envelope_code, envelope_name) 
        VALUES ($1, $2)
        ON CONFLICT (envelope_code) DO UPDATE SET envelope_name = EXCLUDED.envelope_name
      `, [env.code, env.name]);
    }
    
    await client.query('COMMIT');
    console.log('Successfully seeded envelopes');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed to seed envelopes:', e);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
