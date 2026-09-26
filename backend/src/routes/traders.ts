import { Router, Request, Response } from 'express';
import pool, { query } from '../db/database';
import { authenticateAdmin } from './auth';

const router = Router();

// Admin/Superadmin: Get all traders and their cash/holdings/lots
router.get('/', authenticateAdmin, async (_req: Request, res: Response) => {
  try {
    const eventRes = await query(`SELECT id, starting_trader_corpus FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    const event = eventRes.rows[0];

    const tradersRes = await query(`SELECT * FROM traders WHERE event_id = $1 ORDER BY trader_identifier ASC`, [event.id]);
    const traders = tradersRes.rows;
    
    const lotsRes = await query(`
      SELECT al.*, s.name as security_name, s.symbol as security_symbol, t.audit_id
      FROM acquisition_lots al
      JOIN securities s ON al.security_id = s.id
      JOIN trades t ON al.trade_id = t.id
      WHERE al.remaining_quantity > 0 AND s.event_id = $1
    `, [event.id]);
    const lots = lotsRes.rows;

    const lotsByTrader = new Map();
    for (const lot of lots) {
      if (!lotsByTrader.has(lot.trader_id)) {
        lotsByTrader.set(lot.trader_id, []);
      }
      lotsByTrader.get(lot.trader_id).push(lot);
    }

    const settlementsRes = await query(`
      SELECT sr.*, s.name as security_name, s.symbol as security_symbol 
      FROM settlement_records sr
      JOIN securities s ON sr.security_id = s.id
      WHERE sr.event_id = $1
    `, [event.id]);
    const settlements = settlementsRes.rows;

    const settlementsByTraderId = new Map();
    for (const st of settlements) {
      if (!settlementsByTraderId.has(st.trader_id)) {
        settlementsByTraderId.set(st.trader_id, []);
      }
      settlementsByTraderId.get(st.trader_id).push({
        ...st,
        final_market_ltp: Number(st.final_market_ltp),
        penalty_percentage: Number(st.penalty_percentage),
        settlement_price: Number(st.settlement_price),
        settlement_value: Number(st.settlement_value)
      });
    }

    const result = traders.map(t => {
      const traderLots = lotsByTrader.get(t.trader_identifier) || [];
      const traderSettlements = settlementsByTraderId.get(t.id) || [];
      
      const holdingsMap = new Map();
      let totalShares = 0;
      
      for (const lot of traderLots) {
        if (!holdingsMap.has(lot.security_id)) {
          holdingsMap.set(lot.security_id, {
            security_id: lot.security_id,
            security_name: lot.security_name,
            security_symbol: lot.security_symbol,
            total_quantity: 0,
            total_value: 0,
            lots: []
          });
        }
        
        const secGrp = holdingsMap.get(lot.security_id);
        const remQty = Number(lot.remaining_quantity);
        const acqPrice = Number(lot.acquisition_price);

        secGrp.total_quantity += remQty;
        secGrp.total_value += (remQty * acqPrice);
        secGrp.lots.push({
          audit_id: lot.audit_id,
          original_quantity: Number(lot.original_quantity),
          remaining_quantity: remQty,
          acquisition_price: acqPrice,
          total_price: remQty * acqPrice,
          created_at: lot.created_at
        });
        
        totalShares += remQty;
      }
      
      return {
        ...t,
        starting_corpus: Number(t.starting_corpus),
        current_cash_balance: Number(t.current_cash_balance),
        total_shares: totalShares,
        holdings: Array.from(holdingsMap.values()),
        settlements: traderSettlements
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch traders' });
  }
});

// Admin/Superadmin: Get a specific trader's portfolio
router.get('/:identifier', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const eventRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    const event = eventRes.rows[0];

    const traderRes = await query(`SELECT * FROM traders WHERE trader_identifier = $1 AND event_id = $2`, [req.params.identifier, event.id]);
    if (traderRes.rows.length === 0) return res.status(404).json({ error: 'Trader not found' });
    const trader = traderRes.rows[0];

    const lotsRes = await query(`
      SELECT al.*, s.name as security_name, s.symbol as security_symbol, t.audit_id
      FROM acquisition_lots al
      JOIN securities s ON al.security_id = s.id
      JOIN trades t ON al.trade_id = t.id
      WHERE al.trader_id = $1 AND al.remaining_quantity > 0
    `, [trader.trader_identifier]);
    const lots = lotsRes.rows;

    const holdingsMap = new Map();
    for (const lot of lots) {
      if (!holdingsMap.has(lot.security_id)) {
        holdingsMap.set(lot.security_id, {
          security_id: lot.security_id,
          security_name: lot.security_name,
          security_symbol: lot.security_symbol,
          total_quantity: 0,
          lots: []
        });
      }
      
      const secGrp = holdingsMap.get(lot.security_id);
      const remQty = Number(lot.remaining_quantity);
      const acqPrice = Number(lot.acquisition_price);

      secGrp.total_quantity += remQty;
      secGrp.lots.push({
        audit_id: lot.audit_id,
        original_quantity: Number(lot.original_quantity),
        remaining_quantity: remQty,
        acquisition_price: acqPrice,
        total_price: remQty * acqPrice,
        created_at: lot.created_at
      });
    }

    res.json({
      ...trader,
      starting_corpus: Number(trader.starting_corpus),
      current_cash_balance: Number(trader.current_cash_balance),
      holdings: Array.from(holdingsMap.values())
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch trader portfolio' });
  }
});

export default router;
