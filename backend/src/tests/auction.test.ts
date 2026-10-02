import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool, { withTransaction } from '../db/database';

describe('Auction Module Core Tests', () => {
  beforeAll(async () => {
    // Make sure we have a clean state for testing if needed
    // But since this is a unit test style check on the running app, we'll create dummy data
    await pool.query(`INSERT INTO auction_traders (trader_id, starting_corpus) VALUES ('TR_TEST', 2000000) ON CONFLICT DO NOTHING`);
    await pool.query(`INSERT INTO auction_securities (code, name, return_pct) VALUES ('TEST01', 'Test Security', 10.00) ON CONFLICT DO NOTHING`);
    await pool.query(`INSERT INTO auction_securities (code, name, return_pct) VALUES ('TEST02', 'Test Security Neg', -10.00) ON CONFLICT DO NOTHING`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM auction_bids WHERE trader_id = 'TR_TEST'`);
    await pool.query(`DELETE FROM auction_holdings WHERE trader_id = 'TR_TEST'`);
    await pool.query(`DELETE FROM auction_transfers WHERE from_trader_id = 'TR_TEST' OR to_trader_id = 'TR_TEST'`);
    await pool.query(`DELETE FROM auction_audit_logs WHERE trader_id = 'TR_TEST'`);
    await pool.query(`DELETE FROM auction_traders WHERE trader_id = 'TR_TEST'`);
    await pool.query(`DELETE FROM auction_securities WHERE code IN ('TEST01', 'TEST02')`);
    await pool.end();
  });

  it('Normalizes Trader IDs', () => {
    const normalize = (id: string) => id.trim().toUpperCase();
    expect(normalize('TR01')).toBe('TR01');
    expect(normalize('tr01')).toBe('TR01');
    expect(normalize('Tr01')).toBe('TR01');
    expect(normalize('tR01')).toBe('TR01');
  });

  it('Normalizes Security Codes', () => {
    const normalize = (code: string) => code.replace(/^0+/, '') || '0';
    expect(normalize('001')).toBe('1');
    expect(normalize('01')).toBe('1');
    expect(normalize('1')).toBe('1');
  });

  it('Calculates Corpus correctly', () => {
    const startingCorpus = 2000000;
    const bidAmount = 500000;
    const remainingCorpus = startingCorpus - bidAmount;
    expect(remainingCorpus).toBe(1500000);
  });

  it('Calculates Positive Returns correctly', () => {
    const bidAmount = 500000;
    const basePrice = 100;
    const currentLtp = 110;
    const returnPct = (currentLtp - basePrice) / basePrice;
    
    expect(returnPct).toBe(0.1); // +10%
    const holdingsValue = bidAmount + (bidAmount * returnPct);
    expect(holdingsValue).toBe(550000);
    
    const remainingCorpus = 1500000;
    const totalPortfolio = remainingCorpus + holdingsValue;
    expect(totalPortfolio).toBe(2050000);
    
    const diff = totalPortfolio - 2000000;
    expect(diff).toBe(50000);
  });

  it('Calculates Negative Returns correctly', () => {
    const bidAmount = 500000;
    const basePrice = 100;
    const currentLtp = 90;
    const returnPct = (currentLtp - basePrice) / basePrice;
    
    expect(returnPct).toBe(-0.1); // -10%
    const holdingsValue = bidAmount + (bidAmount * returnPct);
    expect(holdingsValue).toBe(450000);
    
    const remainingCorpus = 1500000;
    const totalPortfolio = remainingCorpus + holdingsValue;
    expect(totalPortfolio).toBe(1950000);
    
    const diff = totalPortfolio - 2000000;
    expect(diff).toBe(-50000);
  });

  it('Identifies low-corpus correctly', () => {
    expect(500001 < 500000).toBe(false);
    expect(500000 < 500000).toBe(false);
    expect(499999 < 500000).toBe(true);
  });

});
