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

// Helper to resolve and normalize trader ID against master
const resolveTraderId = async (input: string, client = pool) => {
  if (!input) return null;
  const val = input.trim().toUpperCase();
  // Fetch all existing traders
  const res = await client.query('SELECT trader_id FROM auction_traders');
  const traders = res.rows.map(r => r.trader_id.toUpperCase());
  
  // Exact match
  if (traders.includes(val)) return val;
  
  // Strip non-numeric part from input
  const numericInputMatch = val.match(/\d+/);
  if (numericInputMatch) {
    const numValue = parseInt(numericInputMatch[0], 10);
    // Find matching trader
    for (const t of traders) {
      const tMatch = t.match(/\d+/);
      if (tMatch && parseInt(tMatch[0], 10) === numValue) {
        return t; // Returns canonical e.g., 'TR01'
      }
    }
  }
  return val; // Return fallback for validation to fail
};

// Helper to normalize security code
const normalizeSecurityCode = (code: string) => code.replace(/^0+/, '') || '0';

// 0. Auction Lifecycle
router.get('/state', async (req, res) => {
  try {
    const stateRes = await pool.query('SELECT status FROM auction_state WHERE id = 1');
    if (stateRes.rows.length === 0) return res.json({ status: 'NOT_STARTED' });
    res.json({ status: stateRes.rows[0].status });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch auction state' });
  }
});

router.post('/state', async (req, res) => {
  try {
    const { action } = req.body;
    const validActions = ['START', 'PAUSE', 'RESUME', 'END', 'RESET'];
    if (!validActions.includes(action)) return res.status(400).json({ error: 'Invalid action.' });

    await withTransaction(async (client) => {
      const stateRes = await client.query('SELECT status FROM auction_state WHERE id = 1 FOR UPDATE');
      let currentStatus = stateRes.rows.length > 0 ? stateRes.rows[0].status : 'NOT_STARTED';
      
      let nextStatus = currentStatus;
      if (action === 'START') {
        if (currentStatus !== 'NOT_STARTED') throw new Error('Auction is already started.');
        nextStatus = 'RUNNING';
      } else if (action === 'PAUSE') {
        if (currentStatus !== 'RUNNING') throw new Error('Auction must be RUNNING to pause.');
        nextStatus = 'PAUSED';
      } else if (action === 'RESUME') {
        if (currentStatus !== 'PAUSED') throw new Error('Auction must be PAUSED to resume.');
        nextStatus = 'RUNNING';
      } else if (action === 'END') {
        if (currentStatus === 'NOT_STARTED' || currentStatus === 'ENDED') throw new Error('Cannot end from current state.');
        nextStatus = 'ENDED';
      } else if (action === 'RESET') {
        // RESET clears current auction trader state
        await client.query('DELETE FROM auction_audit_logs');
        await client.query('DELETE FROM auction_envelopes_applied');
        await client.query('DELETE FROM auction_transfers');
        await client.query('DELETE FROM auction_holdings');
        await client.query('DELETE FROM auction_bids');
        await client.query('DELETE FROM auction_traders'); // Clear trader portfolio data generated for auction session
        nextStatus = 'NOT_STARTED';
      }

      await client.query(`
        INSERT INTO auction_state (id, status) VALUES (1, $1)
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP
      `, [nextStatus]);

      // Audit Log
      if (action !== 'RESET') {
        await client.query(`
          INSERT INTO auction_audit_logs (actor, action, details) VALUES ($1, $2, $3)
        `, [(req as any).user.username, `AUCTION_${action}`, `Auction lifecycle changed to ${nextStatus}`]);
      }
    });

    res.json({ success: true, message: `Auction ${action.toLowerCase()} successful.` });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to update auction state' });
  }
});

