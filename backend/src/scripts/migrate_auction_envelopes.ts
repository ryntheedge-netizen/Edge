import pool from '../db/database';

async function migrate() {
  console.log('Starting Auction Envelopes Migration...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add total_sales_counter to auction_state
    console.log('Updating auction_state...');
    await client.query(`ALTER TABLE auction_state ADD COLUMN IF NOT EXISTS total_sales_counter INTEGER NOT NULL DEFAULT 0;`);

    // 2. Add freeze columns to auction_traders
    console.log('Updating auction_traders...');
    await client.query(`ALTER TABLE auction_traders ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false;`);
    await client.query(`ALTER TABLE auction_traders ADD COLUMN IF NOT EXISTS freeze_start_sales INTEGER NOT NULL DEFAULT 0;`);

    // 3. Add envelope holding details to auction_holdings
    console.log('Updating auction_holdings...');
    await client.query(`ALTER TABLE auction_holdings ADD COLUMN IF NOT EXISTS effective_return_pct NUMERIC(15,4);`);
    await client.query(`ALTER TABLE auction_holdings ADD COLUMN IF NOT EXISTS envelope_effect_details TEXT;`);

    // 4. Update auction_envelopes_applied
    console.log('Updating auction_envelopes_applied...');
    await client.query(`ALTER TABLE auction_envelopes_applied ADD COLUMN IF NOT EXISTS bid_amount NUMERIC(15,2) NOT NULL DEFAULT 0;`);
    await client.query(`ALTER TABLE auction_envelopes_applied ADD COLUMN IF NOT EXISTS resulting_value NUMERIC(15,2) NOT NULL DEFAULT 0;`);

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();
