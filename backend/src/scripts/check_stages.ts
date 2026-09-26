import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../bull_ring.db');
const db = new Database(dbPath);

console.log("Checking stages...");
const stages = db.prepare('SELECT * FROM attendance_stages').all() as any[];
console.log(stages);

// If there are duplicates, we need to delete the ones without expected counts or re-link stations and delete.
// The UI showed the first 4 having empty expected counts (because they might have been created wrong? wait, expected count query:
// (SELECT COUNT(*) FROM edge_participants WHERE is_active = 1) as expected
// Why would the expected count be empty for the first 4?
// Ah! In my backend query, I check:
// WHERE s.stage_type = 'GENERAL' AND s.is_active = 1
// If the first 4 stages have NULL or empty expected... wait, the query unconditionally does (SELECT COUNT(*) FROM edge_participants...) which should ALWAYS return 6.
// Why did the screenshot show empty expected for the first 4?
// Let's look at the React component:
// `const pct = typeof expected === 'number' && expected > 0 ? ((s.present / expected) * 100).toFixed(1) + '%' : (expected === 0 ? '0%' : '-');`
// If expected is null, it prints nothing? 
// No, React prints nothing if it's undefined.

// Wait, let's look at `AttendanceDashboard.tsx`
// I'll query the actual stages first.
