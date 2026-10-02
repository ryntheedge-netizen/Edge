import { query } from '../db/database';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

async function run() {
  console.log('Running provisional participants migration...');
  try {
    await query(`ALTER TABLE edge_participants ADD COLUMN registration_status TEXT NOT NULL DEFAULT 'PERMANENT'`);
    await query(`ALTER TABLE edge_participants ADD COLUMN reconciled_to INTEGER REFERENCES edge_participants(id) ON DELETE SET NULL`);
    await query(`ALTER TABLE edge_participants ADD COLUMN reconciled_by TEXT`);
    await query(`ALTER TABLE edge_participants ADD COLUMN reconciled_at TIMESTAMP WITH TIME ZONE`);
    await query(`ALTER TABLE edge_participants ADD COLUMN remarks TEXT`);
    console.log('Migration completed successfully.');
  } catch (err: any) {
    if (err.message.includes('already exists')) {
      console.log('Migration already applied.');
    } else {
      console.error('Migration failed:', err);
    }
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
