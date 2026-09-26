import { Router, Request, Response } from 'express';
import pool, { withTransaction, query } from '../db/database';
import { updateMarketStatus, resetEvent } from '../services/ltpEngine';
import { authenticateAdmin, authenticateSuperadmin } from './auth';
import { broadcastEvent } from '../websocket/socketServer';
import { PoolClient } from 'pg';

const router = Router();

// Public: Get Event Status & Summary Stats
router.get('/event', async (_req: Request, res: Response) => {
  try {
    const eventRes = await query(`SELECT * FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const event = eventRes.rows[0];

    const tradeStatsRes = await query(`
      SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN triggered_ltp_update = true THEN 1 ELSE 0 END) as total_ltp_changes
      FROM trades WHERE event_id = $1
    `, [event.id]);
    const tradeStats = tradeStatsRes.rows[0];

    res.json({
      event,
      stats: {
        total_trades: tradeStats?.total_trades ? Number(tradeStats.total_trades) : 0,
        total_ltp_changes: tradeStats?.total_ltp_changes ? Number(tradeStats.total_ltp_changes) : 0
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch event state' });
  }
});

// Admin/Superadmin: Update Market Status (Start, Pause, Resume, End)
router.post('/status', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { eventId, status } = req.body;
    if (!status || !['NOT_STARTED', 'LIVE', 'PAUSED', 'ENDED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid market status requested' });
    }

    if (status === 'ENDED' || status === 'RESET') {
      if (!(req as any).user.permissions.includes('BULL_RING_SUPERADMIN') && !(req as any).user.permissions.includes('EDGE_SUPERADMIN')) {
        return res.status(403).json({ error: 'Forbidden. Only Superadmin can END or RESET MARKET.' });
      }
    }

    let targetEventId = eventId;
    if (!targetEventId) {
      const eRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
      if (eRes.rows.length > 0) targetEventId = eRes.rows[0].id;
    }

    if (!targetEventId) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const updatedEvent = await updateMarketStatus(targetEventId, status);

    // Broadcast state change to all connected screens
    broadcastEvent('MARKET_STATUS_CHANGED', { event: updatedEvent });

    res.json({ message: `Market status updated to ${status}`, event: updatedEvent });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update market status' });
  }
});

// Superadmin: Reset Event
router.post('/reset', authenticateSuperadmin, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.body;
    let targetEventId = eventId;
    if (!targetEventId) {
      const eRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
      if (eRes.rows.length > 0) targetEventId = eRes.rows[0].id;
    }
    
    if (!targetEventId) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const resetResult = await resetEvent(targetEventId);

    // Fetch refreshed securities
    const refreshedSecuritiesRes = await query(`SELECT * FROM securities WHERE event_id = $1 ORDER BY symbol ASC`, [targetEventId]);
    const refreshedSecurities = refreshedSecuritiesRes.rows.map(sec => ({
      ...sec,
      base_price: Number(sec.base_price),
      initial_ltp: Number(sec.initial_ltp),
      current_ltp: Number(sec.current_ltp),
      lower_circuit: Number(sec.lower_circuit),
      upper_circuit: Number(sec.upper_circuit)
    }));

    // Broadcast reset event to all clients
    broadcastEvent('EVENT_RESET', { event: resetResult, securities: refreshedSecurities });

    res.json({ message: 'Event reset successfully', event: resetResult, securities: refreshedSecurities });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to reset event' });
  }
});

// Superadmin: Update Event Configuration (Starting Corpus and Traders)
router.put('/config', authenticateSuperadmin, async (req: Request, res: Response) => {
  try {
    const { eventId, startingCorpus, numberOfTraders } = req.body;
    let targetEventId = eventId;
    if (!targetEventId) {
      const eRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
      if (eRes.rows.length > 0) targetEventId = eRes.rows[0].id;
    }
    if (!targetEventId) return res.status(404).json({ error: 'Event not found' });

    if (typeof startingCorpus !== 'number' || startingCorpus < 0) {
      return res.status(400).json({ error: 'Invalid starting corpus amount' });
    }

    await query(`UPDATE events SET starting_trader_corpus = $1 WHERE id = $2`, [startingCorpus, targetEventId]);

    // Initialize traders if numberOfTraders is provided
    if (typeof numberOfTraders === 'number' && numberOfTraders > 0) {
      await withTransaction(async (client: PoolClient) => {
        for (let i = 1; i <= numberOfTraders; i++) {
          const traderId = `TR${i.toString().padStart(2, '0')}`;
          await client.query(`
            INSERT INTO traders (trader_identifier, event_id, starting_corpus, current_cash_balance, status)
            VALUES ($1, $2, $3, $4, 'ACTIVE') ON CONFLICT DO NOTHING
          `, [traderId, targetEventId, startingCorpus, startingCorpus]);
        }
      });
    }
    
    res.json({ message: 'Event configuration updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update event configuration' });
  }
});

// Public: Get Securities with Current LTP and Threshold Progress
router.get('/securities', async (_req: Request, res: Response) => {
  try {
    const eventRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    const event = eventRes.rows[0];

    const securitiesRes = await query(`
      SELECT
        s.*,
        me.previous_ltp  AS movement_prev_ltp,
        me.new_ltp        AS movement_new_ltp,
        me.absolute_change  AS lme_absolute_change,
        me.percentage_change AS lme_percentage_change
      FROM securities s
      LEFT JOIN (
        SELECT security_id, previous_ltp, new_ltp, absolute_change, percentage_change
        FROM market_events
        WHERE id IN (
          SELECT MAX(id) FROM market_events GROUP BY security_id
        )
      ) me ON me.security_id = s.id
      WHERE s.event_id = $1
      ORDER BY s.symbol ASC
    `, [event.id]);

    const formatted = securitiesRes.rows.map(sec => {
      const absChange = sec.lme_absolute_change !== null && sec.lme_absolute_change !== undefined
        ? Number(sec.lme_absolute_change)
        : 0;
      const pctChange = sec.lme_percentage_change !== null && sec.lme_percentage_change !== undefined
        ? Number(sec.lme_percentage_change)
        : 0;
        
      const accum = Number(sec.accumulated_trade_value);
      const thresh = Number(sec.threshold_amount);

      const remainingThreshold = Math.max(0, thresh - accum);
      const thresholdProgressPct = Math.min(
        100,
        Number(((accum / thresh) * 100).toFixed(1))
      );

      return {
        ...sec,
        base_price: Number(sec.base_price),
        initial_ltp: Number(sec.initial_ltp),
        current_ltp: Number(sec.current_ltp),
        lower_circuit: Number(sec.lower_circuit),
        upper_circuit: Number(sec.upper_circuit),
        accumulated_trade_value: accum,
        threshold_amount: thresh,
        absolute_change: absChange,
        percentage_change: pctChange,
        remaining_threshold: remainingThreshold,
        threshold_progress_pct: thresholdProgressPct
      };
    });

    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch securities' });
  }
});

// Admin: Update security config (e.g., initial LTP, threshold)
router.put('/securities/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const securityId = Number(req.params.id);
    const { name, symbol, initialLtp, thresholdAmount, isActive } = req.body;

    const securityRes = await query(`SELECT * FROM securities WHERE id = $1`, [securityId]);
    if (securityRes.rows.length === 0) {
      return res.status(404).json({ error: 'Security not found' });
    }
    const security = securityRes.rows[0];

    const updatedName = name || security.name;
    const updatedSymbol = symbol || security.symbol;
    const updatedInitialLtp = initialLtp !== undefined ? Number(initialLtp) : Number(security.initial_ltp);
    const updatedThreshold = thresholdAmount !== undefined ? Number(thresholdAmount) : Number(security.threshold_amount);
    const updatedActive = isActive !== undefined ? !!isActive : security.is_active;

    await query(`
      UPDATE securities
      SET name = $1, symbol = $2, initial_ltp = $3, threshold_amount = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [updatedName, updatedSymbol, updatedInitialLtp, updatedThreshold, updatedActive, securityId]);

    const refreshedRes = await query(`SELECT * FROM securities WHERE id = $1`, [securityId]);
    const refreshed = refreshedRes.rows[0];
    refreshed.base_price = Number(refreshed.base_price);
    refreshed.initial_ltp = Number(refreshed.initial_ltp);
    refreshed.current_ltp = Number(refreshed.current_ltp);
    refreshed.lower_circuit = Number(refreshed.lower_circuit);
    refreshed.upper_circuit = Number(refreshed.upper_circuit);

    // Broadcast configuration update
    broadcastEvent('SECURITIES_UPDATED', { security: refreshed });

    res.json({ message: 'Security updated successfully', security: refreshed });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update security' });
  }
});

