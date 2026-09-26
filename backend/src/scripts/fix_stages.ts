import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../bull_ring.db');
const db = new Database(dbPath);

console.log("Fixing attendance stages...");

try {
  db.transaction(() => {
    // Soft delete all current stages
    db.exec(`UPDATE attendance_stages SET is_active = 0`);

    const insertActivity = db.prepare(`INSERT OR IGNORE INTO edge_activities (name, description) VALUES (?, ?)`);
    insertActivity.run('Arthneeti', 'Business & Economics Event');
    insertActivity.run('Brand Bazigaar', 'Brand Management Challenge');
    insertActivity.run('AI Ki Baat Cheet', 'AI Hackathon');
    insertActivity.run('Finance Ka Funda', 'Financial Literacy Session');
    insertActivity.run('Bull Ring', 'Trading Simulation');

    const upsertStage = db.prepare(`
      INSERT INTO attendance_stages (name, stage_type, day, is_active) 
      VALUES (?, ?, ?, 1)
      ON CONFLICT(name) DO UPDATE SET is_active = 1, stage_type = excluded.stage_type, day = excluded.day
    `);

    // General Stages
    const generalStages = [
      { name: 'Verification 1', day: 1 },
      { name: 'Verification 2', day: 1 },
      { name: 'Verification 3', day: 1 },
      { name: 'DAY_1_REGISTRATION_BREAKFAST', day: 1 },
      { name: 'DAY_1_LUNCH', day: 1 },
      { name: 'DAY_2_BREAKFAST', day: 2 },
      { name: 'DAY_2_LUNCH', day: 2 },
      { name: 'CERTIFICATE_COLLECTION', day: 2 }
    ];

    for (const st of generalStages) {
      upsertStage.run(st.name, 'GENERAL', st.day);
    }

    // Event Stages
    const events = ['Arthneeti', 'Finance Ka Funda', 'Brand Bazigaar', 'Bull Ring', 'AI Ki Baat Cheet'];
    for (const ev of events) {
      upsertStage.run(`${ev} - Day 1`, 'EVENT', 1);
      upsertStage.run(`${ev} - Day 2`, 'EVENT', 2);
    }
    
    // Stations - let's make sure stations exist for these
    // Soft delete existing stations to avoid clutter? Or just leave them. The user mentioned removing redundant scanning stages from the active UI.
    db.exec(`UPDATE attendance_stations SET is_active = 0`);
    
    const upsertStation = db.prepare(`
      INSERT INTO attendance_stations (station_identifier, name, stage_id, activity_id, is_active)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(station_identifier) DO UPDATE SET is_active = 1, stage_id = excluded.stage_id, activity_id = excluded.activity_id
    `);

    // Re-create stations for the active stages
    const activeStages = db.prepare(`SELECT id, name, stage_type, day FROM attendance_stages WHERE is_active = 1`).all() as any[];
    const activities = db.prepare(`SELECT id, name FROM edge_activities`).all() as any[];

    for (const stage of activeStages) {
      if (stage.stage_type === 'GENERAL') {
        upsertStation.run(`GEN-STATION-${stage.id}`, `${stage.name} Station`, stage.id, null);
      } else {
        // Find activity ID based on stage name
        const act = activities.find(a => stage.name.startsWith(a.name));
        if (act) {
          upsertStation.run(`EVT-STATION-${stage.id}`, `${stage.name} Station`, stage.id, act.id);
        }
      }
    }
  })();
  console.log("Stages fixed successfully.");
} catch (err) {
  console.error("Failed to fix stages:", err);
}
