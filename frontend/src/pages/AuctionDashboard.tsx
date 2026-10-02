import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Gavel, TrendingUp, Users, AlertCircle, ShieldAlert, FileText, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';

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
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedTraderId, setSelectedTraderId] = useState<string>('');
  const [selectedTraderDetails, setSelectedTraderDetails] = useState<TraderPortfolio | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Forms State
  const [bidForm, setBidForm] = useState({ traderId: '', securityCode: '', bidAmount: '', envelopeId: '' });
  const [setupForm, setSetupForm] = useState({ numTraders: '', startingCorpus: '2000000' });
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const fetchSecurities = async () => {
    try {
      const res = await fetch('/api/auction/securities', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSecurities(await res.json());
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to load securities: ${res.status}`);
      }
    } catch (e: any) {
      console.error('fetchSecurities error:', e);
      setInitError(e.message || 'Network error fetching securities');
    }
  };

  const fetchTraders = async () => {
    try {
      const res = await fetch('/api/auction/traders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTraders(data);
        setIsInitialized(data.length > 0);
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to load traders: ${res.status}`);
      }
    } catch (e: any) {
      console.error('fetchTraders error:', e);
      setInitError(e.message || 'Network error fetching traders');
      setIsInitialized(null); // Keep it null so it shows error, not setup
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
    if (activeTab === 'portfolio' || activeTab === 'overview') {
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
        fetchTraders(); // Background update
      } else {
        showError(data.error || 'Bid failed');
      }
    } catch (err) {
      showError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleEnvSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auction/envelope', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          traderId: bidForm.traderId,
          envelopeId: bidForm.envelopeId,
          auctionRound: round
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        showSuccess('Envelope applied successfully');
        setBidForm({ ...bidForm, envelopeId: '' });
      } else {
        showError(data.error || 'Failed to apply envelope');
      }
    } catch (err) {
      showError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auction/initialize', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          numTraders: Number(setupForm.numTraders),
          startingCorpus: Number(setupForm.startingCorpus)
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        showSuccess('Auction Initialized successfully');
        fetchTraders(); // will update isInitialized to true
      } else {
        showError(data.error || 'Setup failed');
      }
    } catch (err) {
      showError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const tabStyle = (tab: string) => ({
    padding: '0.75rem 1.5rem',
    cursor: 'pointer',
    backgroundColor: activeTab === tab ? 'var(--bg-panel)' : 'transparent',
    color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid var(--accent-primary)' : '2px solid transparent',
    fontWeight: 600,
    fontSize: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease'
  });

  const lowCorpusTraders = traders.filter(t => t.isLowCorpus).length;
  
  // Security auto-complete logic
  const normalizedSecCode = bidForm.securityCode.replace(/^0+/, '') || '0';
  const foundSecurity = securities.find(s => s.code === normalizedSecCode);
  
  // Trader context logic for bid entry
  const normalizedTraderId = bidForm.traderId.toUpperCase();
  const foundTrader = traders.find(t => t.traderId === normalizedTraderId);
  const isInsufficient = foundTrader && bidForm.bidAmount ? parseFloat(bidForm.bidAmount) > foundTrader.remainingCorpus : false;

  if (initError) {
    return (
      <div className="admin-container">
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-panel)', borderRadius: '12px', marginTop: '2rem' }}>
          <AlertCircle size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
          <h3 style={{ color: 'var(--text-bright)', marginBottom: '0.5rem' }}>Failed to load Auction Module</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{initError}</p>
          <button 
            onClick={() => { setInitError(null); fetchSecurities(); fetchTraders(); }} 
            className="btn btn-primary"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  if (isInitialized === null) {
    return <div className="admin-container"><div style={{ padding: '2rem', textAlign: 'center' }}>Loading Auction Module...</div></div>;
  }

  if (isInitialized === false) {
    const totalInitial = Number(setupForm.numTraders || 0) * Number(setupForm.startingCorpus || 0);
    return (
      <div className="admin-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Gavel size={28} style={{ color: 'var(--accent-primary)' }} />
              Auction Module Setup
            </h1>
            <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)' }}>Configure the initial auction parameters before proceeding.</p>
          </div>
        </div>

        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div className="panel-card">
            <div className="panel-header" style={{ background: 'var(--bg-panel-alt)' }}>
              <Users size={18} />
              <span style={{ fontWeight: 'bold' }}>INITIALIZE TRADER PORTFOLIOS</span>
            </div>
            
            <div style={{ padding: '2rem' }}>
              <form onSubmit={handleSetupSubmit}>
                <div className="admin-grid" style={{ marginBottom: '2rem', gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Number of Traders</label>
                    <input 
                      type="number" 
                      className="form-input"
                      value={setupForm.numTraders} 
                      onChange={e => setSetupForm({...setupForm, numTraders: e.target.value})} 
                      placeholder="e.g. 10"
                      required
                      min="1"
                      autoFocus
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Starting Corpus Per Trader</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>₹</span>
                      <input 
                        type="number" 
                        className="form-input"
                        value={setupForm.startingCorpus} 
                        onChange={e => setSetupForm({...setupForm, startingCorpus: e.target.value})} 
                        placeholder="2000000"
                        required
                        min="1"
                        style={{ paddingLeft: '2rem' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', padding: '1.5rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '2rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle size={18} /> Setup Summary
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Total Traders to Create:</span>
                    <span style={{ fontWeight: 'bold' }}>{setupForm.numTraders || 0} Traders (TR01...TR{setupForm.numTraders || 'N'})</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Starting Corpus per Trader:</span>
                    <span style={{ fontWeight: 'bold' }}>{formatCurrency(Number(setupForm.startingCorpus || 0))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <span style={{ fontWeight: 'bold' }}>Total Initial Corpus (Aggregate):</span>
                    <span style={{ fontWeight: 'bold', color: 'var(--accent-primary)', fontSize: '1.1rem' }}>{formatCurrency(totalInitial)}</span>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={loading || !setupForm.numTraders || !setupForm.startingCorpus}
                  style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                >
                  {loading ? 'Initializing...' : (
                    <>
                      Initialize Auction <TrendingUp size={20} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Gavel size={28} style={{ color: 'var(--accent-primary)' }} />
            Auction Module
          </h1>
          <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)' }}>Welcome, {username}. Manage live auction bidding and envelopes.</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-panel)', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Active Round</span>
          <select 
            value={round} 
            onChange={(e) => setRound(Number(e.target.value))}
            className="form-input"
            style={{ margin: 0, width: '120px', fontWeight: 'bold' }}
          >
            <option value={1}>Round 1</option>
            <option value={2}>Round 2</option>
          </select>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
        <button style={tabStyle('overview')} onClick={() => setActiveTab('overview')}><TrendingUp size={16}/> Overview</button>
        <button style={tabStyle('bid')} onClick={() => setActiveTab('bid')}><Gavel size={16}/> Bid Entry</button>
        <button style={tabStyle('portfolio')} onClick={() => setActiveTab('portfolio')}><Users size={16}/> Trader Portfolios</button>
        <button style={tabStyle('audit')} onClick={() => setActiveTab('audit')}><FileText size={16}/> Audit Log</button>
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="admin-grid">
          {/* Summary Cards */}
          <div className="panel-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>CURRENT ROUND</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Round {round}
            </span>
          </div>
          <div className="panel-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>STARTING CORPUS</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
              {traders.length > 0 ? formatCurrency(traders[0].startingCorpus) : '₹0'}
            </span>
          </div>
          <div className="panel-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>ACTIVE TRADERS</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              {traders.length}
            </span>
          </div>
          <div className="panel-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>TOTAL INITIAL CORPUS</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-secondary)' }}>
              {traders.length > 0 ? formatCurrency(traders.length * traders[0].startingCorpus) : '₹0'}
            </span>
          </div>
          <div className="panel-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: lowCorpusTraders > 0 ? '1px solid rgba(234, 179, 8, 0.5)' : '1px solid var(--border-color)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>LOW CORPUS WARNINGS (&lt; ₹5L)</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: lowCorpusTraders > 0 ? '#eab308' : 'var(--text-primary)' }}>
              {lowCorpusTraders} Traders
            </span>
          </div>
          
          {/* Securities Master Table Snippet */}
          <div className="panel-card" style={{ gridColumn: '1 / -1' }}>
            <div className="panel-header">
              <ShieldAlert size={18} />
              <span style={{ fontWeight: 'bold' }}>AUCTION SECURITIES MASTER</span>
            </div>
            <div style={{ padding: '1rem' }}>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search securities by code or name..." 
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{ marginBottom: '1rem', maxWidth: '400px' }}
              />
              <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="custom-table">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ width: '100px' }}>Code</th>
                      <th>Security Name</th>
                      <th style={{ textAlign: 'right' }}>Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {securities
                      .filter(s => s.code.includes(searchFilter) || s.name.toLowerCase().includes(searchFilter.toLowerCase()))
                      .map(s => (
                      <tr key={s.code}>
                        <td style={{ fontWeight: 'bold' }}>{s.code}</td>
                        <td>{s.name}</td>
                        <td style={{ textAlign: 'right', color: s.returnPct >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                          {s.returnPct > 0 ? '+' : ''}{s.returnPct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                    {securities.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                          Loading securities...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BID ENTRY TAB */}
      {activeTab === 'bid' && (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="panel-card">
            <div className="panel-header" style={{ background: 'var(--bg-panel-alt)' }}>
              <Gavel size={18} />
              <span style={{ fontWeight: 'bold' }}>LIVE BID ENTRY - ROUND {round}</span>
            </div>
            
            <div style={{ padding: '2rem' }}>
              <form onSubmit={handleBidSubmit}>
                
                <div className="form-group">
                  <label className="form-label">Trader ID</label>
                  <input 
                    type="text" 
                    className="form-input"
                    value={bidForm.traderId} 
                    onChange={e => setBidForm({...bidForm, traderId: e.target.value})} 
                    placeholder="e.g. TR01"
                    required
                    autoFocus
                  />
                  {foundTrader && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem' }}>
                      <span>Remaining Corpus: <strong style={{ color: foundTrader.remainingCorpus < 500000 ? '#eab308' : 'inherit' }}>{formatCurrency(foundTrader.remainingCorpus)}</strong></span>
                      <span>Holdings Value: <strong>{formatCurrency(foundTrader.currentHoldingsValue)}</strong></span>
                    </div>
                  )}
                </div>
                
                <div className="form-group">
                  <label className="form-label">Security Code</label>
                  <input 
                    type="text" 
                    className="form-input"
                    value={bidForm.securityCode} 
                    onChange={e => setBidForm({...bidForm, securityCode: e.target.value})} 
                    placeholder="e.g. 1"
                    required
                  />
                  {bidForm.securityCode && (
                    <div style={{ 
                      marginTop: '0.5rem', 
                      padding: '0.75rem', 
                      borderRadius: '6px', 
                      backgroundColor: foundSecurity ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      border: `1px solid ${foundSecurity ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.9rem'
                    }}>
                      {foundSecurity ? (
                        <>
                          <CheckCircle size={16} color="#10b981" />
                          <span style={{ color: '#10b981', fontWeight: 600 }}>{foundSecurity.name}</span>
                          <span style={{ marginLeft: 'auto', color: foundSecurity.returnPct >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                            {foundSecurity.returnPct > 0 ? '+' : ''}{foundSecurity.returnPct.toFixed(2)}%
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={16} color="#ef4444" />
                          <span style={{ color: '#ef4444' }}>Security not found</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Bid Amount</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>₹</span>
                    <input 
                      type="number" 
                      className="form-input"
                      value={bidForm.bidAmount} 
                      onChange={e => setBidForm({...bidForm, bidAmount: e.target.value})} 
                      placeholder="Amount"
                      required
                      min="1"
                      style={{ paddingLeft: '2rem' }}
                    />
                  </div>
                  {isInsufficient && (
                    <div style={{ marginTop: '0.5rem', color: '#ef4444', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <AlertCircle size={14} /> Insufficient remaining corpus (Max: {formatCurrency(foundTrader!.remainingCorpus)})
                    </div>
                  )}
                </div>

                <div className="form-group" style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3b82f6' }}>
                    <AlertCircle size={14} /> Envelope Controls
                  </label>
                  <input 
                    type="number" 
                    className="form-input"
                    value={bidForm.envelopeId} 
                    onChange={e => setBidForm({...bidForm, envelopeId: e.target.value})} 
                    placeholder="Envelope ID (Optional)"
                    style={{ marginBottom: '0.75rem' }}
                  />
                  <button 
                    type="button" 
                    onClick={handleEnvSubmit}
                    className="btn btn-outline"
                    disabled={loading || !bidForm.traderId || !bidForm.envelopeId}
                    style={{ width: '100%', padding: '0.65rem', fontSize: '0.9rem', borderColor: 'rgba(59, 130, 246, 0.5)', color: '#3b82f6' }}
                  >
                    Apply Envelope Effect Only
                  </button>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={loading || isInsufficient || !foundSecurity}
                  style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', marginTop: '1rem' }}
                >
                  {loading ? 'Processing...' : 'Submit Bid'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* PORTFOLIO TAB */}
      {activeTab === 'portfolio' && (
        <div className="panel-card">
          <div className="panel-header" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} />
              <span style={{ fontWeight: 'bold' }}>TRADER PORTFOLIOS</span>
            </div>
          </div>
          
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Trader ID</th>
                  <th style={{ textAlign: 'right' }}>Starting Corpus</th>
                  <th style={{ textAlign: 'right' }}>Cash Balance</th>
                  <th style={{ textAlign: 'right' }}>Holdings Value</th>
                  <th style={{ textAlign: 'right' }}>Portfolio Value</th>
                  <th style={{ textAlign: 'right' }}>Difference</th>
                </tr>
              </thead>
              <tbody>
                {traders.map(t => (
                  <React.Fragment key={t.traderId}>
                    <tr 
                      style={{ 
                        cursor: 'pointer', 
                        backgroundColor: t.isLowCorpus ? 'rgba(234, 179, 8, 0.1)' : 'transparent',
                        borderBottom: selectedTraderId === t.traderId ? 'none' : undefined
                      }}
                      onClick={() => {
                        if (selectedTraderId === t.traderId) {
                          setSelectedTraderId('');
                          setSelectedTraderDetails(null);
                        } else {
                          setSelectedTraderId(t.traderId);
                        }
                      }}
                    >
                      <td style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {selectedTraderId === t.traderId ? <ChevronDown size={18} color="#94a3b8" /> : <ChevronRight size={18} color="#94a3b8" />}
                        {t.traderId}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(t.startingCorpus)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: t.isLowCorpus ? 'bold' : 'normal', color: t.isLowCorpus ? '#eab308' : 'inherit' }}>
                        {formatCurrency(t.remainingCorpus)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(t.currentHoldingsValue)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{formatCurrency(t.totalPortfolioValue)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: t.difference >= 0 ? '#10b981' : '#ef4444' }}>
                        {t.difference > 0 ? '+' : ''}{formatCurrency(t.difference)}
                      </td>
                    </tr>
                    
                    {/* Expanded details */}
                    {selectedTraderId === t.traderId && selectedTraderDetails && (
                      <tr style={{ backgroundColor: '#111726' }}>
                        <td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--border-color)' }}>
                          <div style={{ padding: '0 2rem 2rem 3rem', borderLeft: '2px solid #f59e0b', margin: '1rem 0' }}>
                            <h4 style={{ margin: '0 0 1rem 0', color: '#f59e0b', fontSize: '0.8rem', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <ChevronDown size={14} /> ACQUIRED HOLDINGS
                            </h4>
                            <table className="custom-table" style={{ background: 'transparent' }}>
                              <thead>
                                <tr>
                                  <th>Security</th>
                                  <th style={{ textAlign: 'right' }}>Bid Value</th>
                                  <th style={{ textAlign: 'right' }}>Return</th>
                                  <th style={{ textAlign: 'right' }}>Current Value</th>
                                  <th style={{ textAlign: 'right' }}>Gain/Loss</th>
                                  <th style={{ textAlign: 'center' }}>Round</th>
                                  <th style={{ textAlign: 'center' }}>Env</th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedTraderDetails.holdings && selectedTraderDetails.holdings.map(h => (
                                  <tr key={h.id}>
                                    <td style={{ fontWeight: 'bold', color: '#3b82f6', letterSpacing: '0.05em' }}>{h.securityName} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({h.securityCode})</span></td>
                                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatCurrency(h.acquisitionPrice)}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: h.currentReturnPct >= 0 ? '#10b981' : '#ef4444' }}>
                                      {h.currentReturnPct > 0 ? '+' : ''}{h.currentReturnPct.toFixed(2)}%
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{formatCurrency(h.currentValue)}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: h.gainLoss >= 0 ? '#10b981' : '#ef4444' }}>
                                      {h.gainLoss > 0 ? '+' : ''}{formatCurrency(h.gainLoss)}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{h.round}</td>
                                    <td style={{ textAlign: 'center' }}>{h.envelopeId > 0 ? h.envelopeId : '-'}</td>
                                  </tr>
                                ))}
                                {(!selectedTraderDetails.holdings || selectedTraderDetails.holdings.length === 0) && (
                                  <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No active holdings</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {traders.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No traders found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AUDIT LOG TAB */}
      {activeTab === 'audit' && (
        <div className="panel-card">
          <div className="panel-header">
            <FileText size={18} />
            <span style={{ fontWeight: 'bold' }}>AUCTION AUDIT LOG</span>
          </div>
          
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>Timestamp</th>
                  <th>Action</th>
                  <th>Trader</th>
                  <th>Details</th>
                  <th style={{ textAlign: 'center' }}>Round</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td>
                      <span style={{ 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '4px', 
                        fontSize: '0.75rem', 
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        color: '#60a5fa'
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontWeight: 'bold' }}>{log.traderId}</td>
                    <td>
                      {log.details}
                      {log.security && <span style={{ marginLeft: '10px', color: 'var(--text-muted)' }}>| Sec: <strong>{log.security}</strong></span>}
                      {log.bidAmount && <span style={{ marginLeft: '10px', color: 'var(--text-muted)' }}>| Amt: <strong>{formatCurrency(log.bidAmount)}</strong></span>}
                      {log.envelopeId ? <span style={{ marginLeft: '10px', color: 'var(--text-muted)' }}>| Env: <strong>{log.envelopeId}</strong></span> : ''}
                    </td>
                    <td style={{ textAlign: 'center' }}>{log.round}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{log.auctioneer}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No audit logs found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
