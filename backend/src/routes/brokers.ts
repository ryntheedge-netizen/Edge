import { Router, Request, Response } from 'express';
import pool, { query, withTransaction } from '../db/database';
import { authenticateSuperadmin } from './auth';
import { PoolClient } from 'pg';

const router = Router();

// Superadmin: Get all brokers and their inventory
router.get('/', authenticateSuperadmin, async (_req: Request, res: Response) => {
  try {
    const eventRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    const event = eventRes.rows[0];

    const brokersRes = await query(`SELECT * FROM brokers WHERE event_id = $1 ORDER BY broker_identifier ASC`, [event.id]);
    const brokers = brokersRes.rows;
    
    const inventoriesRes = await query(`
      SELECT ji.*, s.name as security_name, s.symbol as security_symbol
      FROM broker_inventory ji
      JOIN securities s ON ji.security_id = s.id
      WHERE s.event_id = $1
    `, [event.id]);
    const inventories = inventoriesRes.rows;

    const invMap = new Map();
    for (const inv of inventories) {
      if (!invMap.has(inv.broker_id)) {
        invMap.set(inv.broker_id, []);
      }
      invMap.get(inv.broker_id).push({
        ...inv,
        assigned_price: Number(inv.assigned_price)
      });
    }

    const result = brokers.map(j => ({
      ...j,
      inventory: invMap.get(j.id) || []
    }));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch brokers' });
  }
});

// Superadmin: Configure broker count (creates default brokers)
router.post('/count', authenticateSuperadmin, async (req: Request, res: Response) => {
  try {
    const { count } = req.body;
    if (typeof count !== 'number' || count < 0) {
      return res.status(400).json({ error: 'Invalid broker count' });
    }

    const eventRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    const event = eventRes.rows[0];

    await withTransaction(async (client: PoolClient) => {
      const existingRes = await client.query(`SELECT COUNT(*) as count FROM brokers WHERE event_id = $1`, [event.id]);
      const currentCount = Number(existingRes.rows[0].count);

      if (count > currentCount) {
        for (let i = currentCount + 1; i <= count; i++) {
          await client.query(`INSERT INTO brokers (event_id, broker_identifier) VALUES ($1, $2)`, [event.id, `BROKER ${i.toString().padStart(2, '0')}`]);
        }
      } else if (count < currentCount) {
        const toDeleteRes = await client.query(`SELECT id FROM brokers WHERE event_id = $1 ORDER BY id DESC LIMIT $2`, [event.id, currentCount - count]);
        for (const j of toDeleteRes.rows) {
          await client.query(`DELETE FROM brokers WHERE id = $1`, [j.id]);
        }
      }

      const currentBrokersRes = await client.query(`SELECT id FROM brokers WHERE event_id = $1`, [event.id]);
      const currentBrokers = currentBrokersRes.rows;
      const securitiesRes = await client.query(`SELECT id, current_ltp FROM securities WHERE event_id = $1 AND is_active = true`, [event.id]);
      const securities = securitiesRes.rows;
      
      for (const b of currentBrokers) {
        for (const s of securities) {
          await client.query(`
            INSERT INTO broker_inventory (broker_id, security_id, assigned_quantity, remaining_quantity, assigned_price)
            VALUES ($1, $2, 10000, 10000, $3)
            ON CONFLICT DO NOTHING
          `, [b.id, s.id, Number(s.current_ltp)]);
        }
      }
    });

    res.json({ message: 'Broker count updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update broker count' });
  }
});

// Superadmin: Configure a specific broker's inventory
router.post('/:id/inventory', authenticateSuperadmin, async (req: Request, res: Response) => {
  try {
    const brokerId = Number(req.params.id);
    const { items } = req.body;
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array' });
    }

    await withTransaction(async (client: PoolClient) => {
      await client.query(`DELETE FROM broker_inventory WHERE broker_id = $1`, [brokerId]);
      
      for (const item of items) {
        if (!item.security_id || typeof item.quantity !== 'number' || typeof item.price !== 'number') {
          throw new Error('Invalid item format. Needs security_id, quantity, price');
        }
        await client.query(`
          INSERT INTO broker_inventory (broker_id, security_id, assigned_quantity, remaining_quantity, assigned_price)
          VALUES ($1, $2, $3, $4, $5)
        `, [brokerId, item.security_id, item.quantity, item.quantity, item.price]);
      }
    });

    res.json({ message: 'Broker inventory updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update broker inventory' });
  }
});

export default router;
