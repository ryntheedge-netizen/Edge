import Database from 'better-sqlite3';

export function migrate(db: Database.Database) {
  // 1. Create jobbers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        jobber_identifier TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, jobber_identifier)
    );
  `);

  // 2. Create jobber inventory table
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobber_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        jobber_id INTEGER NOT NULL REFERENCES jobbers(id) ON DELETE CASCADE,
        security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
        assigned_quantity INTEGER NOT NULL DEFAULT 0,
        remaining_quantity INTEGER NOT NULL DEFAULT 0,
        assigned_price REAL NOT NULL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(jobber_id, security_id)
    );
  `);

  // 3. Add audit_id to trades
  try {
    db.exec(`ALTER TABLE trades ADD COLUMN audit_id TEXT;`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_audit_id ON trades(audit_id);`);
    
    // Backfill audit_id for existing trades
    db.exec(`UPDATE trades SET audit_id = 'TAL' || id WHERE audit_id IS NULL;`);
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      throw e;
    }
  }

  // 4. Create acquisition_lots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS acquisition_lots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
        trader_id TEXT NOT NULL,
        security_id INTEGER NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
        original_quantity INTEGER NOT NULL,
        remaining_quantity INTEGER NOT NULL,
        acquisition_price REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('Bull Ring enhancements migration completed successfully.');
}
