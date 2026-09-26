import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../bull_ring.db');
const db = new Database(dbPath);

console.log("Seeding remaining team members and stations...");

// Get Team X ID
const team = db.prepare(`SELECT id FROM edge_teams WHERE name = 'Team X'`).get() as any;
const teamId = team.id;

// Team Members
const members = [
  { id: 'EDG26-002', name: 'Om', participations: ['Arthneeti', 'Brand'] },
  { id: 'EDG26-003', name: 'Sakshi', participations: ['Finance ka Funda'] },
  { id: 'EDG26-004', name: 'Rushabh', participations: ['Brand'] },
  { id: 'EDG26-005', name: 'Ansh', participations: ['AI'] },
  { id: 'EDG26-006', name: 'Pardeep bhai', participations: [] },
];

const insertParticipant = db.prepare(`INSERT OR IGNORE INTO edge_participants (participant_id, name, team_id) VALUES (?, ?, ?)`);
const insertParticipation = db.prepare(`INSERT OR IGNORE INTO edge_event_participations (participant_id, activity_id) VALUES (?, ?)`);

members.forEach(m => {
  insertParticipant.run(m.id, m.name, teamId);
  const pRecord = db.prepare(`SELECT id FROM edge_participants WHERE participant_id = ?`).get(m.id) as any;
  
  m.participations.forEach(actName => {
    const act = db.prepare(`SELECT id FROM edge_activities WHERE name = ?`).get(actName) as any;
    if (act) {
      insertParticipation.run(pRecord.id, act.id);
    }
  });
});
console.log("Team members seeded.");

// Remaining Stations
const insertStation = db.prepare(`INSERT OR IGNORE INTO attendance_stations (station_identifier, name, stage_id, activity_id) VALUES (?, ?, ?, ?)`);

// General Stages (Assumed IDs based on insertion order: 1=D1_REG, 2=D1_LUNCH, 3=D2_BREAKFAST, 4=D2_LUNCH)
insertStation.run('D1-LUNCH-01', 'Day 1 Lunch Area', 2, null);
insertStation.run('D2-BRK-01', 'Day 2 Breakfast Area', 3, null);
insertStation.run('D2-LUNCH-01', 'Day 2 Lunch Area', 4, null);

// Event Stages (Assumed IDs: 5=D1_EVENT, 6=D2_EVENT)
// Activities (1=Arthneeti, 2=Brand, 3=AI, 4=Finance)
insertStation.run('BRAND-01', 'Brand Management Hall', 5, 2);
insertStation.run('AI-01', 'AI Hackathon Lab', 6, 3);
insertStation.run('FIN-01', 'Finance ka Funda Room', 5, 4);

console.log("Stations seeded.");
