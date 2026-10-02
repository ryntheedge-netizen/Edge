import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create Auction State
    await client.query(`
      CREATE TABLE IF NOT EXISTS auction_state (
          id INTEGER PRIMARY KEY DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED', 'RUNNING', 'PAUSED', 'ENDED')),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure state exists
    const stateRes = await client.query('SELECT * FROM auction_state WHERE id = 1');
    if (stateRes.rows.length === 0) {
      await client.query(`INSERT INTO auction_state (id, status) VALUES (1, 'NOT_STARTED')`);
    }

    // Create Envelope Master
    await client.query(`
      CREATE TABLE IF NOT EXISTS auction_master_envelopes (
          id SERIAL PRIMARY KEY,
          envelope_code TEXT NOT NULL UNIQUE,
          envelope_name TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Modify auction tables to remove auction_round
    const tables = ['auction_bids', 'auction_holdings', 'auction_transfers', 'auction_envelopes_applied', 'auction_audit_logs'];
    
    for (const table of tables) {
      // Remove CHECK constraint if exists
      try {
        await client.query(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_auction_round_check`);
      } catch (e) {} // Ignore if constraint doesn't exist
      
      // Drop column
      try {
        await client.query(`ALTER TABLE ${table} DROP COLUMN auction_round`);
      } catch (e) {} // Ignore if column doesn't exist
    }

    // Update auction_bids: envelope_id -> envelope_code
    try {
        await client.query(`ALTER TABLE auction_bids ADD COLUMN envelope_code TEXT REFERENCES auction_master_envelopes(envelope_code) ON DELETE SET NULL`);
        // We'll keep envelope_id for backward compatibility of data if needed, or drop it.
        // Wait, envelope_id was INTEGER DEFAULT 0. Let's just add envelope_code.
    } catch(e) {}
    
    try {
        await client.query(`ALTER TABLE auction_holdings ADD COLUMN envelope_code TEXT REFERENCES auction_master_envelopes(envelope_code) ON DELETE SET NULL`);
    } catch(e) {}

    try {
        await client.query(`ALTER TABLE auction_envelopes_applied ADD COLUMN envelope_code TEXT REFERENCES auction_master_envelopes(envelope_code) ON DELETE SET NULL`);
        // The prompt says "Add Bid Amount to Envelope Bid Entry". We can just use the auction_bids table for Envelope Bids as well, since it already supports bid_amount.
        // Wait, auction_envelopes_applied doesn't have bid_amount. We should just use auction_bids for both Live and Envelope bids.
    } catch (e) {}

    await client.query('COMMIT');
    console.log('Migration successful');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
