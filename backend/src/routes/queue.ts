import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/database';
import { PoolClient } from 'pg';
import { authenticateAdmin } from './auth';
import { broadcastEvent } from '../websocket/socketServer';

const router = Router();

async function ensureQueueSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS edge_queue_rounds (
      id SERIAL PRIMARY KEY,
      activity_id INTEGER NOT NULL REFERENCES edge_activities(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL CHECK (round_number > 0),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(activity_id, round_number)
    );

    CREATE TABLE IF NOT EXISTS edge_queue_entries (
      id SERIAL PRIMARY KEY,
      round_id INTEGER NOT NULL REFERENCES edge_queue_rounds(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES edge_teams(id) ON DELETE CASCADE,
      token_number INTEGER NOT NULL,
      location TEXT NOT NULL DEFAULT 'WAITING'
        CHECK (location IN ('WAITING', 'EVALUATION_1', 'EVALUATION_2', 'COMPLETED')),
      queue_position INTEGER NOT NULL,
      entered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(round_id, team_id),
      UNIQUE(round_id, token_number)
    );

    CREATE INDEX IF NOT EXISTS idx_edge_queue_entries_round_location
      ON edge_queue_entries(round_id, location, queue_position);
  `);
}

async function ensureRound(activityId: number, roundNumber: number, client?: PoolClient) {
  const runner: any = client || { query };
  const result = await runner.query(
    `INSERT INTO edge_queue_rounds (activity_id, round_number)
     VALUES ($1, $2)
     ON CONFLICT (activity_id, round_number) DO UPDATE SET round_number = EXCLUDED.round_number
     RETURNING id, activity_id, round_number`,
    [activityId, roundNumber]
  );
  return result.rows[0];
}

async function syncTeams(roundId: number, activityId: number, client?: PoolClient) {
  const runner: any = client || { query };
  const teams = await runner.query(`
    SELECT DISTINCT t.id, t.name, t.team_code
    FROM edge_teams t
    JOIN edge_participants p ON p.team_id = t.id AND p.is_active = true
    JOIN edge_event_participations ep ON ep.participant_id = p.id
    WHERE ep.activity_id = $1
    ORDER BY t.id ASC
  `, [activityId]);

  const existing = await runner.query(`SELECT team_id FROM edge_queue_entries WHERE round_id = $1`, [roundId]);
  const existingIds = new Set(existing.rows.map((row: any) => Number(row.team_id)));
  const maxRes = await runner.query(`SELECT COALESCE(MAX(token_number), 0) AS max_token FROM edge_queue_entries WHERE round_id = $1`, [roundId]);
  let nextToken = Number(maxRes.rows[0].max_token) + 1;
  let nextPosition = Number((await runner.query(`SELECT COALESCE(MAX(queue_position), 0) AS max_position FROM edge_queue_entries WHERE round_id = $1`, [roundId])).rows[0].max_position) + 1;

  for (const team of teams.rows) {
    if (existingIds.has(Number(team.id))) continue;
    await runner.query(`
      INSERT INTO edge_queue_entries (round_id, team_id, token_number, location, queue_position)
      VALUES ($1, $2, $3, 'WAITING', $4)
    `, [roundId, team.id, nextToken, nextPosition]);
    nextToken += 1;
    nextPosition += 1;
  }
}


async function getBoard(activityId: number, roundNumber: number) {
  await ensureQueueSchema();
  const round = await ensureRound(activityId, roundNumber);
  await syncTeams(round.id, activityId);

  const activity = await query(`SELECT id, name FROM edge_activities WHERE id = $1`, [activityId]);
  if (!activity.rows.length) throw new Error('Activity not found');

  const entries = await query(`
    SELECT q.id, q.token_number, q.location, q.queue_position,
           q.entered_at, q.updated_at,
           t.id AS team_id, t.name AS team_name, t.team_code
    FROM edge_queue_entries q
    JOIN edge_teams t ON t.id = q.team_id
    WHERE q.round_id = $1
    ORDER BY q.queue_position ASC
  `, [round.id]);

  return {
    activity: activity.rows[0],
    round: round.round_number,
    roundId: round.id,
    entries: entries.rows,
  };
}

router.get('/activities', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    await ensureQueueSchema();
    const result = await query(`SELECT id, name FROM edge_activities ORDER BY id ASC`);
    res.json({ activities: result.rows });
  } catch (err) {
    console.error('[Queue] activities', err);
    res.status(500).json({ error: 'Failed to load activities' });
  }
});

router.get('/board', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const activityId = Number(req.query.activityId);
    const round = Number(req.query.round || 1);
    if (!activityId || !Number.isInteger(round) || round < 1) {
      return res.status(400).json({ error: 'activityId and a valid round are required' });
    }
    res.json(await getBoard(activityId, round));
  } catch (err: any) {
    console.error('[Queue] board', err);
    res.status(500).json({ error: err.message || 'Failed to load queue' });
  }
});

router.post('/move-next', authenticateAdmin, async (req: Request, res: Response) => {
  const activityId = Number(req.body.activityId);
  const roundNumber = Number(req.body.round || 1);
  const room = req.body.room;

  if (!activityId || !['EVALUATION_1', 'EVALUATION_2'].includes(room)) {
    return res.status(400).json({ error: 'activityId and room are required' });
  }

  try {
    await ensureQueueSchema();
    const result = await withTransaction(async (client) => {
      const round = await ensureRound(activityId, roundNumber, client);
      await syncTeams(round.id, activityId, client);

      const roomBusy = await client.query(
        `SELECT id FROM edge_queue_entries WHERE round_id = $1 AND location = $2 LIMIT 1 FOR UPDATE`,
        [round.id, room]
      );
      if (roomBusy.rows.length) throw new Error('That evaluation room is currently occupied.');

      const next = await client.query(`
        SELECT q.id, q.token_number, t.name AS team_name, t.team_code
        FROM edge_queue_entries q
        JOIN edge_teams t ON t.id = q.team_id
        WHERE q.round_id = $1 AND q.location = 'WAITING'
        ORDER BY q.queue_position ASC
        LIMIT 1
        FOR UPDATE OF q
      `, [round.id]);

      if (!next.rows.length) throw new Error('No teams are waiting.');

      const updated = await client.query(`
        UPDATE edge_queue_entries
        SET location = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, token_number
      `, [room, next.rows[0].id]);

      return { ...next.rows[0], ...updated.rows[0] };
    });

    broadcastEvent('queue-updated', { activityId, round: roundNumber });
    res.json({ success: true, entry: result });
  } catch (err: any) {
    const message = err.message || 'Failed to move next team';
    res.status(message.includes('occupied') || message.includes('No teams') ? 409 : 500).json({ error: message });
  }
});

router.post('/complete', authenticateAdmin, async (req: Request, res: Response) => {
  const activityId = Number(req.body.activityId);
  const roundNumber = Number(req.body.round || 1);
  const room = req.body.room;

  if (!activityId || !['EVALUATION_1', 'EVALUATION_2'].includes(room)) {
    return res.status(400).json({ error: 'activityId and room are required' });
  }

  try {
    await ensureQueueSchema();
    await withTransaction(async (client) => {
      const round = await ensureRound(activityId, roundNumber, client);
      const result = await client.query(`
        UPDATE edge_queue_entries
        SET location = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
        WHERE round_id = $1 AND location = $2
        RETURNING id
      `, [round.id, room]);
      if (!result.rows.length) throw new Error('That evaluation room is already empty.');
    });

    broadcastEvent('queue-updated', { activityId, round: roundNumber });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message.includes('empty') ? 409 : 500).json({ error: err.message || 'Failed to complete team' });
  }
});

router.post('/reset', authenticateAdmin, async (req: Request, res: Response) => {
  const activityId = Number(req.body.activityId);
  const roundNumber = Number(req.body.round || 1);
  if (!activityId) return res.status(400).json({ error: 'activityId is required' });

  try {
    await ensureQueueSchema();
    await withTransaction(async (client) => {
      const round = await ensureRound(activityId, roundNumber, client);
      await client.query(`DELETE FROM edge_queue_entries WHERE round_id = $1`, [round.id]);
      await syncTeams(round.id, activityId, client);
    });
    broadcastEvent('queue-updated', { activityId, round: roundNumber });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset queue' });
  }
});

export default router;
