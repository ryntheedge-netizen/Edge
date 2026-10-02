import { describe, it, expect, beforeEach } from 'vitest';
import pool, { query, initDatabase } from '../db/database';
import { executeTrade, updateMarketStatus, resetEvent, SecurityRecord } from '../services/ltpEngine';

describe('Bull Ring LTP Engine Core Logic', () => {
  let eventId: number;

  beforeEach(async () => {
    await initDatabase();
    const eventRes = await query(`SELECT id FROM events ORDER BY id ASC LIMIT 1`);
    eventId = eventRes.rows[0].id;

    // Ensure event is clean and LIVE for testing
    await resetEvent(eventId);
    await updateMarketStatus(eventId, 'LIVE');
  }, 30000);

  it('Test 1 — Below threshold: Trade value < ₹1,00,000 should accumulate without changing LTP', async () => {
    // Pick reliance (ID 1, initial LTP = 100)
    const secRes = await query(`SELECT * FROM securities WHERE symbol = 'RELIANCE' AND event_id = $1`, [eventId]);
    const securityBefore = secRes.rows[0] as SecurityRecord;
    expect(Number(securityBefore.current_ltp)).toBe(988); // 988 is initial LTP for RELIANCE

    // Trade: ₹1150 × 50 = ₹57,500
    const result = await executeTrade({
      eventId,
      buyerId: 'TR01',
      sellerId: 'JR01',
      securityId: securityBefore.id,
      price: 1150,
      quantity: 50,
      osStatus: 'OPEN'
    });

    expect(result.ltpUpdated).toBe(false);
    expect(Number(result.security.current_ltp)).toBe(988);
    expect(Number(result.security.accumulated_trade_value)).toBe(57500);
    expect(result.trade.triggered_ltp_update).toBe(false);
  });

  it('Test 2 — Threshold crossed: Single trade >= ₹1,00,000 updates LTP to trade price and resets accumulator to 0', async () => {
    const secRes = await query(`SELECT * FROM securities WHERE symbol = 'ADANIPORTS' AND event_id = $1`, [eventId]);
    const securityBefore = secRes.rows[0] as SecurityRecord;

    // Trade: ₹1800 × 100 = ₹1,80,000
    const result = await executeTrade({
      eventId,
      buyerId: 'TR02',
      sellerId: 'JR01',
      securityId: securityBefore.id,
      price: 1800,
      quantity: 100,
      osStatus: 'OPEN'
    });

    expect(result.ltpUpdated).toBe(true);
    expect(Number(result.security.current_ltp)).toBe(1800);
    expect(Number(result.security.accumulated_trade_value)).toBe(0); // Strictly reset to 0
    expect(result.trade.triggered_ltp_update).toBe(true);
    expect(result.marketEvent).toBeDefined();
    expect(Number(result.marketEvent?.previous_ltp)).toBe(1788); // Initial ADANI LTP
    expect(Number(result.marketEvent?.new_ltp)).toBe(1800);
  });

  it('Test 3 — Multiple trades accumulating up to threshold', async () => {
    const secRes = await query(`SELECT * FROM securities WHERE symbol = 'RELIANCE' AND event_id = $1`, [eventId]);
    const securityBefore = secRes.rows[0] as SecurityRecord;

    // Trade 1: ₹1120 × 40 = ₹44,800
    const res1 = await executeTrade({ eventId, buyerId: 'TR01', sellerId: 'JR01', securityId: securityBefore.id, price: 1120, quantity: 40, osStatus: 'OPEN' });
    expect(res1.ltpUpdated).toBe(false);
    expect(Number(res1.security.accumulated_trade_value)).toBe(44800);
    expect(Number(res1.security.current_ltp)).toBe(988);

    // Trade 2: ₹1150 × 30 = ₹34,500 (Total accumulated: ₹79,300)
    const res2 = await executeTrade({ eventId, buyerId: 'TR02', sellerId: 'JR01', securityId: securityBefore.id, price: 1150, quantity: 30, osStatus: 'OPEN' });
    expect(res2.ltpUpdated).toBe(false);
    expect(Number(res2.security.accumulated_trade_value)).toBe(79300);
    expect(Number(res2.security.current_ltp)).toBe(988);

    // Trade 3: ₹1180 × 25 = ₹29,500 (Total accumulated: ₹1,08,800 -> Threshold crossed!)
    const res3 = await executeTrade({ eventId, buyerId: 'TR03', sellerId: 'JR01', securityId: securityBefore.id, price: 1180, quantity: 25, osStatus: 'OPEN' });
    expect(res3.ltpUpdated).toBe(true);
    expect(Number(res3.security.current_ltp)).toBe(1180); // LTP becomes price of Trade 3 (1180)
    expect(Number(res3.security.accumulated_trade_value)).toBe(0); // Resets to 0
  });

  it('Test 4 — Huge trade (e.g. ₹5,00,000) causes exactly 1 LTP update and resets accumulator to 0', async () => {
    const secRes = await query(`SELECT * FROM securities WHERE symbol = 'HDFCBANK' AND event_id = $1`, [eventId]);
    const securityBefore = secRes.rows[0] as SecurityRecord;

    // Trade: ₹750 × 1000 = ₹7,50,000
    const result = await executeTrade({
      eventId,
      buyerId: 'TR99',
      sellerId: 'JR01',
      securityId: securityBefore.id,
      price: 750,
      quantity: 1000,
      osStatus: 'OPEN'
    });

    expect(result.ltpUpdated).toBe(true);
    expect(Number(result.security.current_ltp)).toBe(750);
    expect(Number(result.security.accumulated_trade_value)).toBe(0);

    // Verify only 1 market event created
    const marketEventsRes = await query(`SELECT * FROM market_events WHERE security_id = $1`, [securityBefore.id]);
    expect(marketEventsRes.rows.length).toBe(1);
  });

  it('Test 5 — Downward movement trade calculation', async () => {
    const secRes = await query(`SELECT * FROM securities WHERE symbol = 'ITC' AND event_id = $1`, [eventId]);
    const securityBefore = secRes.rows[0] as SecurityRecord;
    expect(Number(securityBefore.current_ltp)).toBe(268);

    await executeTrade({
      eventId,
      buyerId: 'TR05',
      sellerId: 'JR01',
      securityId: securityBefore.id,
      price: 268,
      quantity: 1400, // 268 * 1400 > 100000 -> LTP update
      osStatus: 'OPEN'
    });

    const result = await executeTrade({
      eventId,
      buyerId: 'JR01',
      sellerId: 'TR05',
      securityId: securityBefore.id,
      price: 250,
      quantity: 1400, // 250 * 1400 > 100000 -> LTP update
      osStatus: 'SQUARE OFF'
    });

    expect(result.ltpUpdated).toBe(true);
    expect(Number(result.security.current_ltp)).toBe(250);
    expect(Number(result.marketEvent?.absolute_change)).toBe(-18);
  });

  it('Test 7 & 8 — Market PAUSED / ENDED rejects trade submission', async () => {
    const secRes = await query(`SELECT * FROM securities WHERE symbol = 'RELIANCE' AND event_id = $1`, [eventId]);
    const security = secRes.rows[0] as SecurityRecord;

    // Pause market
    await updateMarketStatus(eventId, 'PAUSED');

    await expect(executeTrade({
      eventId,
      buyerId: 'TR07',
      sellerId: 'JR01',
      securityId: security.id,
      price: 1200,
      quantity: 100,
      osStatus: 'OPEN'
    })).rejects.toThrow(/Market is currently PAUSED/);

    // End market
    await updateMarketStatus(eventId, 'ENDED');

    await expect(executeTrade({
      eventId,
      buyerId: 'TR08',
      sellerId: 'JR01',
      securityId: security.id,
      price: 1200,
      quantity: 100,
      osStatus: 'OPEN'
    })).rejects.toThrow(/Market is currently ENDED/);
  });
});
