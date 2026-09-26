import { Router, Request, Response } from 'express';
import pool, { query, withTransaction } from '../db/database';
import { authenticateAdmin } from './auth';
import { PoolClient } from 'pg';

const router = Router();

// Get all desks
router.get('/', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const desksRes = await query(`SELECT * FROM active_desks ORDER BY desk_id ASC`);
    res.json(desksRes.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Claim a desk
router.post('/claim', authenticateAdmin, async (req: Request, res: Response) => {
  const { deskId, sessionToken } = req.body;
  if (!deskId || !sessionToken) {
    return res.status(400).json({ error: 'Desk ID and Session Token are required' });
  }

  try {
    const result = await withTransaction(async (client: PoolClient) => {
      const deskRes = await client.query(`SELECT * FROM active_desks WHERE desk_id = $1 FOR UPDATE`, [deskId]);
      if (deskRes.rows.length === 0) throw new Error('Invalid Desk ID');
      const desk = deskRes.rows[0];
      
      if (desk.status === 'ACTIVE' && desk.session_token !== sessionToken) {
        throw new Error(`${deskId} is currently active on another session.`);
      }

      await client.query(`UPDATE active_desks SET status = 'ACTIVE', session_token = $1 WHERE desk_id = $2`, [sessionToken, deskId]);
      return { success: true, deskId };
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Release a desk
router.post('/release', authenticateAdmin, async (req: Request, res: Response) => {
  const { deskId, sessionToken } = req.body;
  try {
    await query(`UPDATE active_desks SET status = 'AVAILABLE', session_token = NULL WHERE desk_id = $1 AND session_token = $2`, [deskId, sessionToken]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Superadmin force override
router.post('/override', authenticateAdmin, async (req: Request, res: Response) => {
  const { deskId } = req.body;
  try {
    await query(`UPDATE active_desks SET status = 'AVAILABLE', session_token = NULL WHERE desk_id = $1`, [deskId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
