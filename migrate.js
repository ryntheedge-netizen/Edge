const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'backend', 'bull_ring.db');
console.log('Migrating database at:', dbPath);

const db = new Database(dbPath);
try {
  try {
    db.exec('ALTER TABLE trades ADD COLUMN idempotency_key TEXT;');
    console.log('Added idempotency_key column.');
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log('idempotency_key column already exists.');
    } else {
      throw e;
    }
  }
  
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_idempotency ON trades(idempotency_key) WHERE idempotency_key IS NOT NULL;');

  // JOBBERS
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        jobber_identifier TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_id, jobber_identifier)
    );
  `);
  console.log('Created jobbers table.');

  // JOBBER INVENTORY
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
  console.log('Created jobber_inventory table.');

  // TRADE AUDIT ID
  try {
    db.exec('ALTER TABLE trades ADD COLUMN audit_id TEXT;');
    console.log('Added audit_id column.');
    db.exec("UPDATE trades SET audit_id = 'TAL' || id WHERE audit_id IS NULL;");
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log('audit_id column already exists.');
    } else {
      throw e;
    }
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_audit_id ON trades(audit_id);');

  // ACQUISITION LOTS (FIFO)
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
  console.log('Created acquisition_lots table.');

  console.log('Migration successful.');
} catch (e) {
  console.error('Migration failed:', e);
}
db.close();
