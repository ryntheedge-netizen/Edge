import pool, { withTransaction, query } from '../db/database';
import { PoolClient } from 'pg';

export interface TradeInput {
  eventId?: number;
  buyerId: string;
  sellerId: string;
  securityId: number;
  price: number;
  quantity: number;
  osStatus: string;
  idempotencyKey?: string;
  enteredBy?: string;
  deskId?: string;
}

export interface SecurityRecord {
  id: number;
  event_id: number;
  name: string;
  symbol: string;
  base_price: number;
  initial_ltp: number;
  current_ltp: number;
  accumulated_trade_value: number;
  threshold_amount: number;
  lower_circuit: number;
  upper_circuit: number;
  last_trade_price: number | null;
  last_ltp_update_at: string | null;
  is_active: boolean;
}

export interface TradeRecord {
  id: number;
  event_id: number;
  buyer_id: string;
  seller_id: string;
  security_id: number;
  price: number;
  quantity: number;
  total_value: number;
  os_status: string;
  executed_at: string;
  entered_by: string;
  triggered_ltp_update: boolean;
  previous_ltp: number | null;
  new_ltp: number | null;
  trade_status: string;
}

export interface MarketEventRecord {
  id: number;
  event_id: number;
  security_id: number;
  security_name: string;
  security_symbol: string;
  previous_ltp: number;
  new_ltp: number;
  absolute_change: number;
  percentage_change: number;
  created_at: string;
}

export interface TradeExecutionResult {
  trade: TradeRecord;
  security: SecurityRecord;
  ltpUpdated: boolean;
  marketEvent?: MarketEventRecord;
}

function isJobber(id: string) {
  const upper = id.toUpperCase();
  return upper.startsWith('JR');
}

/**
 * Execute a trade transactionally with strict LTP threshold logic and wallet validation.
 */
