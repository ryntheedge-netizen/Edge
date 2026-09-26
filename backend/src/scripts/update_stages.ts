import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../bull_ring.db');
const db = new Database(dbPath);

console.log("Updating stage names...");

// Update Stage Names for cleaner UI
db.prepare(`UPDATE attendance_stages SET name = 'Day 1 Registration & Breakfast' WHERE name = 'DAY_1_REGISTRATION_BREAKFAST'`).run();
db.prepare(`UPDATE attendance_stages SET name = 'Day 1 Lunch' WHERE name = 'DAY_1_LUNCH'`).run();
db.prepare(`UPDATE attendance_stages SET name = 'Day 2 Breakfast' WHERE name = 'DAY_2_BREAKFAST'`).run();
db.prepare(`UPDATE attendance_stages SET name = 'Day 2 Lunch' WHERE name = 'DAY_2_LUNCH'`).run();

// The user noted that events are for BOTH days. 
// Instead of having a Day 1 and Day 2 event session that requires switching stations, 
// we will rename DAY_1_EVENT_SESSION to 'Event Session (Both Days)' 
// so they can be scanned during the event across either day.
db.prepare(`UPDATE attendance_stages SET name = 'Event Sessions (All Days)' WHERE name = 'DAY_1_EVENT_SESSION'`).run();

// Hide DAY_2_EVENT_SESSION since we merged it conceptually into the one above for these stations, 
// or we can just rename it and keep it inactive so it doesn't clutter the dashboard.
db.prepare(`UPDATE attendance_stages SET is_active = 0 WHERE name = 'DAY_2_EVENT_SESSION'`).run();

console.log("Stage names updated successfully.");
