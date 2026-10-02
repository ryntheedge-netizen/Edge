import { Router, Request, Response } from 'express';
import { authenticateAdmin, authenticateSuperadmin } from './auth'; // We'll add AUCTION_ADMIN soon
import pool, { withTransaction } from '../db/database';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || '';

// Auth middleware for auction admin
export function authenticateAuctionAdmin(req: Request, res: Response, next: import('express').NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Token missing.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userPermissions = decoded.permissions || [];
    
    if (userPermissions.includes('EDGE_SUPERADMIN') || userPermissions.includes('AUCTION_ADMIN')) {
      (req as any).user = decoded;
      return next();
    }

    return res.status(403).json({ error: 'Forbidden. Insufficient privileges for auction.' });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

router.use(authenticateAuctionAdmin);

// Helper to normalize trader ID
const normalizeTraderId = (id: string) => id.trim().toUpperCase();
// Helper to normalize security code
const normalizeSecurityCode = (code: string) => code.replace(/^0+/, '') || '0';

// 1. Get all traders and their portfolios
router.get('/traders', async (req, res) => {
  try {
    // Ensure all traders are initialized if they don't exist? No, the requirement says "Do not silently create an unknown trader unless..."
    // Wait, requirement says: "If the trader does not exist, display a clear validation error."
    // But how are traders created? Let's add an endpoint to create a trader or we can just create them on the fly if needed?
    // Let's add a sync/init for traders if needed, or just let admin create them.
    // Let's return the portfolio calculations.
    
    const tradersResult = await pool.query(`
      SELECT 
        t.trader_id as "traderId", 
        t.starting_corpus as "startingCorpus"
      FROM auction_traders t
      ORDER BY t.trader_id ASC
    `);

    const portfolios = [];

    for (const trader of tradersResult.rows) {
      const traderId = trader.traderId;
      const startingCorpus = Number(trader.startingCorpus);
      
      // Get holdings and calculate values
      const holdingsResult = await pool.query(`
        SELECT 
          h.id as holding_id,
          h.acquisition_price,
          s.id as security_id,
          s.symbol,
          s.name,
          s.base_price,
          s.current_ltp
        FROM auction_holdings h
        JOIN securities s ON h.security_id = s.id
        WHERE h.trader_id = $1
      `, [traderId]);

      let totalPurchaseCost = 0;
      let currentHoldingsValue = 0;

      for (const h of holdingsResult.rows) {
        const acqPrice = Number(h.acquisition_price);
        totalPurchaseCost += acqPrice;
        
        // Calculate current value based on return
        // Return % = (current_ltp - base_price) / base_price
        const basePrice = Number(h.base_price);
        const currentLtp = Number(h.current_ltp);
        const returnPct = basePrice > 0 ? (currentLtp - basePrice) / basePrice : 0;
        
        const currentValue = acqPrice + (acqPrice * returnPct);
        currentHoldingsValue += currentValue;
      }

      const remainingCorpus = startingCorpus - totalPurchaseCost;
      const totalPortfolioValue = remainingCorpus + currentHoldingsValue;
      const difference = totalPortfolioValue - startingCorpus;

      portfolios.push({
        traderId,
        startingCorpus,
        remainingCorpus,
        currentHoldingsValue,
        totalPortfolioValue,
        difference,
        isLowCorpus: remainingCorpus < 500000
      });
    }

    res.json(portfolios);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch traders' });
  }
});

// 2. Get specific trader portfolio and holdings detail
router.get('/traders/:id', async (req, res) => {
  try {
    const traderId = normalizeTraderId(req.params.id);
    
    const traderRes = await pool.query(`SELECT starting_corpus FROM auction_traders WHERE trader_id = $1`, [traderId]);
    if (traderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Trader not found' });
    }
    
    const startingCorpus = Number(traderRes.rows[0].starting_corpus);
    
    const holdingsResult = await pool.query(`
      SELECT 
        h.id,
        h.auction_round,
        h.acquisition_price,
        h.envelope_id,
        s.id as security_id,
        s.symbol,
        s.name,
        s.base_price,
        s.current_ltp
      FROM auction_holdings h
      JOIN securities s ON h.security_id = s.id
      WHERE h.trader_id = $1
      ORDER BY h.created_at DESC
    `, [traderId]);

    let totalPurchaseCost = 0;
    let currentHoldingsValue = 0;
    const holdings = [];

    for (const h of holdingsResult.rows) {
      const acqPrice = Number(h.acquisition_price);
      totalPurchaseCost += acqPrice;
      
      const basePrice = Number(h.base_price);
      const currentLtp = Number(h.current_ltp);
      const returnPct = basePrice > 0 ? (currentLtp - basePrice) / basePrice : 0;
      const currentValue = acqPrice + (acqPrice * returnPct);
      currentHoldingsValue += currentValue;
      
      holdings.push({
        id: h.id,
        round: h.auction_round,
        securityCode: h.symbol,
        securityName: h.name,
        acquisitionPrice: acqPrice,
        currentReturnPct: returnPct * 100,
        currentValue: currentValue,
        gainLoss: currentValue - acqPrice,
        envelopeId: h.envelope_id
      });
    }

    const remainingCorpus = startingCorpus - totalPurchaseCost;
    const totalPortfolioValue = remainingCorpus + currentHoldingsValue;
    
    res.json({
      traderId,
      startingCorpus,
      remainingCorpus,
      currentHoldingsValue,
      totalPortfolioValue,
      difference: totalPortfolioValue - startingCorpus,
      isLowCorpus: remainingCorpus < 500000,
      holdings
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch trader details' });
  }
});

// 2b. Add a trader (Helper for setup)
router.post('/traders', async (req, res) => {
  try {
    const { traderId } = req.body;
    if (!traderId) return res.status(400).json({ error: 'Trader ID required' });
    
    const normalized = normalizeTraderId(traderId);
    
    await pool.query(`
      INSERT INTO auction_traders (trader_id) VALUES ($1) ON CONFLICT DO NOTHING
    `, [normalized]);
    
    res.json({ success: true, traderId: normalized });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create trader' });
  }
});

// 3. Submit a Bid
router.post('/bid', async (req, res) => {
  try {
    let { traderId, securityCode, bidAmount, envelopeId, auctionRound } = req.body;
    
    traderId = normalizeTraderId(traderId);
    securityCode = normalizeSecurityCode(String(securityCode));
    bidAmount = Number(bidAmount);
    envelopeId = envelopeId ? Number(envelopeId) : 0;
    auctionRound = Number(auctionRound);

    if (!traderId) return res.status(400).json({ error: 'Invalid trader ID.' });
    if (!securityCode) return res.status(400).json({ error: 'Invalid security code.' });
    if (isNaN(bidAmount) || bidAmount <= 0) return res.status(400).json({ error: 'Bid amount must be greater than ₹0.' });
    if (auctionRound !== 1 && auctionRound !== 2) return res.status(400).json({ error: 'Invalid auction round.' });

    await withTransaction(async (client) => {
      // Check trader exists
      const traderRes = await client.query(`SELECT starting_corpus FROM auction_traders WHERE trader_id = $1`, [traderId]);
      if (traderRes.rows.length === 0) {
        throw { status: 400, message: 'Invalid trader ID.' };
      }
      
      const startingCorpus = Number(traderRes.rows[0].starting_corpus);

      // Check security exists
      // Using symbol as securityCode
      const secRes = await client.query(`SELECT id FROM securities WHERE symbol = $1`, [securityCode]);
      if (secRes.rows.length === 0) {
        throw { status: 400, message: 'Security not found.' };
      }
      const securityId = secRes.rows[0].id;

      // Calculate current remaining corpus
      const holdingsRes = await client.query(`
        SELECT COALESCE(SUM(acquisition_price), 0) as total_spent 
        FROM auction_holdings WHERE trader_id = $1
      `, [traderId]);
      
      const totalSpent = Number(holdingsRes.rows[0].total_spent);
      const remainingCorpus = startingCorpus - totalSpent;

      if (remainingCorpus < bidAmount) {
        // Record rejected bid
        await client.query(`
          INSERT INTO auction_bids (auction_round, trader_id, security_id, bid_amount, envelope_id, status, rejection_reason)
          VALUES ($1, $2, $3, $4, $5, 'REJECTED', 'Insufficient remaining corpus')
        `, [auctionRound, traderId, securityId, bidAmount, envelopeId]);
        
        throw { status: 400, message: 'Insufficient remaining corpus.' };
      }

      // Record successful bid
      await client.query(`
        INSERT INTO auction_bids (auction_round, trader_id, security_id, bid_amount, envelope_id, status)
        VALUES ($1, $2, $3, $4, $5, 'SUCCESS')
      `, [auctionRound, traderId, securityId, bidAmount, envelopeId]);

      // Create holding
      await client.query(`
        INSERT INTO auction_holdings (auction_round, trader_id, security_id, acquisition_price, envelope_id)
        VALUES ($1, $2, $3, $4, $5)
      `, [auctionRound, traderId, securityId, bidAmount, envelopeId]);

      // Audit Log
      await client.query(`
        INSERT INTO auction_audit_logs (actor, action, trader_id, security_id, bid_amount, envelope_id, auction_round, details)
        VALUES ($1, 'BID_SUCCESS', $2, $3, $4, $5, $6, $7)
      `, [(req as any).user.username, traderId, securityId, bidAmount, envelopeId, auctionRound, 'Bid successful and holding created']);
    });

    res.json({ success: true, message: 'Bid successful.' });
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});

// 4. Transfer Security
router.post('/transfer', async (req, res) => {
  try {
    let { holdingId, toTraderId, transferPrice, auctionRound } = req.body;
    
    holdingId = Number(holdingId);
    toTraderId = normalizeTraderId(toTraderId);
    transferPrice = Number(transferPrice);
    auctionRound = Number(auctionRound);
    
    if (isNaN(transferPrice) || transferPrice <= 0) return res.status(400).json({ error: 'Invalid transfer price.' });
    if (auctionRound !== 1 && auctionRound !== 2) return res.status(400).json({ error: 'Invalid auction round.' });
    
    await withTransaction(async (client) => {
      // Get holding
      const holdRes = await client.query(`SELECT * FROM auction_holdings WHERE id = $1`, [holdingId]);
      if (holdRes.rows.length === 0) throw { status: 400, message: 'Holding not found.' };
      
      const holding = holdRes.rows[0];
      const fromTraderId = holding.trader_id;
      
      if (fromTraderId === toTraderId) throw { status: 400, message: 'Cannot transfer to same trader.' };
      
      // Check toTrader exists
      const toTraderRes = await client.query(`SELECT starting_corpus FROM auction_traders WHERE trader_id = $1`, [toTraderId]);
      if (toTraderRes.rows.length === 0) throw { status: 400, message: 'Recipient trader not found.' };
      
      // Check if toTrader has enough corpus
      const toStarting = Number(toTraderRes.rows[0].starting_corpus);
      const toSpentRes = await client.query(`SELECT COALESCE(SUM(acquisition_price), 0) as total FROM auction_holdings WHERE trader_id = $1`, [toTraderId]);
      const toRemaining = toStarting - Number(toSpentRes.rows[0].total);
      
      if (toRemaining < transferPrice) throw { status: 400, message: 'Recipient has insufficient corpus.' };
      
      // Record transfer
      await client.query(`
        INSERT INTO auction_transfers (auction_round, holding_id, from_trader_id, to_trader_id, transfer_price)
        VALUES ($1, $2, $3, $4, $5)
      `, [auctionRound, holdingId, fromTraderId, toTraderId, transferPrice]);
      
      // Update holding
      await client.query(`
        UPDATE auction_holdings 
        SET trader_id = $1, acquisition_price = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [toTraderId, transferPrice, holdingId]);
      
      // Audit log
      await client.query(`
        INSERT INTO auction_audit_logs (actor, action, trader_id, security_id, bid_amount, auction_round, details)
        VALUES ($1, 'TRANSFER_SUCCESS', $2, $3, $4, $5, $6)
      `, [(req as any).user.username, fromTraderId, holding.security_id, transferPrice, auctionRound, `Transferred to ${toTraderId}`]);
    });
    
    res.json({ success: true, message: 'Transfer successful.' });
  } catch (error: any) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Transfer failed.' });
  }
});

// 5. Apply Envelope
router.post('/envelope', async (req, res) => {
  try {
    let { traderId, envelopeId, auctionRound } = req.body;
    
    traderId = normalizeTraderId(traderId);
    envelopeId = Number(envelopeId);
    auctionRound = Number(auctionRound);
    
    if (!envelopeId) return res.status(400).json({ error: 'Valid Envelope ID required.' });
    if (auctionRound !== 1 && auctionRound !== 2) return res.status(400).json({ error: 'Invalid auction round.' });
    
    await withTransaction(async (client) => {
      // Check trader
      const traderRes = await client.query(`SELECT id FROM auction_traders WHERE trader_id = $1`, [traderId]);
      if (traderRes.rows.length === 0) throw { status: 400, message: 'Invalid trader ID.' };
      
      // Record envelope application
      await client.query(`
        INSERT INTO auction_envelopes_applied (auction_round, trader_id, envelope_id, details)
        VALUES ($1, $2, $3, $4)
      `, [auctionRound, traderId, envelopeId, 'Envelope applied (rules pending)']);
      
      // Audit log
      await client.query(`
        INSERT INTO auction_audit_logs (actor, action, trader_id, envelope_id, auction_round, details)
        VALUES ($1, 'ENVELOPE_APPLIED', $2, $3, $4, $5)
      `, [(req as any).user.username, traderId, envelopeId, auctionRound, 'Envelope applied']);
    });
    
    res.json({ success: true, message: 'Envelope applied successfully.' });
  } catch (error: any) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Failed to apply envelope.' });
  }
});

// 6. Get Audit Logs
router.get('/audit', async (req, res) => {
  try {
    const logs = await pool.query(`
      SELECT 
        l.id,
        l.created_at as "timestamp",
        l.actor as "auctioneer",
        l.action,
        l.trader_id as "traderId",
        s.symbol as security,
        l.bid_amount as "bidAmount",
        l.envelope_id as "envelopeId",
        l.auction_round as "round",
        l.details
      FROM auction_audit_logs l
      LEFT JOIN securities s ON l.security_id = s.id
      ORDER BY l.created_at DESC
      LIMIT 1000
    `);
    res.json(logs.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
});

// 7. Get Securities (for dropdown/autocomplete)
router.get('/securities', async (req, res) => {
  try {
    const secsRes = await pool.query(`
      SELECT symbol as code, name, base_price, current_ltp
      FROM securities
      ORDER BY symbol ASC
    `);
    
    const securities = secsRes.rows.map(s => {
      const base = Number(s.base_price);
      const cur = Number(s.current_ltp);
      const retPct = base > 0 ? (cur - base) / base : 0;
      return {
        code: s.code,
        name: s.name,
        returnPct: retPct * 100
      };
    });
    
    res.json(securities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch securities.' });
  }
});

export default router;
