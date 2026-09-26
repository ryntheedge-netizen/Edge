import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../bull_ring.db');
const db = new Database(dbPath);

console.log("Updating activities and stations...");

// Update Activities
db.prepare(`UPDATE edge_activities SET name = 'Brand Bazigaar' WHERE name = 'Brand'`).run();
db.prepare(`UPDATE edge_activities SET name = 'AI ki baat cheet' WHERE name = 'AI'`).run();

// The user wants exact station names and order:
// 1. registration desk 1 
// 2. day 1 lunch 
// 3. day 2 breakfast 
// 4. day 2 lunch 
// 5. Arthneeti 
// 6. bull ring 
// 7. finance ka funda 
// 8. brand bazigaar
// 9. ai ki baat cheet

// Let's clear existing stations to reset the auto-increment order
db.prepare(`DELETE FROM attendance_stations`).run();

// Helper to get stage/activity
const getStageId = (type: string, day: number) => {
  return (db.prepare(`SELECT id FROM attendance_stages WHERE stage_type = ? AND day = ?`).get(type, day) as any)?.id;
};
const getGeneralStageId = (name: string) => {
  return (db.prepare(`SELECT id FROM attendance_stages WHERE name = ?`).get(name) as any)?.id;
};
const getActivityId = (name: string) => {
  return (db.prepare(`SELECT id FROM edge_activities WHERE name = ? COLLATE NOCASE`).get(name) as any)?.id;
};

const insertStation = db.prepare(`INSERT INTO attendance_stations (station_identifier, name, stage_id, activity_id) VALUES (?, ?, ?, ?)`);

// Insert in specific order so their IDs are sequential
insertStation.run('ST-01', 'registration desk 1', getGeneralStageId('DAY_1_REGISTRATION_BREAKFAST'), null);
insertStation.run('ST-02', 'day 1 lunch', getGeneralStageId('DAY_1_LUNCH'), null);
insertStation.run('ST-03', 'day 2 breakfast', getGeneralStageId('DAY_2_BREAKFAST'), null);
insertStation.run('ST-04', 'day 2 lunch', getGeneralStageId('DAY_2_LUNCH'), null);
insertStation.run('ST-05', 'Arthneeti', getStageId('EVENT', 1), getActivityId('Arthneeti'));
insertStation.run('ST-06', 'bull ring', getStageId('EVENT', 1), getActivityId('Bull Ring'));
insertStation.run('ST-07', 'finance ka funda', getStageId('EVENT', 1), getActivityId('Finance ka Funda'));
insertStation.run('ST-08', 'brand bazigaar', getStageId('EVENT', 1), getActivityId('Brand Bazigaar'));
insertStation.run('ST-09', 'ai ki baat cheet', getStageId('EVENT', 1), getActivityId('AI ki baat cheet'));

console.log("Update complete.");
