import { Router, Request, Response } from 'express';
import pool, { query } from '../db/database';
import { executeTrade } from '../services/ltpEngine';
import { authenticateAdmin, authenticateSuperadmin } from './auth';
import { broadcastEvent } from '../websocket/socketServer';

const router = Router();

// Admin: Submit Executed Trade
router.post('/', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { eventId, buyerId, sellerId, securityId, price, quantity, osStatus, idempotencyKey, deskId } = req.body;
    
    const finalDeskId = deskId || req.headers['x-desk-id'];

    const result = await executeTrade({
      eventId: eventId ? Number(eventId) : undefined,
      buyerId,
      sellerId,
      securityId: Number(securityId),
      price: Number(price),
      quantity: Number(quantity),
      osStatus: osStatus || 'OPEN',
      idempotencyKey,
      deskId: finalDeskId as string
    });

    broadcastEvent('TRADE_EXECUTED', {
      trade: result.trade,
      security: result.security,
      ltpUpdated: result.ltpUpdated
    });

    if (result.ltpUpdated && result.marketEvent) {
      broadcastEvent('LTP_UPDATE', {
        marketEvent: result.marketEvent,
        security: result.security
      });
    }

    res.status(201).json({
      message: result.ltpUpdated ? 'Trade executed. LTP updated!' : 'Trade executed successfully',
      result
    });
  } catch (err: any) {
    if (err.message && err.message.includes('trades_idempotency_key_key')) {
      return res.status(409).json({ error: 'Duplicate trade submission detected.' });
    }
    res.status(400).json({ error: err.message || 'Trade could not be recorded. Please try again.' });
  }
});

// Admin/Superadmin: Get Trade History with Filters
router.get('/', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const { securityId, traderId, auditId, osStatus, limit = 100, page = 1 } = _req.query;

    const eventRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const event = eventRes.rows[0];

    let sql = `
      SELECT 
        t.*,
        s.name as security_name,
        s.symbol as security_symbol
      FROM trades t
      JOIN securities s ON t.security_id = s.id
      WHERE t.event_id = $1
    `;

    const params: any[] = [event.id];
    let paramIndex = 2;

    if (securityId) {
      sql += ` AND t.security_id = $${paramIndex++}`;
      params.push(Number(securityId));
    }

    if (traderId) {
      sql += ` AND (t.buyer_id ILIKE $${paramIndex} OR t.seller_id ILIKE $${paramIndex})`;
      params.push(`%${(traderId as string).trim()}%`);
      paramIndex++;
    }

    if (auditId) {
      sql += ` AND t.audit_id = $${paramIndex++}`;
      params.push((auditId as string).trim());
    }

    if (osStatus) {
      sql += ` AND t.os_status = $${paramIndex++}`;
      params.push(osStatus);
    }

    sql += ` ORDER BY t.executed_at DESC, t.id DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    const parsedLimit = Math.min(500, Math.max(1, Number(limit)));
    const offset = (Math.max(1, Number(page)) - 1) * parsedLimit;
    params.push(parsedLimit, offset);

    const tradesRes = await query(sql, params);
    
    // Normalize numerics
    const trades = tradesRes.rows.map(t => ({
      ...t,
      price: Number(t.price),
      total_value: Number(t.total_value),
      previous_ltp: t.previous_ltp ? Number(t.previous_ltp) : null,
      new_ltp: t.new_ltp ? Number(t.new_ltp) : null
    }));

    res.json({ trades, count: trades.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch trades' });
  }
});

// Superadmin: Modify Trade Audit Log
router.put('/:id', authenticateSuperadmin, async (req: Request, res: Response) => {
  try {
    const tradeId = Number(req.params.id);
    const { buyerId, sellerId, price, quantity, osStatus } = req.body;
    
    const existingRes = await query(`SELECT * FROM trades WHERE id = $1`, [tradeId]);
    if (existingRes.rows.length === 0) return res.status(404).json({ error: 'Trade not found' });
    const existing = existingRes.rows[0];
    
    const uBuyer = buyerId !== undefined ? buyerId : existing.buyer_id;
    const uSeller = sellerId !== undefined ? sellerId : existing.seller_id;
    const uPrice = price !== undefined ? price : Number(existing.price);
    const uQuantity = quantity !== undefined ? quantity : existing.quantity;
    const uOsStatus = osStatus !== undefined ? osStatus : existing.os_status;
    const uTotal = Number(uPrice) * Number(uQuantity);

    await query(`
      UPDATE trades 
      SET buyer_id = $1, seller_id = $2, price = $3, quantity = $4, total_value = $5, os_status = $6
      WHERE id = $7
    `, [uBuyer, uSeller, uPrice, uQuantity, uTotal, uOsStatus, tradeId]);

    const updatedRes = await query(`SELECT * FROM trades WHERE id = $1`, [tradeId]);
    const updated = updatedRes.rows[0];
    updated.price = Number(updated.price);
    updated.total_value = Number(updated.total_value);

    res.json({ message: 'Trade updated successfully', trade: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to modify trade' });
  }
});

// Admin/Superadmin: Get Scrap Trades
router.get('/scrap', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const { limit = 100, page = 1 } = _req.query;
    const eventRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    const event = eventRes.rows[0];

    const parsedLimit = Math.min(500, Math.max(1, Number(limit)));
    const offset = (Math.max(1, Number(page)) - 1) * parsedLimit;

    const sql = `
      SELECT st.*, s.name as security_name, s.symbol as security_symbol
      FROM scrap_trades st
      JOIN securities s ON st.security_id = s.id
      WHERE st.event_id = $1
      ORDER BY st.attempted_at DESC, st.id DESC LIMIT $2 OFFSET $3
    `;
    
    const scrapsRes = await query(sql, [event.id, parsedLimit, offset]);
    const scraps = scrapsRes.rows.map(s => ({
      ...s,
      price: Number(s.price),
      total_value: Number(s.total_value)
    }));

    res.json({ scraps, count: scraps.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch scrap trades' });
  }
});

// Public: Get Historical LTP Movement Events for Ticker initialization
router.get('/movements', async (_req: Request, res: Response) => {
  try {
    const eventRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const event = eventRes.rows[0];

    const limit = Math.min(100, Number(_req.query.limit || 50));

    const movementsRes = await query(`
      SELECT 
        me.*,
        s.name as security_name,
        s.symbol as security_symbol
      FROM market_events me
      JOIN securities s ON me.security_id = s.id
      WHERE me.event_id = $1
      ORDER BY me.created_at ASC, me.id ASC
      LIMIT $2
    `, [event.id, limit]);

    const movements = movementsRes.rows.map(m => ({
      ...m,
      previous_ltp: Number(m.previous_ltp),
      new_ltp: Number(m.new_ltp),
      absolute_change: Number(m.absolute_change),
      percentage_change: Number(m.percentage_change)
    }));

    res.json(movements);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch LTP movements' });
  }
});

export default router;
