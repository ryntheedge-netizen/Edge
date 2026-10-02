import { Pool, PoolClient } from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL Connection Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:edge@localhost:5432/edge_db',
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech') 
    ? { rejectUnauthorized: false } 
    : false
});

// Helper for transactions to ensure client is properly released
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Simple query helper
export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

// Ensure database has default data if needed (Called out-of-band typically, but keeping interface for tests)
export async function seedAttendanceData(client?: PoolClient) {
  const runner = client || pool;
  
  // Activities
  await runner.query(`
    INSERT INTO edge_activities (name, description) VALUES 
    ('Arthneeti', 'Business & Economics Event'),
    ('Brand', 'Brand Management Challenge'),
    ('AI', 'AI Hackathon'),
    ('Finance ka Funda', 'Financial Literacy Session')
    ON CONFLICT (name) DO NOTHING
  `);

  // General Stages
  await runner.query(`
    INSERT INTO attendance_stages (name, stage_type, day) VALUES 
    ('DAY_1_REGISTRATION_BREAKFAST', 'GENERAL', 1),
    ('DAY_1_LUNCH', 'GENERAL', 1),
    ('DAY_2_BREAKFAST', 'GENERAL', 2),
    ('DAY_2_LUNCH', 'GENERAL', 2),
    ('DAY_1_EVENT_SESSION', 'EVENT', 1),
    ('DAY_2_EVENT_SESSION', 'EVENT', 2)
    ON CONFLICT (name) DO NOTHING
  `);

  // Dummy Team & Participant
  const teamRes = await runner.query(`INSERT INTO edge_teams (name) VALUES ('Team X') ON CONFLICT DO NOTHING RETURNING id`);
  let teamId = teamRes.rows.length ? teamRes.rows[0].id : (await runner.query(`SELECT id FROM edge_teams WHERE name = 'Team X'`)).rows[0].id;

  const partRes = await runner.query(`INSERT INTO edge_participants (participant_id, name, team_id) VALUES ('EDG26-001', 'Sarthak', $1) ON CONFLICT DO NOTHING RETURNING id`, [teamId]);
  let participantId = partRes.rows.length ? partRes.rows[0].id : (await runner.query(`SELECT id FROM edge_participants WHERE participant_id = 'EDG26-001'`)).rows[0].id;

  // Assign to Arthneeti (Assuming ID 1 is Arthneeti)
  const actRes = await runner.query(`SELECT id FROM edge_activities WHERE name = 'Arthneeti'`);
  if (actRes.rows.length > 0) {
    await runner.query(`
      INSERT INTO edge_event_participations (participant_id, activity_id) 
      VALUES ($1, $2) ON CONFLICT DO NOTHING`, [participantId, actRes.rows[0].id]);
  }

  // Dummy Station
  await runner.query(`
    INSERT INTO attendance_stations (station_identifier, name, stage_id, activity_id) 
    VALUES 
    ('D1-REG-01', 'Registration Desk 1', (SELECT id FROM attendance_stages WHERE name = 'DAY_1_REGISTRATION_BREAKFAST'), NULL),
    ('ARTH-01', 'Arthneeti Entrance', (SELECT id FROM attendance_stages WHERE name = 'DAY_1_EVENT_SESSION'), (SELECT id FROM edge_activities WHERE name = 'Arthneeti'))
    ON CONFLICT (station_identifier) DO NOTHING
  `);
}

