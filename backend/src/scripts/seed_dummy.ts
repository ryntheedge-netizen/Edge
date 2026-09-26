import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../bull_ring.db');
const db = new Database(dbPath);

console.log("Checking for dummy data...");

const teamExists = db.prepare(`SELECT id FROM edge_teams WHERE name = 'Team X'`).get();
if (!teamExists) {
  const insertTeam = db.prepare(`INSERT INTO edge_teams (name) VALUES (?)`).run('Team X');
  const teamId = Number(insertTeam.lastInsertRowid);
  const insertParticipant = db.prepare(`INSERT INTO edge_participants (participant_id, name, team_id) VALUES (?, ?, ?)`).run('EDG26-001', 'Sarthak', teamId);
  const participantId = Number(insertParticipant.lastInsertRowid);
  db.prepare(`INSERT INTO edge_event_participations (participant_id, activity_id) VALUES (?, ?)`).run(participantId, 1);
  console.log("Dummy team and participant seeded.");
}

const stationExists = db.prepare(`SELECT id FROM attendance_stations WHERE station_identifier = 'D1-REG-01'`).get();
if (!stationExists) {
  db.prepare(`INSERT INTO attendance_stations (station_identifier, name, stage_id, activity_id) VALUES (?, ?, ?, ?)`).run('D1-REG-01', 'Registration Desk 1', 1, null);
  db.prepare(`INSERT INTO attendance_stations (station_identifier, name, stage_id, activity_id) VALUES (?, ?, ?, ?)`).run('ARTH-01', 'Arthneeti Entrance', 5, 1);
  console.log("Dummy stations seeded.");
}

console.log("Seeding complete.");