export async function executeTrade(input: TradeInput): Promise<TradeExecutionResult> {
  let buyerId = (input.buyerId || '').trim();
  let sellerId = (input.sellerId || '').trim();
  if (!buyerId || !sellerId) {
    throw new Error('Buyer ID and Seller ID are required');
  }

  if (typeof input.price !== 'number' || isNaN(input.price) || input.price <= 0 || input.price > 10000000) {
    throw new Error('Executed trade price must be a positive number up to 10,000,000');
  }

  if (typeof input.quantity !== 'number' || !Number.isInteger(input.quantity)) {
    throw new Error('Quantity must be a positive integer up to 100,000,000');
  }

  const validOsStatuses = ['OPEN', 'SQUARE OFF'];
  let reqOsStatus = input.osStatus || 'OPEN';
  if (!validOsStatuses.includes(reqOsStatus)) {
    throw new Error('O/S Status must be OPEN or SQUARE OFF');
  }

  const totalValue = input.price * input.quantity;

  return await withTransaction(async (client: PoolClient): Promise<TradeExecutionResult> => {
    // 1. Get active event
    let eventId = input.eventId;
    let eventRow: any;

    if (eventId) {
      const res = await client.query(`SELECT * FROM events WHERE id = $1`, [eventId]);
      eventRow = res.rows[0];
    } else {
      const res = await client.query(`SELECT * FROM events ORDER BY id ASC LIMIT 1`);
      eventRow = res.rows[0];
    }

    if (!eventRow) {
      throw new Error('No active event found');
    }
    
    if (eventRow.status !== 'LIVE') {
      throw new Error(`Trade rejected. Market is currently ${eventRow.status}. Trades are only allowed when market is LIVE.`);
    }
    eventId = eventRow.id;

    // 2. Fetch security
    const secRes = await client.query(`
      SELECT * FROM securities WHERE id = $1 AND event_id = $2 AND is_active = true FOR UPDATE
    `, [input.securityId, eventId]);
    const security = secRes.rows[0] as SecurityRecord | undefined;

    if (!security) {
      throw new Error('Invalid or inactive security selected');
    }

    // Convert Numeric fields to Numbers
    security.lower_circuit = Number(security.lower_circuit);
    security.upper_circuit = Number(security.upper_circuit);
    security.current_ltp = Number(security.current_ltp);
    security.accumulated_trade_value = Number(security.accumulated_trade_value);
    security.threshold_amount = Number(security.threshold_amount);

    const minPrice = security.lower_circuit;
    const maxPrice = security.upper_circuit;
    if (input.price < minPrice || input.price > maxPrice) {
      throw new Error(`Trade rejected: Price ₹${input.price} is outside the allowed circuit range (LC: ₹${minPrice.toFixed(2)} - UC: ₹${maxPrice.toFixed(2)}).`);
    }

    const idRegex = /^[tbj]r\d{2}$/i;
    buyerId = buyerId.toUpperCase();
    sellerId = sellerId.toUpperCase();

    const insertScrap = (reason: string) => {
      pool.query(`
        INSERT INTO scrap_trades (event_id, buyer_id, seller_id, security_id, price, quantity, total_value, os_status, entered_by, desk_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [eventId, buyerId, sellerId, security.id, input.price, input.quantity, totalValue, reqOsStatus, input.enteredBy || 'ADMIN', input.deskId || null])
      .catch(() => {}); // Fire and forget to avoid pool deadlock
      throw new Error(reason);
    };

    if (!idRegex.test(buyerId)) {
      insertScrap(`Trade rejected: Invalid Buyer ID format (${buyerId}). Must be 4 characters like TR01.`);
    }
    if (!idRegex.test(sellerId)) {
      insertScrap(`Trade rejected: Invalid Seller ID format (${sellerId}). Must be 4 characters like TR01.`);
    }
    if (buyerId === sellerId) {
      insertScrap(`Trade rejected: Buyer and Seller cannot be the same participant.`);
    }
    if (input.quantity <= 0 || input.quantity % 5 !== 0 || input.quantity > 100000000) {
      insertScrap(`Trade rejected: Quantity must be a positive multiple of 5.`);
    }

    // 3. Helper to distinguish Jobber vs Trader
    const buyerJobberRes = await client.query(`SELECT * FROM jobbers WHERE jobber_identifier = $1 AND event_id = $2`, [buyerId, eventId]);
    const sellerJobberRes = await client.query(`SELECT * FROM jobbers WHERE jobber_identifier = $1 AND event_id = $2`, [sellerId, eventId]);
    const buyerJobber = buyerJobberRes.rows[0];
    const sellerJobber = sellerJobberRes.rows[0];

    const isBuyerJobber = !!buyerJobber;
    const isSellerJobber = !!sellerJobber;

    async function getOrCreateTrader(traderIdentifier: string) {
      let traderRes = await client.query(`SELECT * FROM traders WHERE trader_identifier = $1 AND event_id = $2 FOR UPDATE`, [traderIdentifier, eventId]);
      if (traderRes.rows.length === 0) {
        await client.query(`
          INSERT INTO traders (trader_identifier, event_id, starting_corpus, current_cash_balance)
          VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
        `, [traderIdentifier, eventId, eventRow.starting_trader_corpus, eventRow.starting_trader_corpus]);
        traderRes = await client.query(`SELECT * FROM traders WHERE trader_identifier = $1 AND event_id = $2 FOR UPDATE`, [traderIdentifier, eventId]);
      }
      const trader = traderRes.rows[0];
      trader.current_cash_balance = Number(trader.current_cash_balance);
      return trader;
    }

    const buyerTrader = !isBuyerJobber ? await getOrCreateTrader(buyerId) : null;
    const sellerTrader = !isSellerJobber ? await getOrCreateTrader(sellerId) : null;

    // 4. Wallet & Inventory Validations
    if (!isBuyerJobber && buyerTrader.current_cash_balance < totalValue) {
      insertScrap(`Trade rejected: Buyer ${buyerId} has insufficient cash.`);
    }

    let sellerQty = 0;
    if (isSellerJobber) {
      const invRes = await client.query(`SELECT remaining_quantity FROM jobber_inventory WHERE jobber_id = $1 AND security_id = $2 FOR UPDATE`, [sellerJobber.id, security.id]);
      sellerQty = invRes.rows.length > 0 ? Number(invRes.rows[0].remaining_quantity) : 0;
      if (sellerQty < input.quantity) {
        insertScrap(`Trade rejected: Jobber ${sellerId} has insufficient inventory for ${security.symbol}.`);
      }
    } else {
      const sellerHoldingRes = await client.query(`SELECT quantity FROM trader_holdings WHERE trader_id = $1 AND security_id = $2 FOR UPDATE`, [sellerTrader.id, security.id]);
      sellerQty = sellerHoldingRes.rows.length > 0 ? Number(sellerHoldingRes.rows[0].quantity) : 0;
      if (sellerQty < input.quantity) {
        insertScrap(`Trade rejected: Seller ${sellerId} has insufficient shares.`);
      }
    }

    let actualOsStatus = reqOsStatus;
    if (!isSellerJobber) {
      let remaining = sellerQty - input.quantity;
      if (remaining === 0) actualOsStatus = 'SQUARE OFF';
      else actualOsStatus = 'OPEN';
    }

    // 5. Accumulate trade value & check threshold BEFORE saving trade
    const prevAccumulated = security.accumulated_trade_value;
    const newAccumulated = Number((prevAccumulated + totalValue).toFixed(2));
    const threshold = security.threshold_amount;

    let ltpUpdated = false;
    let previousLtp = security.current_ltp;
    let newLtp = security.current_ltp;

    if (newAccumulated >= threshold) {
      ltpUpdated = true;
      newLtp = input.price;
    }

    // 6. Save executed trade record
    let tradeInsertRes;
    if (input.idempotencyKey) {
      tradeInsertRes = await client.query(`
        INSERT INTO trades (
          event_id, buyer_id, seller_id, security_id, price, quantity, total_value,
          os_status, entered_by, desk_id, triggered_ltp_update, previous_ltp, new_ltp, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id
      `, [
        eventId, buyerId, sellerId, security.id, input.price, input.quantity, totalValue,
        actualOsStatus, input.enteredBy || 'ADMIN', input.deskId || null, ltpUpdated, previousLtp, newLtp, input.idempotencyKey
      ]);
    } else {
      tradeInsertRes = await client.query(`
        INSERT INTO trades (
          event_id, buyer_id, seller_id, security_id, price, quantity, total_value,
          os_status, entered_by, desk_id, triggered_ltp_update, previous_ltp, new_ltp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id
      `, [
        eventId, buyerId, sellerId, security.id, input.price, input.quantity, totalValue,
        actualOsStatus, input.enteredBy || 'ADMIN', input.deskId || null, ltpUpdated, previousLtp, newLtp
      ]);
    }

    const tradeId = tradeInsertRes.rows[0].id;
    const auditId = 'TAL' + tradeId;
    await client.query(`UPDATE trades SET audit_id = $1 WHERE id = $2`, [auditId, tradeId]);

    // 7. Update Wallets & Inventories
    if (isBuyerJobber) {
      const invRes = await client.query(`SELECT id FROM jobber_inventory WHERE jobber_id = $1 AND security_id = $2 FOR UPDATE`, [buyerJobber.id, security.id]);
      if (invRes.rows.length > 0) {
        await client.query(`UPDATE jobber_inventory SET remaining_quantity = remaining_quantity + $1 WHERE id = $2`, [input.quantity, invRes.rows[0].id]);
      } else {
        await client.query(`INSERT INTO jobber_inventory (jobber_id, security_id, remaining_quantity) VALUES ($1, $2, $3)`, [buyerJobber.id, security.id, input.quantity]);
      }
    } else {
      await client.query(`UPDATE traders SET current_cash_balance = current_cash_balance - $1 WHERE id = $2`, [totalValue, buyerTrader.id]);
      let buyerHoldingRes = await client.query(`SELECT id FROM trader_holdings WHERE trader_id = $1 AND security_id = $2 FOR UPDATE`, [buyerTrader.id, security.id]);
      if (buyerHoldingRes.rows.length > 0) {
        await client.query(`UPDATE trader_holdings SET quantity = quantity + $1 WHERE trader_id = $2 AND security_id = $3`, [input.quantity, buyerTrader.id, security.id]);
      } else {
        await client.query(`INSERT INTO trader_holdings (trader_id, security_id, quantity) VALUES ($1, $2, $3)`, [buyerTrader.id, security.id, input.quantity]);
      }
      
      // CREATE ACQUISITION LOT for Buyer
      await client.query(`
        INSERT INTO acquisition_lots (trade_id, trader_id, security_id, original_quantity, remaining_quantity, acquisition_price)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [tradeId, buyerTrader.trader_identifier, security.id, input.quantity, input.quantity, input.price]);
    }

    if (isSellerJobber) {
      await client.query(`UPDATE jobber_inventory SET remaining_quantity = remaining_quantity - $1 WHERE jobber_id = $2 AND security_id = $3`, [input.quantity, sellerJobber.id, security.id]);
    } else {
      await client.query(`UPDATE traders SET current_cash_balance = current_cash_balance + $1 WHERE id = $2`, [totalValue, sellerTrader.id]);
      await client.query(`UPDATE trader_holdings SET quantity = quantity - $1 WHERE trader_id = $2 AND security_id = $3`, [input.quantity, sellerTrader.id, security.id]);
      
      // CONSUME FIFO LOTS for Seller
      let qtyToConsume = input.quantity;
      const lotsRes = await client.query(`
        SELECT * FROM acquisition_lots 
        WHERE trader_id = $1 AND security_id = $2 AND remaining_quantity > 0 
        ORDER BY created_at ASC, id ASC FOR UPDATE
      `, [sellerTrader.trader_identifier, security.id]);
      
      for (const lot of lotsRes.rows) {
        if (qtyToConsume <= 0) break;
        if (lot.remaining_quantity <= qtyToConsume) {
          qtyToConsume -= lot.remaining_quantity;
          await client.query(`UPDATE acquisition_lots SET remaining_quantity = 0 WHERE id = $1`, [lot.id]);
        } else {
          await client.query(`UPDATE acquisition_lots SET remaining_quantity = remaining_quantity - $1 WHERE id = $2`, [qtyToConsume, lot.id]);
          qtyToConsume = 0;
        }
      }
    }

    // 8. Finalize LTP updates
    let marketEventRecord: MarketEventRecord | undefined;
    if (ltpUpdated) {
      const absoluteChange = Number((newLtp - previousLtp).toFixed(2));
      const percentageChange = previousLtp === 0 ? 0 : Number((((newLtp - previousLtp) / previousLtp) * 100).toFixed(2));

      await client.query(`
        UPDATE securities
        SET current_ltp = $1, accumulated_trade_value = 0.0, last_trade_price = $2, last_ltp_update_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [newLtp, input.price, security.id]);

      const meInsertRes = await client.query(`
        INSERT INTO market_events (event_id, security_id, previous_ltp, new_ltp, absolute_change, percentage_change)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
      `, [eventId, security.id, previousLtp, newLtp, absoluteChange, percentageChange]);

      marketEventRecord = {
        id: meInsertRes.rows[0].id,
        event_id: eventId as number,
        security_id: security.id,
        security_name: security.name,
        security_symbol: security.symbol,
        previous_ltp: previousLtp,
        new_ltp: newLtp,
        absolute_change: absoluteChange,
        percentage_change: percentageChange,
        created_at: new Date().toISOString()
      };
    } else {
      await client.query(`
        UPDATE securities
        SET accumulated_trade_value = $1, last_trade_price = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [newAccumulated, input.price, security.id]);
    }

    const tradeRecordRes = await client.query(`SELECT * FROM trades WHERE id = $1`, [tradeId]);
    const updatedSecurityRes = await client.query(`SELECT * FROM securities WHERE id = $1`, [security.id]);

    const finalTrade = tradeRecordRes.rows[0] as TradeRecord;
    finalTrade.price = Number(finalTrade.price);
    finalTrade.total_value = Number(finalTrade.total_value);
    finalTrade.previous_ltp = finalTrade.previous_ltp ? Number(finalTrade.previous_ltp) : null;
    finalTrade.new_ltp = finalTrade.new_ltp ? Number(finalTrade.new_ltp) : null;

    const finalSecurity = updatedSecurityRes.rows[0] as SecurityRecord;
    finalSecurity.current_ltp = Number(finalSecurity.current_ltp);
    finalSecurity.lower_circuit = Number(finalSecurity.lower_circuit);
    finalSecurity.upper_circuit = Number(finalSecurity.upper_circuit);
    finalSecurity.base_price = Number(finalSecurity.base_price);
    finalSecurity.initial_ltp = Number(finalSecurity.initial_ltp);

    return {
      trade: finalTrade,
      security: finalSecurity,
      ltpUpdated,
      marketEvent: marketEventRecord
    };
  });
}

/**
 * End Market & Settlement Engine
 * Applies 20% penalty, liquidates all outstanding holdings to cash, and records final state.
 */
export async function endMarket(eventId: number) {
  return await withTransaction(async (client: PoolClient) => {
    const eventRes = await client.query(`SELECT * FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
    const eventRow = eventRes.rows[0];
    if (!eventRow) throw new Error('Event not found');
    if (eventRow.status === 'ENDED') throw new Error('Market is already ended.');

    // 1. Freeze market
    await client.query(`UPDATE events SET status = 'ENDED', ended_at = CURRENT_TIMESTAMP WHERE id = $1`, [eventId]);

    // 2. Identify all outstanding trader holdings
    const holdingsRes = await client.query(`SELECT * FROM trader_holdings WHERE quantity > 0 FOR UPDATE`);
    const holdings = holdingsRes.rows;
    
    const securitiesRes = await client.query(`SELECT * FROM securities WHERE event_id = $1`, [eventId]);
    const securities = securitiesRes.rows as SecurityRecord[];
    const secMap = new Map<number, SecurityRecord>();
    securities.forEach(s => {
      s.current_ltp = Number(s.current_ltp);
      secMap.set(s.id, s);
    });

    const penaltyPct = Number(eventRow.penalty_percentage) / 100.0;
    const settlementFactor = 1.0 - penaltyPct; // e.g., 0.80

    // 3. Process settlement
    for (const h of holdings) {
      const sec = secMap.get(h.security_id);
      if (!sec) continue;

      const finalLtp = sec.current_ltp;
      const settlementPrice = finalLtp * settlementFactor;
      const settlementValue = h.quantity * settlementPrice;

      // Create settlement record
      await client.query(`
        INSERT INTO settlement_records (event_id, trader_id, security_id, quantity, final_market_ltp, penalty_percentage, settlement_price, settlement_value)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [eventId, h.trader_id, h.security_id, h.quantity, finalLtp, eventRow.penalty_percentage, settlementPrice, settlementValue]);

      // Square off holding
      await client.query(`UPDATE trader_holdings SET quantity = 0 WHERE id = $1`, [h.id]);

      // Add cash to trader
      await client.query(`UPDATE traders SET current_cash_balance = current_cash_balance + $1 WHERE id = $2`, [settlementValue, h.trader_id]);
    }

    // Log action
    await client.query(`INSERT INTO audit_logs (event_id, actor, action, metadata) VALUES ($1, 'SUPERADMIN', 'MARKET_ENDED', $2)`, [eventId, JSON.stringify({ holdingsSettled: holdings.length })]);

    const updatedEventRes = await client.query(`SELECT * FROM events WHERE id = $1`, [eventId]);
    return updatedEventRes.rows[0];
  });
}

/**
 * Update market status (Start, Pause, Resume)
 */
export async function updateMarketStatus(eventId: number, status: 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'ENDED') {
  if (status === 'ENDED') return await endMarket(eventId);

  return await withTransaction(async (client: PoolClient) => {
    const currentEventRes = await client.query(`SELECT status FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
    const currentEvent = currentEventRes.rows[0];
    if (!currentEvent) throw new Error('Event not found');

    if (status === 'LIVE' && currentEvent.status === 'NOT_STARTED') {
      await client.query(`UPDATE events SET status = $1, started_at = CURRENT_TIMESTAMP WHERE id = $2`, [status, eventId]);
    } else {
      await client.query(`UPDATE events SET status = $1 WHERE id = $2`, [status, eventId]);
    }

    await client.query(`INSERT INTO audit_logs (event_id, actor, action, metadata) VALUES ($1, 'ADMIN', 'MARKET_STATUS_CHANGED', $2)`, [eventId, JSON.stringify({ oldStatus: currentEvent.status, newStatus: status })]);

    const updatedRes = await client.query(`SELECT * FROM events WHERE id = $1`, [eventId]);
    return updatedRes.rows[0];
  });
}

/**
 * Reset event back to clean starting state.
 */
export async function resetEvent(eventId: number) {
  return await withTransaction(async (client: PoolClient) => {
    await client.query(`UPDATE events SET status = 'NOT_STARTED', started_at = NULL, ended_at = NULL WHERE id = $1`, [eventId]);
    await client.query(`DELETE FROM trades WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM scrap_trades WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM settlement_records WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM market_events WHERE event_id = $1`, [eventId]);
    
    // Wipe traders and holdings
    await client.query(`DELETE FROM trader_holdings WHERE trader_id IN (SELECT id FROM traders WHERE event_id = $1)`, [eventId]);
    await client.query(`DELETE FROM traders WHERE event_id = $1`, [eventId]);

    // Wipe jobbers and acquisition lots
    await client.query(`DELETE FROM jobber_inventory WHERE jobber_id IN (SELECT id FROM jobbers WHERE event_id = $1)`, [eventId]);
    await client.query(`DELETE FROM jobbers WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM acquisition_lots`); // Note: Assuming global clear or should be filtered

    // Re-seed Jobbers JR01 and JR02 natively
    const secsRes = await client.query(`SELECT id, symbol, initial_ltp FROM securities WHERE event_id = $1`, [eventId]);
    const secs = secsRes.rows;
    
    const jobbers = ['JR01', 'JR02'];
    for (const jid of jobbers) {
      const jobberInsertRes = await client.query(`
        INSERT INTO jobbers (event_id, jobber_identifier)
        VALUES ($1, $2) RETURNING id
      `, [eventId, jid]);
      
      const jobberId = jobberInsertRes.rows[0].id;

      for (const sec of secs) {
        await client.query(`
          INSERT INTO jobber_inventory (jobber_id, security_id, assigned_quantity, remaining_quantity, assigned_price)
          VALUES ($1, $2, $3, $4, $5)
        `, [jobberId, sec.id, 10000, 10000, Number(sec.initial_ltp)]);
      }
    }

    await client.query(`
      UPDATE securities
      SET current_ltp = initial_ltp, accumulated_trade_value = 0.0, last_trade_price = NULL, last_ltp_update_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE event_id = $1
    `, [eventId]);

    await client.query(`INSERT INTO audit_logs (event_id, actor, action, metadata) VALUES ($1, 'SUPERADMIN', 'EVENT_RESET', $2)`, [eventId, JSON.stringify({ message: 'Event reset to initial state' })]);

    const eventRes = await client.query(`SELECT * FROM events WHERE id = $1`, [eventId]);
    return eventRes.rows[0];
  });
}