export async function migrateSecurities(specificEventId?: number, client?: PoolClient) {
  const runner: any = client || pool;
  
  const actualSecurities = [
    { name: 'Adani Ports & SEZ', symbol: 'ADANIPORTS', base_price: 1788, lower_circuit: 1610, upper_circuit: 1966 },
    { name: 'Asian Paints', symbol: 'ASIANPAINT', base_price: 2438, lower_circuit: 2200, upper_circuit: 2688 },
    { name: 'Axis Bank', symbol: 'AXISBANK', base_price: 1212, lower_circuit: 1101, upper_circuit: 1344 },
    { name: 'Bajaj Finance', symbol: 'BAJFINANCE', base_price: 991, lower_circuit: 896, upper_circuit: 1094 },
    { name: 'Bajaj Finserv', symbol: 'BAJAJFINSV', base_price: 1767, lower_circuit: 1594, upper_circuit: 1948 },
    { name: 'Bharat Electronics', symbol: 'BEL', base_price: 395, lower_circuit: 354, upper_circuit: 402 },
    { name: 'Bharti Airtel', symbol: 'BHARTIARTL', base_price: 1772, lower_circuit: 1670, upper_circuit: 1963 },
    { name: 'Eternal', symbol: 'ETERNAL', base_price: 336, lower_circuit: 302, upper_circuit: 368 },
    { name: 'HCLTech', symbol: 'HCLTECH', base_price: 1253, lower_circuit: 1134, upper_circuit: 1385 },
    { name: 'HDFC Bank', symbol: 'HDFCBANK', base_price: 731, lower_circuit: 663, upper_circuit: 809 },
    { name: 'Hindustan Unilever', symbol: 'HINDUNILVR', base_price: 1935, lower_circuit: 1746, upper_circuit: 2134 },
    { name: 'ICICI Bank', symbol: 'ICICIBANK', base_price: 1325, lower_circuit: 1194, upper_circuit: 1459 },
    { name: 'IndiGo', symbol: 'INDIGO', base_price: 4935, lower_circuit: 4442, upper_circuit: 5428 },
    { name: 'Infosys', symbol: 'INFY', base_price: 1000, lower_circuit: 901, upper_circuit: 1101 },
    { name: 'ITC', symbol: 'ITC', base_price: 268, lower_circuit: 243, upper_circuit: 295 },
    { name: 'Kotak Mahindra Bank', symbol: 'KOTAKBANK', base_price: 402, lower_circuit: 364, upper_circuit: 443 },
    { name: 'Larsen & Toubro', symbol: 'LT', base_price: 3855, lower_circuit: 3492, upper_circuit: 4266 },
    { name: 'Mahindra & Mahindra', symbol: 'M&M', base_price: 3029, lower_circuit: 2728, upper_circuit: 3334 },
    { name: 'Maruti Suzuki', symbol: 'MARUTI', base_price: 12071, lower_circuit: 10864, upper_circuit: 13278 },
    { name: 'NTPC', symbol: 'NTPC', base_price: 327, lower_circuit: 294, upper_circuit: 358 },
    { name: 'Power Grid Corp', symbol: 'POWERGRID', base_price: 270, lower_circuit: 243, upper_circuit: 296 },
    { name: 'Reliance Industries', symbol: 'RELIANCE', base_price: 1222, lower_circuit: 1104, upper_circuit: 1348 },
    { name: 'State Bank of India', symbol: 'SBIN', base_price: 981, lower_circuit: 885, upper_circuit: 1080 },
    { name: 'Sun Pharma', symbol: 'SUNPHARMA', base_price: 1842, lower_circuit: 1669, upper_circuit: 2038 },
    { name: 'Tata Consultancy Services', symbol: 'TCS', base_price: 2076, lower_circuit: 1876, upper_circuit: 2292 },
    { name: 'Tata Steel', symbol: 'TATASTEEL', base_price: 187, lower_circuit: 169, upper_circuit: 206 },
    { name: 'Tech Mahindra', symbol: 'TECHM', base_price: 1537, lower_circuit: 1393, upper_circuit: 1701 },
    { name: 'Titan Company', symbol: 'TITAN', base_price: 4886, lower_circuit: 4391, upper_circuit: 5366 },
    { name: 'Trent', symbol: 'TRENT', base_price: 2665, lower_circuit: 2400, upper_circuit: 2932 },
    { name: 'UltraTech Cement', symbol: 'ULTRACEMCO', base_price: 11160, lower_circuit: 9990, upper_circuit: 12210 }
  ];

  let targetEventId = specificEventId;
  let targetEventStatus = 'NOT_STARTED';
  if (!targetEventId) {
    const existingEvent = await runner.query(`SELECT id, status FROM events ORDER BY id ASC LIMIT 1`);
    if (existingEvent.rows.length === 0) return;
    targetEventId = existingEvent.rows[0].id;
    targetEventStatus = existingEvent.rows[0].status;
  } else {
    const existingEvent = await runner.query(`SELECT status FROM events WHERE id = $1`, [targetEventId]);
    if (existingEvent.rows.length > 0) {
      targetEventStatus = existingEvent.rows[0].status;
    }
  }

  const currentSecurities = await runner.query(`SELECT id, symbol FROM securities WHERE event_id = $1`, [targetEventId]);
  
  const validSymbols = new Set(actualSecurities.map(s => s.symbol));
  for (const sec of currentSecurities.rows) {
    if (!validSymbols.has(sec.symbol)) {
      await runner.query(`DELETE FROM securities WHERE id = $1`, [sec.id]);
    }
  }

  for (const data of actualSecurities) {
    const initLtp = data.symbol === 'RELIANCE' ? 988 : data.base_price;
    const existing = await runner.query(`SELECT id, initial_ltp FROM securities WHERE event_id = $1 AND symbol = $2`, [targetEventId, data.symbol]);
    
    if (existing.rows.length > 0) {
      if (targetEventStatus === 'NOT_STARTED') {
        // Safe to overwrite initial_ltp and current_ltp because market hasn't started
        await runner.query(`
          UPDATE securities
          SET name = $1, base_price = $2, initial_ltp = $2, current_ltp = $2, lower_circuit = $3, upper_circuit = $4, updated_at = CURRENT_TIMESTAMP
          WHERE event_id = $5 AND symbol = $6
        `, [data.name, initLtp, data.lower_circuit, data.upper_circuit, targetEventId, data.symbol]);
      } else {
        // Market is live or ended, only update bounds and metadata
        await runner.query(`
          UPDATE securities
          SET name = $1, base_price = $2, lower_circuit = $3, upper_circuit = $4, updated_at = CURRENT_TIMESTAMP
          WHERE event_id = $5 AND symbol = $6
        `, [data.name, data.base_price, data.lower_circuit, data.upper_circuit, targetEventId, data.symbol]);
      }

      if (data.symbol === 'RELIANCE' && (existing.rows[0].initial_ltp === 100 || existing.rows[0].initial_ltp === 1234)) {
        await runner.query(`UPDATE securities SET initial_ltp = 988, current_ltp = 988 WHERE id = $1`, [existing.rows[0].id]);
      }
    } else {
      await runner.query(`
        INSERT INTO securities (event_id, name, symbol, base_price, initial_ltp, current_ltp, accumulated_trade_value, threshold_amount, lower_circuit, upper_circuit, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, 0.0, 100000.0, $7, $8, true)
      `, [targetEventId, data.name, data.symbol, data.base_price, initLtp, initLtp, data.lower_circuit, data.upper_circuit]);
    }
  }
}

