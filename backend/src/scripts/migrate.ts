import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../bull_ring.db');
const db = new Database(dbPath);

console.log("Starting migrations...");

try {
  // Check if contact exists in edge_participants
  const tableInfoParticipants = db.pragma('table_info(edge_participants)') as any[];
  if (!tableInfoParticipants.some((col: any) => col.name === 'contact')) {
    db.exec(`ALTER TABLE edge_participants ADD COLUMN contact TEXT;`);
    console.log("Added contact to edge_participants");
  }

  // Check if team_code exists in edge_teams
  const tableInfoTeams = db.pragma('table_info(edge_teams)') as any[];
  if (!tableInfoTeams.some((col: any) => col.name === 'team_code')) {
    db.exec('PRAGMA foreign_keys=off;');
    db.transaction(() => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS edge_teams_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              team_code TEXT UNIQUE,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          INSERT INTO edge_teams_new (id, name, created_at)
          SELECT id, name, created_at FROM edge_teams;
          DROP TABLE edge_teams;
          ALTER TABLE edge_teams_new RENAME TO edge_teams;
        `);
    })();
    db.exec('PRAGMA foreign_keys=on;');
    console.log("Added team_code to edge_teams by recreating table");
  }

  // Check if status exists in attendance_stations
  const tableInfoStations = db.pragma('table_info(attendance_stations)') as any[];
  if (!tableInfoStations.some((col: any) => col.name === 'status')) {
    db.exec(`ALTER TABLE attendance_stations ADD COLUMN status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED', 'ACTIVE', 'STOPPED'));`);
    console.log("Added status to attendance_stations");
  }
  
  // Re-creating attendance_stages is tricky in SQLite due to foreign keys. 
  // Wait, SQLite doesn't enforce CHECK constraints added via ALTER very well, or rather we can't alter CHECK constraints. 
  // We can just create a new table, copy data, and rename. 
  // But wait, the app can just ignore the CHECK constraint if we turn it off, or we can just recreate it.
  
  db.exec('PRAGMA foreign_keys=off;');
  db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS attendance_stages_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            stage_type TEXT NOT NULL CHECK(stage_type IN ('GENERAL', 'EVENT')),
            day INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED', 'ACTIVE', 'FINALIZED', 'REOPENED')),
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO attendance_stages_new (id, name, stage_type, day, status, is_active, created_at)
        SELECT id, name, stage_type, day, status, is_active, created_at FROM attendance_stages;
        DROP TABLE attendance_stages;
        ALTER TABLE attendance_stages_new RENAME TO attendance_stages;
      `);
  })();
  db.exec('PRAGMA foreign_keys=on;');
  console.log("Recreated attendance_stages to support REOPENED status");

  console.log("Migrations complete.");
} catch (err) {
  console.error("Migration failed:", err);
}
