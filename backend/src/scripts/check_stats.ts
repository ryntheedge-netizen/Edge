import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../bull_ring.db');
const db = new Database(dbPath);

const generalStages = db.prepare(`
  SELECT 
    id, name, 'GENERAL' as stage_type,
    (SELECT COUNT(*) FROM attendance_records r WHERE r.stage_id = s.id) as present,
    (SELECT COUNT(*) FROM edge_participants WHERE is_active = 1) as expected
  FROM attendance_stages s
  WHERE s.stage_type = 'GENERAL' AND s.is_active = 1
`).all();

const eventStages = db.prepare(`
  SELECT 
    id, name, 'EVENT' as stage_type,
    (SELECT COUNT(*) FROM attendance_records r WHERE r.activity_id = a.id) as present,
    (SELECT COUNT(*) FROM edge_event_participations ep JOIN edge_participants p ON ep.participant_id = p.id WHERE ep.activity_id = a.id AND p.is_active = 1) as expected
  FROM edge_activities a
`).all();

const stageStats = [...generalStages, ...eventStages];
console.log(JSON.stringify(stageStats, null, 2));
