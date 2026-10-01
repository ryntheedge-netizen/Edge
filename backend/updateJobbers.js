const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function updateJobbers() {
  const client = await pool.connect();
  try {
    console.log('Updating jobber assigned_prices to match current initial_ltp...');
    
    // Get all securities for the latest event
    const eventRes = await client.query('SELECT id FROM events ORDER BY id ASC LIMIT 1');
    if (eventRes.rows.length === 0) return;
    const eventId = eventRes.rows[0].id;
    
    const secs = await client.query('SELECT id, initial_ltp FROM securities WHERE event_id = $1', [eventId]);
    
    // Update jobber inventory
    for (const sec of secs.rows) {
      await client.query(`
        UPDATE jobber_inventory 
        SET assigned_price = $1 
        WHERE security_id = $2
      `, [sec.initial_ltp, sec.id]);
    }
    
    console.log('Done updating jobbers!');
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    pool.end();
  }
}

updateJobbers();
