import 'dotenv/config';
import pool from '../db/database';

async function checkBrokers() {
  const client = await pool.connect();
  try {
    const brokersRes = await client.query('SELECT * FROM brokers');
    console.log('Brokers:', brokersRes.rows);
    const res = await client.query('SELECT b.broker_identifier, bi.* FROM brokers b LEFT JOIN broker_inventory bi ON b.id = bi.broker_id');
    console.log('Broker Inventory:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    process.exit(0);
  }
}

checkBrokers();
