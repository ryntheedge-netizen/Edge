import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../../bull_ring.db');
const db = new Database(dbPath);

console.log('Running attendance enhancements migration...');

try {
  // 1. Add status column to attendance_stages
  try {
    db.prepare(`ALTER TABLE attendance_stages ADD COLUMN status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED', 'ACTIVE', 'FINALIZED'))`).run();
    console.log('Added status column to attendance_stages.');
  } catch (err: any) {
    if (err.message.includes('duplicate column name')) {
      console.log('status column already exists in attendance_stages.');
    } else {
      throw err;
    }
  }

  // 2. Create attendance_snapshots table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS attendance_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stage_id INTEGER NOT NULL REFERENCES attendance_stages(id) ON DELETE CASCADE,
        expected_count INTEGER NOT NULL,
        present_count INTEGER NOT NULL,
        absent_count INTEGER NOT NULL,
        finalized_by TEXT NOT NULL,
        finalized_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  console.log('attendance_snapshots table ready.');

  // 3. Update existing activities
  db.prepare(`UPDATE edge_activities SET name = 'Brand Bazigaar' WHERE name = 'Brand'`).run();
  db.prepare(`UPDATE edge_activities SET name = 'AI Ki Baat Cheet' WHERE name = 'AI'`).run();

  // Ensure Bull Ring exists
  const bullRingExists = db.prepare(`SELECT id FROM edge_activities WHERE name = 'Bull Ring'`).get();
  if (!bullRingExists) {
    db.prepare(`INSERT INTO edge_activities (name, description) VALUES ('Bull Ring', 'Bull Ring Trading Simulation')`).run();
  }
  console.log('Activities updated.');

  // 4. Ensure all stages and stations exist
  const activities = db.prepare(`SELECT id, name FROM edge_activities`).all() as {id: number, name: string}[];
  
  const ensureStage = (name: string, type: 'GENERAL' | 'EVENT', day: number) => {
    let stage = db.prepare(`SELECT id FROM attendance_stages WHERE name = ?`).get(name) as any;
    if (!stage) {
      const res = db.prepare(`INSERT INTO attendance_stages (name, stage_type, day, status) VALUES (?, ?, ?, 'ACTIVE')`).run(name, type, day);
      return res.lastInsertRowid;
    }
    // Update existing to ACTIVE so we can test finalization
    db.prepare(`UPDATE attendance_stages SET status = 'ACTIVE' WHERE id = ?`).run(stage.id);
    return stage.id;
  };

  const ensureStation = (ident: string, name: string, stageId: any, activityId: any = null) => {
    let station = db.prepare(`SELECT id FROM attendance_stations WHERE station_identifier = ?`).get(ident) as any;
    if (!station) {
      db.prepare(`INSERT INTO attendance_stations (station_identifier, name, stage_id, activity_id) VALUES (?, ?, ?, ?)`).run(ident, name, stageId, activityId);
    }
  };

  // GENERAL
  const s1 = ensureStage('Day 1 Registration & Breakfast', 'GENERAL', 1);
  const s2 = ensureStage('Day 1 Lunch', 'GENERAL', 1);
  const s3 = ensureStage('Day 2 Breakfast', 'GENERAL', 2);
  const s4 = ensureStage('Day 2 Lunch', 'GENERAL', 2);

  ensureStation('G-D1-REG', 'Registration Desk 1', s1);
  ensureStation('G-D1-LUN', 'Lunch Area Desk 1', s2);
  ensureStation('G-D2-BF', 'Breakfast Desk 1', s3);
  ensureStation('G-D2-LUN', 'Lunch Area Desk 2', s4);

  // EVENTS
  for (const act of activities) {
    const sD1 = ensureStage(`${act.name} Day 1`, 'EVENT', 1);
    const sD2 = ensureStage(`${act.name} Day 2`, 'EVENT', 2);

    const prefix = act.name.substring(0, 3).toUpperCase();
    ensureStation(`E-${prefix}-D1-1`, `${act.name} Entrance (D1)`, sD1, act.id);
    ensureStation(`E-${prefix}-D2-1`, `${act.name} Entrance (D2)`, sD2, act.id);
  }
  
  console.log('Stages and stations verified.');
  console.log('Migration completed successfully.');

} catch (err) {
  console.error('Migration failed:', err);
}