// Superadmin: Manual News LTP Adjustment
router.post('/news-ltp', authenticateSuperadmin, async (req: Request, res: Response) => {
  try {
    const { securityId, newLtp, newsLabel } = req.body;
    
    if (typeof newLtp !== 'number' || newLtp <= 0) {
      return res.status(400).json({ error: 'Invalid LTP provided' });
    }

    const eventRes = await query(`SELECT * FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    const event = eventRes.rows[0];
    
    if (event.status !== 'LIVE') return res.status(400).json({ error: 'Market is not LIVE. News updates are blocked.' });

    const secRes = await query(`SELECT * FROM securities WHERE id = $1`, [securityId]);
    if (secRes.rows.length === 0) return res.status(404).json({ error: 'Security not found' });
    const security = secRes.rows[0];

    const lc = Number(security.lower_circuit);
    const uc = Number(security.upper_circuit);

    if (newLtp < lc || newLtp > uc) {
      return res.status(400).json({ error: `Rejected: ₹${newLtp} is outside circuit limits (LC: ₹${lc.toFixed(2)} - UC: ₹${uc.toFixed(2)})` });
    }

    const previousLtp = Number(security.current_ltp);
    const absoluteChange = Number((newLtp - previousLtp).toFixed(2));
    const percentageChange = previousLtp === 0 ? 0 : Number((((newLtp - previousLtp) / previousLtp) * 100).toFixed(2));

    await withTransaction(async (client: PoolClient) => {
      await client.query(`
        UPDATE securities
        SET current_ltp = $1, last_ltp_update_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [newLtp, securityId]);

      await client.query(`
        INSERT INTO market_events (event_id, security_id, previous_ltp, new_ltp, absolute_change, percentage_change)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [event.id, securityId, previousLtp, newLtp, absoluteChange, percentageChange]);

      await client.query(`
        INSERT INTO audit_logs (event_id, actor, action, metadata)
        VALUES ($1, 'SUPERADMIN', 'NEWS_LTP_UPDATE', $2)
      `, [event.id, JSON.stringify({
        security: security.symbol,
        previous_ltp: previousLtp,
        new_ltp: newLtp,
        percentage_change: percentageChange,
        news_label: newsLabel || ''
      })]);
    });

    const updatedSecRes = await query(`SELECT * FROM securities WHERE id = $1`, [securityId]);
    const updatedSecurity = updatedSecRes.rows[0];
    updatedSecurity.current_ltp = Number(updatedSecurity.current_ltp);
    updatedSecurity.base_price = Number(updatedSecurity.base_price);
    updatedSecurity.lower_circuit = Number(updatedSecurity.lower_circuit);
    updatedSecurity.upper_circuit = Number(updatedSecurity.upper_circuit);

    broadcastEvent('LTP_UPDATE', { security: updatedSecurity });

    res.json({ message: 'News LTP update applied successfully', security: updatedSecurity });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to apply News LTP update' });
  }
});

export default router;