export async function seedDefaultData(client?: PoolClient) {
  const runner: any = client || pool;
  
  const eventInsert = await runner.query(`
    INSERT INTO events (name, status) VALUES ('Bull Ring Simulation 2026', 'NOT_STARTED') RETURNING id
  `);

  const eventId = eventInsert.rows[0].id;

  await migrateSecurities(eventId, runner);

  const secs = await runner.query(`SELECT id, symbol, initial_ltp FROM securities WHERE event_id = $1`, [eventId]);
  const jobbers = ['JR01', 'JR02'];
  
  for (const jid of jobbers) {
    const jobberInsert = await runner.query(`
      INSERT INTO jobbers (event_id, jobber_identifier)
      VALUES ($1, $2) RETURNING id
    `, [eventId, jid]);
    
    const jobberId = jobberInsert.rows[0].id;
    
    for (const sec of secs.rows) {
      await runner.query(`
        INSERT INTO jobber_inventory (jobber_id, security_id, assigned_quantity, remaining_quantity, assigned_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [jobberId, sec.id, 100000, 100000, Number(sec.initial_ltp)]);
    }
  }

  await runner.query(`
    INSERT INTO audit_logs (event_id, actor, action, metadata)
    VALUES ($1, 'SYSTEM', 'SEED_EVENT_CREATED', $2)
  `, [eventId, JSON.stringify({ message: 'Seeded default event with 30 securities' })]);
}

export async function initDatabase() {
  const client = await pool.connect();
  try {
    const { schemaSql } = await import('./schema');
    await client.query(schemaSql);

    const existingEvent = await client.query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
    if (existingEvent.rows.length === 0) {
      await seedDefaultData(client);
    }

    const existingStage = await client.query(`SELECT id FROM attendance_stages ORDER BY id ASC LIMIT 1`);
    if (existingStage.rows.length === 0) {
      await seedAttendanceData(client);
    }

    const desks = ['VR-01', 'VR-02', 'VR-03', 'VR-04', 'VR-05'];
    for (const desk of desks) {
      await client.query(`INSERT INTO active_desks (desk_id, status) VALUES ($1, 'AVAILABLE') ON CONFLICT DO NOTHING`, [desk]);
    }

    await migrateSecurities(undefined, client);

    // Initialize Auction Securities if missing
    try {
      const existingSecurities = await client.query('SELECT COUNT(*) FROM auction_securities');
      if (Number(existingSecurities.rows[0].count) === 0) {
        const { seedAuctionSecurities } = await import('../scripts/seed_auction_securities');
        await seedAuctionSecurities(client);
      }
    } catch (err) {
      console.error('[DB] Failed to seed auction securities on init', err);
    }

  } finally {
    client.release();
  }
}

export default pool;