// 0.1 Envelope Master
router.get('/envelopes', async (req, res) => {
  try {
    const envs = await pool.query('SELECT envelope_code, envelope_name FROM auction_master_envelopes ORDER BY id ASC');
    res.json(envs.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch envelope master' });
  }
});

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
          s.code as symbol,
          s.name,
          s.return_pct
        FROM auction_holdings h
        JOIN auction_securities s ON h.security_id = s.id
        WHERE h.trader_id = $1
      `, [traderId]);

      let totalPurchaseCost = 0;
      let currentHoldingsValue = 0;

      for (const h of holdingsResult.rows) {
        const acqPrice = Number(h.acquisition_price);
        totalPurchaseCost += acqPrice;
        
        // Calculate current value based on return
        const returnPct = Number(h.return_pct) / 100;
        
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
        isLowCorpus: remainingCorpus <= 500000
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
    const traderId = await resolveTraderId(req.params.id);
    
    const traderRes = await pool.query(`SELECT starting_corpus FROM auction_traders WHERE trader_id = $1`, [traderId]);
    if (traderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Trader not found' });
    }
    
    const startingCorpus = Number(traderRes.rows[0].starting_corpus);
    
    const holdingsResult = await pool.query(`
      SELECT 
        h.id,
        h.acquisition_price,
        h.envelope_code,
        s.id as security_id,
        s.code as symbol,
        s.name,
        s.return_pct
      FROM auction_holdings h
      JOIN auction_securities s ON h.security_id = s.id
      WHERE h.trader_id = $1
      ORDER BY h.created_at DESC
    `, [traderId]);

    let totalPurchaseCost = 0;
    let currentHoldingsValue = 0;
    const holdings = [];

    for (const h of holdingsResult.rows) {
      const acqPrice = Number(h.acquisition_price);
      totalPurchaseCost += acqPrice;
      
      const returnPct = Number(h.return_pct) / 100;
      const currentValue = acqPrice + (acqPrice * returnPct);
      currentHoldingsValue += currentValue;
      
      holdings.push({
        id: h.id,
        securityCode: h.symbol,
        securityName: h.name,
        acquisitionPrice: acqPrice,
        currentReturnPct: Number(h.return_pct),
        currentValue: currentValue,
        gainLoss: currentValue - acqPrice,
        envelopeCode: h.envelope_code
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
      isLowCorpus: remainingCorpus <= 500000,
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
    
    const normalized = await resolveTraderId(traderId);
    if (!normalized) return res.status(400).json({ error: 'Trader ID required' });
    
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
    let { traderId, securityCode, bidAmount, envelopeCode } = req.body;
    
    traderId = await resolveTraderId(traderId);
    securityCode = securityCode ? normalizeSecurityCode(String(securityCode)) : null;
    bidAmount = Number(bidAmount);
    envelopeCode = envelopeCode ? String(envelopeCode).trim().toUpperCase() : null;

    if (!traderId) return res.status(400).json({ error: 'Invalid trader ID.' });
    if (isNaN(bidAmount) || bidAmount <= 0) return res.status(400).json({ error: 'Bid amount must be greater than ₹0.' });

    // Validate Envelope or Security based on input
    if (envelopeCode && !securityCode) {
      // Envelope Bid
      const envRes = await pool.query('SELECT envelope_code FROM auction_master_envelopes WHERE envelope_code = $1', [envelopeCode]);
      if (envRes.rows.length === 0) return res.status(400).json({ error: 'Invalid Envelope Code.' });
    } else if (securityCode && !envelopeCode) {
      // Live Bid
      // securityCode will be validated inside transaction
    } else {
      return res.status(400).json({ error: 'Provide either Security Code for Live Bid or Envelope Code for Envelope Bid.' });
    }

    await withTransaction(async (client) => {
      // Check Auction State
      const stateRes = await client.query('SELECT status FROM auction_state WHERE id = 1');
      const auctionStatus = stateRes.rows.length > 0 ? stateRes.rows[0].status : 'NOT_STARTED';
      if (auctionStatus !== 'RUNNING') {
        throw { status: 400, message: 'Auction is not running. Bids cannot be placed.' };
      }
      // Check trader exists
      const traderRes = await client.query(`SELECT starting_corpus FROM auction_traders WHERE trader_id = $1`, [traderId]);
      if (traderRes.rows.length === 0) {
        throw { status: 400, message: 'Invalid trader ID.' };
      }
      
      const startingCorpus = Number(traderRes.rows[0].starting_corpus);

      // Check security exists if it's a live bid
      let securityId = null;
      if (securityCode) {
        const secRes = await client.query(`SELECT id FROM auction_securities WHERE code = $1`, [securityCode]);
        if (secRes.rows.length === 0) {
          throw { status: 400, message: 'Security not found.' };
        }
        securityId = secRes.rows[0].id;
      }

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
          INSERT INTO auction_bids (trader_id, security_id, bid_amount, envelope_code, status, rejection_reason)
          VALUES ($1, $2, $3, $4, 'REJECTED', 'Insufficient remaining corpus')
        `, [traderId, securityId, bidAmount, envelopeCode]);
        
        throw { status: 400, message: 'Insufficient remaining corpus.' };
      }

      // Record successful bid
      await client.query(`
        INSERT INTO auction_bids (trader_id, security_id, bid_amount, envelope_code, status)
        VALUES ($1, $2, $3, $4, 'SUCCESS')
      `, [traderId, securityId, bidAmount, envelopeCode]);

      // Create holding
      await client.query(`
        INSERT INTO auction_holdings (trader_id, security_id, acquisition_price, envelope_code)
        VALUES ($1, $2, $3, $4)
      `, [traderId, securityId, bidAmount, envelopeCode]);

      // Audit Log
      await client.query(`
        INSERT INTO auction_audit_logs (actor, action, trader_id, security_id, bid_amount, envelope_code, details)
        VALUES ($1, 'BID_SUCCESS', $2, $3, $4, $5, $6)
      `, [(req as any).user.username, traderId, securityId, bidAmount, envelopeCode, 'Bid successful and holding created']);
    });

    res.json({ success: true, message: 'Bid successful.' });
  } catch (error: any) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: 'An unexpected error occurred.', details: error.message, stack: error.stack });
  }
});

