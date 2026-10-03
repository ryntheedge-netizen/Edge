import { Router, Request, Response } from 'express';
import pool, { query, withTransaction } from '../db/database';
import { authenticateSuperadmin } from './auth';
import { PoolClient } from 'pg';

const router = Router();

// Superadmin: Get all jobbers and their inventory
router.get('/', authenticateSuperadmin, async (_req: Request, res: Response) => {
  try {
    const eventRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    const event = eventRes.rows[0];

    const jobbersRes = await query(`SELECT * FROM jobbers WHERE event_id = $1 ORDER BY jobber_identifier ASC`, [event.id]);
    const jobbers = jobbersRes.rows;
    
    const inventoriesRes = await query(`
      SELECT ji.*, s.name as security_name, s.symbol as security_symbol
      FROM jobber_inventory ji
      JOIN securities s ON ji.security_id = s.id
      WHERE s.event_id = $1
    `, [event.id]);
    const inventories = inventoriesRes.rows;

    const invMap = new Map();
    for (const inv of inventories) {
      if (!invMap.has(inv.jobber_id)) {
        invMap.set(inv.jobber_id, []);
      }
      invMap.get(inv.jobber_id).push({
        ...inv,
        assigned_price: Number(inv.assigned_price)
      });
    }

    const result = jobbers.map(j => ({
      ...j,
      inventory: invMap.get(j.id) || []
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch jobbers' });
  }
});

// Superadmin: Configure jobber count (creates default jobbers)
router.post('/count', authenticateSuperadmin, async (req: Request, res: Response) => {
  try {
    const { count } = req.body;
    if (typeof count !== 'number' || count < 0) {
      return res.status(400).json({ error: 'Invalid jobber count' });
    }

    const eventRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    const event = eventRes.rows[0];

    await withTransaction(async (client: PoolClient) => {
      const existingRes = await client.query(`SELECT COUNT(*) as count FROM jobbers WHERE event_id = $1`, [event.id]);
      const currentCount = Number(existingRes.rows[0].count);

      if (count > currentCount) {
        for (let i = currentCount + 1; i <= count; i++) {
          await client.query(`INSERT INTO jobbers (event_id, jobber_identifier) VALUES ($1, $2)`, [event.id, `JR${i.toString().padStart(2, '0')}`]);
        }
      } else if (count < currentCount) {
        const toDeleteRes = await client.query(`SELECT id FROM jobbers WHERE event_id = $1 ORDER BY id DESC LIMIT $2`, [event.id, currentCount - count]);
        for (const j of toDeleteRes.rows) {
          await client.query(`DELETE FROM jobbers WHERE id = $1`, [j.id]);
        }
      }

      const currentJobbersRes = await client.query(`SELECT id FROM jobbers WHERE event_id = $1`, [event.id]);
      const currentJobbers = currentJobbersRes.rows;
      const securitiesRes = await client.query(`SELECT id, current_ltp FROM securities WHERE event_id = $1 AND is_active = true`, [event.id]);
      const securities = securitiesRes.rows;
      
      for (const j of currentJobbers) {
        for (const s of securities) {
          await client.query(`
            INSERT INTO jobber_inventory (jobber_id, security_id, assigned_quantity, remaining_quantity, assigned_price)
            VALUES ($1, $2, 10000, 10000, $3)
            ON CONFLICT DO NOTHING
          `, [j.id, s.id, Number(s.current_ltp)]);
        }
      }
    });

    res.json({ message: 'Jobber count updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update jobber count' });
  }
});

// Superadmin: Configure a specific jobber's inventory
router.post('/:id/inventory', authenticateSuperadmin, async (req: Request, res: Response) => {
  try {
    const jobberId = Number(req.params.id);
    const { items } = req.body;
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array' });
    }

    await withTransaction(async (client: PoolClient) => {
      await client.query(`DELETE FROM jobber_inventory WHERE jobber_id = $1`, [jobberId]);
      
      for (const item of items) {
        if (!item.security_id || typeof item.quantity !== 'number' || typeof item.price !== 'number') {
          throw new Error('Invalid item format. Needs security_id, quantity, price');
        }
        await client.query(`
          INSERT INTO jobber_inventory (jobber_id, security_id, assigned_quantity, remaining_quantity, assigned_price)
          VALUES ($1, $2, $3, $4, $5)
        `, [jobberId, item.security_id, item.quantity, item.quantity, item.price]);
      }
    });

    res.json({ message: 'Jobber inventory updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update jobber inventory' });
  }
});

export default router;
