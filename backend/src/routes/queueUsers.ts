import { Router, Request, Response } from 'express';
import { query } from '../db/database';
import { authenticateSuperadmin } from './auth';

const router = Router();

// Queue-user assignment only. The existing auth.ts in the old system uses
// environment-backed users, so this route deliberately does NOT invent a
// second login system. It stores which existing login username may manage
// which activity. Auth/login changes are required separately if you want
// brand-new usernames created from the UI.
async function ensureAssignmentSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS edge_queue_user_assignments (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      activity_id INTEGER NOT NULL REFERENCES edge_activities(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(username, activity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_edge_queue_user_assignments_username
      ON edge_queue_user_assignments(username);
  `);
}

router.get('/users', authenticateSuperadmin, async (_req: Request, res: Response) => {
  try {
    await ensureAssignmentSchema();
    const result = await query(`
      SELECT username, array_agg(activity_id ORDER BY activity_id) AS activity_ids
      FROM edge_queue_user_assignments
      GROUP BY username
      ORDER BY username
    `);
    res.json({ users: result.rows });
  } catch (err) {
    console.error('[QueueUsers] list', err);
    res.status(500).json({ error: 'Failed to load queue user assignments' });
  }
});

router.post('/assign', authenticateSuperadmin, async (req: Request, res: Response) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const activityId = Number(req.body.activityId);
  if (!username || !activityId) return res.status(400).json({ error: 'username and activityId are required' });

  try {
    await ensureAssignmentSchema();
    const activity = await query('SELECT id, name FROM edge_activities WHERE id = $1', [activityId]);
    if (!activity.rows.length) return res.status(404).json({ error: 'Activity not found' });

    await query(`
      INSERT INTO edge_queue_user_assignments (username, activity_id)
      VALUES ($1, $2)
      ON CONFLICT (username, activity_id) DO NOTHING
    `, [username, activityId]);

    res.json({ success: true, username, activityId });
  } catch (err) {
    console.error('[QueueUsers] assign', err);
    res.status(500).json({ error: 'Failed to assign queue user' });
  }
});

router.post('/unassign', authenticateSuperadmin, async (req: Request, res: Response) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const activityId = Number(req.body.activityId);
  if (!username || !activityId) return res.status(400).json({ error: 'username and activityId are required' });

  try {
    await ensureAssignmentSchema();
    await query('DELETE FROM edge_queue_user_assignments WHERE username = $1 AND activity_id = $2', [username, activityId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[QueueUsers] unassign', err);
    res.status(500).json({ error: 'Failed to unassign queue user' });
  }
});

export default router;