// 4. Transfer Security
router.post('/transfer', async (req, res) => {
  try {
    let { holdingId, toTraderId, transferPrice } = req.body;
    
    holdingId = Number(holdingId);
    toTraderId = await resolveTraderId(toTraderId);
    transferPrice = Number(transferPrice);
    
    if (isNaN(transferPrice) || transferPrice <= 0) return res.status(400).json({ error: 'Invalid transfer price.' });
    
    await withTransaction(async (client) => {
      // Check Auction State
      const stateRes = await client.query('SELECT status FROM auction_state WHERE id = 1');
      const auctionStatus = stateRes.rows.length > 0 ? stateRes.rows[0].status : 'NOT_STARTED';
      if (auctionStatus !== 'RUNNING') {
        throw { status: 400, message: 'Auction is not running. Transfers cannot be executed.' };
      }

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
        INSERT INTO auction_transfers (holding_id, from_trader_id, to_trader_id, transfer_price)
        VALUES ($1, $2, $3, $4)
      `, [holdingId, fromTraderId, toTraderId, transferPrice]);
      
      // Update holding
      await client.query(`
        UPDATE auction_holdings 
        SET trader_id = $1, acquisition_price = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [toTraderId, transferPrice, holdingId]);
      
      // Audit log
      await client.query(`
        INSERT INTO auction_audit_logs (actor, action, trader_id, security_id, bid_amount, details)
        VALUES ($1, 'TRANSFER_SUCCESS', $2, $3, $4, $5)
      `, [(req as any).user.username, fromTraderId, holding.security_id, transferPrice, `Transferred to ${toTraderId}`]);
    });
    
    res.json({ success: true, message: 'Transfer successful.' });
  } catch (error: any) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Transfer failed.' });
  }
});

// 5. Apply Envelope (Legacy - Now Handled via Bid, but kept for compatibility if needed)
router.post('/envelope', async (req, res) => {
  try {
    let { traderId, envelopeCode } = req.body;
    
    traderId = await resolveTraderId(traderId);
    envelopeCode = String(envelopeCode).trim().toUpperCase();
    
    if (!envelopeCode) return res.status(400).json({ error: 'Valid Envelope Code required.' });
    
    await withTransaction(async (client) => {
      // Check trader
      const traderRes = await client.query(`SELECT trader_id FROM auction_traders WHERE trader_id = $1`, [traderId]);
      if (traderRes.rows.length === 0) throw { status: 400, message: 'Invalid trader ID.' };
      
      // Record envelope application
      await client.query(`
        INSERT INTO auction_envelopes_applied (trader_id, envelope_code, details)
        VALUES ($1, $2, $3)
      `, [traderId, envelopeCode, 'Envelope applied (rules pending)']);
      
      // Audit log
      await client.query(`
        INSERT INTO auction_audit_logs (actor, action, trader_id, envelope_code, details)
        VALUES ($1, 'ENVELOPE_APPLIED', $2, $3, $4)
      `, [(req as any).user.username, traderId, envelopeCode, 'Envelope applied']);
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
        s.code as security,
        l.bid_amount as "bidAmount",
        l.envelope_code as "envelopeCode",
        l.details
      FROM auction_audit_logs l
      LEFT JOIN auction_securities s ON l.security_id = s.id
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
      SELECT code, name, return_pct
      FROM auction_securities
      ORDER BY LENGTH(code) ASC, code ASC
    `);
    
    const securities = secsRes.rows.map(s => {
      return {
        code: s.code,
        name: s.name,
        returnPct: Number(s.return_pct)
      };
    });
    
    res.json(securities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch securities.' });
  }
});

// 8. Initialize Auction Traders
router.post('/initialize', async (req, res) => {
  try {
    const { numTraders, startingCorpus } = req.body;
    
    if (!numTraders || numTraders <= 0 || !Number.isInteger(Number(numTraders))) {
      return res.status(400).json({ error: 'Invalid number of traders' });
    }
    
    if (!startingCorpus || startingCorpus <= 0) {
      return res.status(400).json({ error: 'Invalid starting corpus' });
    }

    const existing = await pool.query('SELECT COUNT(*) FROM auction_traders');
    if (Number(existing.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Auction is already initialized' });
    }

    await withTransaction(async (client) => {
      for (let i = 1; i <= Number(numTraders); i++) {
        const traderId = `TR${i.toString().padStart(2, '0')}`;
        await client.query(
          `INSERT INTO auction_traders (trader_id, starting_corpus) VALUES ($1, $2)`,
          [traderId, Number(startingCorpus)]
        );
      }
      
      await client.query(`
        INSERT INTO auction_audit_logs (actor, action, details)
        VALUES ($1, $2, $3)
      `, [(req as any).user.username, 'AUCTION_INITIALIZED', `Initialized ${numTraders} traders with ₹${startingCorpus}`]);
    });

    res.json({ success: true, message: 'Auction initialized successfully' });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Failed to initialize auction' });
  }
});

export default router;
