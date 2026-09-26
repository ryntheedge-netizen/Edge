import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../bull_ring.db');
const db = new Database(dbPath);

console.log("Adding Bull Ring activity and assigning Pardeep...");

const insertActivity = db.prepare(`INSERT OR IGNORE INTO edge_activities (name, description) VALUES (?, ?)`);
insertActivity.run('Bull Ring', 'Stock Market Simulation');

const activity = db.prepare(`SELECT id FROM edge_activities WHERE name = 'Bull Ring'`).get() as any;
const pardeep = db.prepare(`SELECT id FROM edge_participants WHERE participant_id = 'EDG26-006'`).get() as any;

if (activity && pardeep) {
  const insertParticipation = db.prepare(`INSERT OR IGNORE INTO edge_event_participations (participant_id, activity_id) VALUES (?, ?)`);
  insertParticipation.run(pardeep.id, activity.id);
  console.log("Assigned Pardeep to Bull Ring.");
}

// Ensure Bull Ring station exists
const insertStation = db.prepare(`INSERT OR IGNORE INTO attendance_stations (station_identifier, name, stage_id, activity_id) VALUES (?, ?, ?, ?)`);
// Assuming Stage 5 is DAY_1_EVENT_SESSION or similar. We'll find a valid EVENT stage.
const eventStage = db.prepare(`SELECT id FROM attendance_stages WHERE stage_type = 'EVENT' LIMIT 1`).get() as any;

if (eventStage && activity) {
  insertStation.run('BULLRING-01', 'Bull Ring Trading Floor', eventStage.id, activity.id);
  console.log("Bull Ring station added.");
}

console.log("Done.");
