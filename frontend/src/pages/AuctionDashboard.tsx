import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

interface Security {
  code: string;
  name: string;
  returnPct: number;
}

interface TraderPortfolio {
  traderId: string;
  startingCorpus: number;
  remainingCorpus: number;
  currentHoldingsValue: number;
  totalPortfolioValue: number;
  difference: number;
  isLowCorpus: boolean;
  holdings?: Holding[];
}

interface Holding {
  id: number;
  round: number;
  securityCode: string;
  securityName: string;
  acquisitionPrice: number;
  currentReturnPct: number;
  currentValue: number;
  gainLoss: number;
  envelopeId: number;
}

interface AuditLog {
  id: number;
  timestamp: string;
  auctioneer: string;
  action: string;
  traderId: string;
  security: string;
  bidAmount: number;
  envelopeId: number;
  round: number;
  details: string;
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(val);
};

export const AuctionDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'bid' | 'portfolio' | 'envelope' | 'audit'>('overview');
  const [round, setRound] = useState<number>(1);
  const { token, username } = useAuth();
  const { showError, showSuccess } = useToast();
  
  // Data State
  const [securities, setSecurities] = useState<Security[]>([]);
  const [traders, setTraders] = useState<TraderPortfolio[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedTraderId, setSelectedTraderId] = useState<string>('');
  const [selectedTraderDetails, setSelectedTraderDetails] = useState<TraderPortfolio | null>(null);

  // Forms State
  const [bidForm, setBidForm] = useState({ traderId: '', securityCode: '', bidAmount: '', envelopeId: '' });
  const [envForm, setEnvForm] = useState({ traderId: '', envelopeId: '' });
  const [loading, setLoading] = useState(false);

  const fetchSecurities = async () => {
    try {
      const res = await fetch('/api/auction/securities', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setSecurities(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTraders = async () => {
    try {
      const res = await fetch('/api/auction/traders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setTraders(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTraderDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/auction/traders/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSelectedTraderDetails(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/auction/audit', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setAuditLogs(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSecurities();
      fetchTraders();
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'portfolio') {
      fetchTraders();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedTraderId) {
      fetchTraderDetails(selectedTraderId);
    }
  }, [selectedTraderId]);

  const handleBidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auction/bid', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          ...bidForm,
          auctionRound: round
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        showSuccess('Bid successful');
        setBidForm({ traderId: '', securityCode: '', bidAmount: '', envelopeId: '' });
        fetchTraders();
      } else {
        showError(data.error || 'Bid failed');
      }
    } catch (err) {
      showError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleEnvSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auction/envelope', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          ...envForm,
          auctionRound: round
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        showSuccess('Envelope applied successfully');
        setEnvForm({ traderId: '', envelopeId: '' });
      } else {
        showError(data.error || 'Failed to apply envelope');
      }
    } catch (err) {
      showError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const tabStyle = (tab: string) => ({
    padding: '10px 20px',
    cursor: 'pointer',
    backgroundColor: activeTab === tab ? '#2c3e50' : '#34495e',
    color: '#fff',
    border: 'none',
    marginRight: '5px',
    borderRadius: '4px 4px 0 0'
  });

  return (
    <div className="admin-container" style={{ padding: '20px', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>EDGE Auction Module</h2>
        <div>
          <label style={{ marginRight: '10px' }}>Current Round: </label>
          <select 
            value={round} 
            onChange={(e) => setRound(Number(e.target.value))}
            style={{ padding: '5px', background: '#333', color: '#fff', border: '1px solid #555' }}
          >
            <option value={1}>Round 1</option>
            <option value={2}>Round 2</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '2px solid #2c3e50' }}>
        <button style={tabStyle('overview')} onClick={() => setActiveTab('overview')}>Overview</button>
        <button style={tabStyle('bid')} onClick={() => setActiveTab('bid')}>Bid Entry</button>
        <button style={tabStyle('portfolio')} onClick={() => setActiveTab('portfolio')}>Trader Portfolios</button>
        <button style={tabStyle('envelope')} onClick={() => setActiveTab('envelope')}>Apply Envelope</button>
        <button style={tabStyle('audit')} onClick={() => setActiveTab('audit')}>Audit Log</button>
      </div>

      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '8px' }}>
        {activeTab === 'overview' && (
          <div>
            <h3>Auction Overview</h3>
            <p>Welcome, {username}. The Auction Module is currently operating in Round {round}.</p>
            <p>Total Traders: {traders.length}</p>
            <p>Total Securities: {securities.length}</p>
          </div>
        )}

        {activeTab === 'bid' && (
          <div style={{ maxWidth: '600px' }}>
            <h3>Bid Entry - Round {round}</h3>
            <form onSubmit={handleBidSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Trader ID</label>
                <input 
                  type="text" 
                  value={bidForm.traderId} 
                  onChange={e => setBidForm({...bidForm, traderId: e.target.value})} 
                  placeholder="e.g. TR01"
                  required
                  style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Security Code</label>
                <input 
                  type="text" 
                  value={bidForm.securityCode} 
                  onChange={e => {
                    const code = e.target.value;
                    setBidForm({...bidForm, securityCode: code});
                  }} 
                  placeholder="e.g. 1"
                  required
                  style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff' }}
                />
                {bidForm.securityCode && securities.find(s => s.code === String(bidForm.securityCode).replace(/^0+/, '') || s.code === bidForm.securityCode) && (
                  <div style={{ marginTop: '5px', fontSize: '0.9em', color: '#4caf50' }}>
                    Found: {securities.find(s => s.code === String(bidForm.securityCode).replace(/^0+/, '') || s.code === bidForm.securityCode)?.name} 
                    (Return: {securities.find(s => s.code === String(bidForm.securityCode).replace(/^0+/, '') || s.code === bidForm.securityCode)?.returnPct.toFixed(2)}%)
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Bid Amount (₹)</label>
                <input 
                  type="number" 
                  value={bidForm.bidAmount} 
                  onChange={e => setBidForm({...bidForm, bidAmount: e.target.value})} 
                  placeholder="Amount"
                  required
                  min="1"
                  style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Envelope ID (Optional)</label>
                <input 
                  type="number" 
                  value={bidForm.envelopeId} 
                  onChange={e => setBidForm({...bidForm, envelopeId: e.target.value})} 
                  placeholder="Leave blank for none (0)"
                  style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff' }}
                />
              </div>

              <button 
                type="submit" 
                disabled={loading}
                style={{ padding: '12px', background: '#4caf50', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
              >
                {loading ? 'Processing...' : 'Submit Bid'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'portfolio' && (
          <div>
            <h3>Trader Portfolios</h3>
            
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1, overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#333' }}>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Trader</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Starting Corpus</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Remaining Corpus</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Portfolio Value</th>
                      <th style={{ padding: '10px', textAlign: 'right' }}>Difference</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traders.map(t => (
                      <tr key={t.traderId} style={{ 
                        borderBottom: '1px solid #444',
                        background: t.isLowCorpus ? 'rgba(255, 193, 7, 0.2)' : 'transparent',
                        color: t.isLowCorpus ? '#ffeb3b' : 'inherit'
                      }}>
                        <td style={{ padding: '10px' }}>{t.traderId}</td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(t.startingCorpus)}</td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(t.remainingCorpus)}</td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(t.totalPortfolioValue)}</td>
                        <td style={{ padding: '10px', textAlign: 'right', color: t.difference >= 0 ? '#4caf50' : '#f44336' }}>
                          {t.difference > 0 ? '+' : ''}{formatCurrency(t.difference)}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <button onClick={() => setSelectedTraderId(t.traderId)} style={{ padding: '5px 10px', background: '#2196f3', border: 'none', color: '#fff', cursor: 'pointer' }}>View</button>
                        </td>
                      </tr>
                    ))}
                    {traders.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>No traders found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {selectedTraderId && selectedTraderDetails && (
                <div style={{ flex: 1, background: '#222', padding: '20px', borderRadius: '8px' }}>
                  <h4>Trader Details: {selectedTraderDetails.traderId}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                    <div><strong>Starting:</strong> {formatCurrency(selectedTraderDetails.startingCorpus)}</div>
                    <div><strong>Remaining:</strong> {formatCurrency(selectedTraderDetails.remainingCorpus)}</div>
                    <div><strong>Holdings Val:</strong> {formatCurrency(selectedTraderDetails.currentHoldingsValue)}</div>
                    <div><strong>Gain/Loss:</strong> <span style={{ color: selectedTraderDetails.difference >= 0 ? '#4caf50' : '#f44336' }}>{formatCurrency(selectedTraderDetails.difference)}</span></div>
                  </div>
                  
                  <h5>Holdings</h5>
                  {selectedTraderDetails.holdings && selectedTraderDetails.holdings.length > 0 ? (
                    <table style={{ width: '100%', fontSize: '0.9em', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #555' }}>
                          <th style={{ textAlign: 'left', padding: '5px' }}>Security</th>
                          <th style={{ textAlign: 'right', padding: '5px' }}>Acq Price</th>
                          <th style={{ textAlign: 'right', padding: '5px' }}>Return</th>
                          <th style={{ textAlign: 'right', padding: '5px' }}>Value</th>
                          <th style={{ textAlign: 'center', padding: '5px' }}>Rnd</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTraderDetails.holdings.map(h => (
                          <tr key={h.id} style={{ borderBottom: '1px solid #444' }}>
                            <td style={{ padding: '5px' }}>{h.securityName} ({h.securityCode})</td>
                            <td style={{ textAlign: 'right', padding: '5px' }}>{formatCurrency(h.acquisitionPrice)}</td>
                            <td style={{ textAlign: 'right', padding: '5px', color: h.currentReturnPct >= 0 ? '#4caf50' : '#f44336' }}>
                              {h.currentReturnPct.toFixed(2)}%
                            </td>
                            <td style={{ textAlign: 'right', padding: '5px' }}>{formatCurrency(h.currentValue)}</td>
                            <td style={{ textAlign: 'center', padding: '5px' }}>{h.round}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p>No holdings found.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'envelope' && (
          <div style={{ maxWidth: '600px' }}>
            <h3>Apply Envelope - Round {round}</h3>
            <p style={{ color: '#ccc', marginBottom: '15px' }}>Note: The exact envelope rules are pending. This creates the audit record and assignment.</p>
            <form onSubmit={handleEnvSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Trader ID</label>
                <input 
                  type="text" 
                  value={envForm.traderId} 
                  onChange={e => setEnvForm({...envForm, traderId: e.target.value})} 
                  placeholder="e.g. TR01"
                  required
                  style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Envelope ID</label>
                <input 
                  type="number" 
                  value={envForm.envelopeId} 
                  onChange={e => setEnvForm({...envForm, envelopeId: e.target.value})} 
                  placeholder="Envelope ID"
                  required
                  min="1"
                  style={{ width: '100%', padding: '10px', background: '#222', border: '1px solid #444', color: '#fff' }}
                />
              </div>

              <button 
                type="submit" 
                disabled={loading}
                style={{ padding: '12px', background: '#9c27b0', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
              >
                {loading ? 'Processing...' : 'Apply Envelope'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'audit' && (
          <div>
            <h3>Auction Audit Log</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                <thead>
                  <tr style={{ background: '#333' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Action</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Trader</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Details</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Round</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #444' }}>
                      <td style={{ padding: '10px' }}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={{ padding: '10px' }}>{log.action}</td>
                      <td style={{ padding: '10px' }}>{log.traderId}</td>
                      <td style={{ padding: '10px' }}>
                        {log.details}
                        {log.security && ` | Sec: ${log.security}`}
                        {log.bidAmount && ` | Amt: ${formatCurrency(log.bidAmount)}`}
                        {log.envelopeId ? ` | Env: ${log.envelopeId}` : ''}
                      </td>
                      <td style={{ padding: '10px' }}>{log.round}</td>
                      <td style={{ padding: '10px' }}>{log.auctioneer}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>No audit logs found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
