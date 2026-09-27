import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Migrating edge_activities...');
    // Safely update activities to match strict nomenclature
    await client.query(`UPDATE edge_activities SET name = 'Brand Bazigaar' WHERE name = 'Brand'`);
    await client.query(`UPDATE edge_activities SET name = 'AI Ki Baat Cheet' WHERE name = 'AI'`);
    await client.query(`UPDATE edge_activities SET name = 'Finance Ka Funda' WHERE name = 'Finance ka Funda'`);
    await client.query(`INSERT INTO edge_activities (name, description) VALUES ('Bull Ring', 'Trading Simulation') ON CONFLICT (name) DO NOTHING`);
    
    console.log('Deactivating legacy stages...');
    // Deactivate ALL existing stages first (idempotent reset)
    await client.query(`UPDATE attendance_stages SET is_active = false`);
    
    console.log('Upserting General stages...');
    const generalStages = [
      { name: 'Day 1 Reg', day: 1 },
      { name: 'Team Leaders Meet', day: 1 },
      { name: 'Day 1 Lunch', day: 1 },
      { name: 'Day 2 Break', day: 2 },
      { name: 'Day 2 Lunch', day: 2 },
      { name: 'Certificate Collection', day: 2 }
    ];
    for (const st of generalStages) {
      await client.query(`
        INSERT INTO attendance_stages (name, stage_type, day, is_active, status)
        VALUES ($1, 'GENERAL', $2, true, 'NOT_STARTED')
        ON CONFLICT(name) DO UPDATE SET is_active = true, stage_type = 'GENERAL', day = $2
      `, [st.name, st.day]);
    }
    
    console.log('Upserting Event stages...');
    const events = ['Arthneeti', 'Finance Ka Funda', 'Brand Bazigaar', 'Bull Ring', 'AI Ki Baat Cheet'];
    for (const ev of events) {
      for (const day of [1, 2]) {
        const stageName = `${ev} — Day ${day}`; // em-dash as requested
        await client.query(`
          INSERT INTO attendance_stages (name, stage_type, day, is_active, status)
          VALUES ($1, 'EVENT', $2, true, 'NOT_STARTED')
          ON CONFLICT(name) DO UPDATE SET is_active = true, stage_type = 'EVENT', day = $2
        `, [stageName, day]);
      }
    }
    
    console.log('Re-syncing stations...');
    await client.query(`UPDATE attendance_stations SET is_active = false`);
    
    const activeStagesRes = await client.query(`SELECT id, name, stage_type FROM attendance_stages WHERE is_active = true`);
    const activitiesRes = await client.query(`SELECT id, name FROM edge_activities`);
    
    for (const stage of activeStagesRes.rows) {
      if (stage.stage_type === 'GENERAL') {
        const stationIdent = `GEN-STATION-${stage.id}`;
        await client.query(`
          INSERT INTO attendance_stations (station_identifier, name, stage_id, is_active, status)
          VALUES ($1, $2, $3, true, 'NOT_STARTED')
          ON CONFLICT(station_identifier) DO UPDATE SET is_active = true, stage_id = $3, name = $2
        `, [stationIdent, `${stage.name} Station`, stage.id]);
      } else {
        const act = activitiesRes.rows.find(a => stage.name.startsWith(a.name));
        if (act) {
          const stationIdent = `EVT-STATION-${stage.id}`;
          await client.query(`
            INSERT INTO attendance_stations (station_identifier, name, stage_id, activity_id, is_active, status)
            VALUES ($1, $2, $3, $4, true, 'NOT_STARTED')
            ON CONFLICT(station_identifier) DO UPDATE SET is_active = true, stage_id = $3, activity_id = $4, name = $2
          `, [stationIdent, `${stage.name} Station`, stage.id, act.id]);
        }
      }
    }
    
    await client.query('COMMIT');
    console.log('Migration completed safely.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
