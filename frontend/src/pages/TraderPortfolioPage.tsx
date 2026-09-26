import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { ChevronDown, ChevronRight, Briefcase, TrendingUp, TrendingDown } from 'lucide-react';
import { ConnectionStatus } from '../components/common/ConnectionStatus';

export const TraderPortfolioPage: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const { apiFetch } = useApi();
  const [traders, setTraders] = useState<any[]>([]);
  const [expandedTraders, setExpandedTraders] = useState<Set<number>>(new Set());
  const [expandedSecurities, setExpandedSecurities] = useState<Set<string>>(new Set());

  const fetchTraders = async () => {
    try {
      const res = await apiFetch('/api/traders');
      if (res.ok) {
        let fetched = await res.json();
        
        // Check if market has ended by seeing if any trader has settlements
        const hasEnded = fetched.some((t: any) => t.settlements && t.settlements.length > 0);
        
        if (hasEnded) {
          fetched.sort((a: any, b: any) => b.current_cash_balance - a.current_cash_balance);
        }
        
        setTraders(fetched);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (token && (hasPermission('BULL_RING_ADMIN') || hasPermission('BULL_RING_SUPERADMIN'))) {
      fetchTraders();
      const interval = setInterval(fetchTraders, 5000);
      return () => clearInterval(interval);
    }
  }, [token, hasPermission]);

  const toggleTrader = (id: number) => {
    const next = new Set(expandedTraders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedTraders(next);
  };

  const toggleSecurity = (key: string) => {
    const next = new Set(expandedSecurities);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedSecurities(next);
  };

  const formatMoney = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);

  return (
    <div className="admin-container">
      <ConnectionStatus />
      
      <div className="panel-card mt-4">
        <div className="panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Briefcase size={22} color="#3b82f6" />
            <span>TRADER PORTFOLIOS</span>
          </div>
        </div>

        {traders.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No traders found. Portfolios will appear here once traders are created.
          </div>
        ) : (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Table Header Level 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr', padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
              <div>Trader ID</div>
              <div style={{ textAlign: 'right' }}>Starting Corpus</div>
              <div style={{ textAlign: 'right' }}>Cash Balance</div>
              <div style={{ textAlign: 'right' }}>Difference</div>
              <div style={{ textAlign: 'right' }}>Total Shares</div>
              <div style={{ textAlign: 'right' }}>Total Quantity</div>
            </div>

            {traders.map(trader => {
              const diff = trader.current_cash_balance - trader.starting_corpus;
              const hasSettlements = trader.settlements && trader.settlements.length > 0;
              const totalDifferentSecurities = trader.holdings ? trader.holdings.length : 0;
              const totalQuantity = trader.total_shares || 0; // The API returns total quantity as total_shares

              return (
              <div key={trader.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                
                {/* Level 1: Trader Row */}
                <div 
                  style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 1fr', alignItems: 'center', padding: '0.75rem 1rem', cursor: 'pointer', backgroundColor: 'var(--bg-panel)' }}
                  onClick={() => toggleTrader(trader.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                    {expandedTraders.has(trader.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {trader.trader_identifier}
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    {formatMoney(trader.starting_corpus)}
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#fff' }}>
                    {formatMoney(trader.current_cash_balance)}
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
                      {diff > 0 && <TrendingUp size={14} />}
                      {diff < 0 && <TrendingDown size={14} />}
                      {diff > 0 ? '+' : ''}{formatMoney(diff)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {totalDifferentSecurities}
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {totalQuantity.toLocaleString('en-IN')}
                  </div>
                </div>

                {/* Level 2: Security Rows */}
                {expandedTraders.has(trader.id) && (
                  <div style={{ padding: '0', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    {hasSettlements && (
                      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div 
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem 0.5rem 2.5rem', cursor: 'pointer', fontWeight: 'bold', color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}
                          onClick={() => toggleSecurity(`settle-${trader.id}`)}
                        >
                          {expandedSecurities.has(`settle-${trader.id}`) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          LTP SQUARE OFF
                        </div>
                        
                        {expandedSecurities.has(`settle-${trader.id}`) && (
                          <div style={{ padding: '0.5rem 1rem 0.5rem 4rem', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr', padding: '0.25rem 0', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                              <div>Security</div>
                              <div style={{ textAlign: 'right' }}>Remaining Shares</div>
                              <div style={{ textAlign: 'right' }}>Closing LTP</div>
                              <div style={{ textAlign: 'right' }}>Revised LTP (-20%)</div>
                              <div style={{ textAlign: 'right' }}>Total Value Settled</div>
                            </div>
                            
                            {trader.settlements.map((st: any, idx: number) => (
                              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr', padding: '0.25rem 0', fontSize: '0.85rem' }}>
                                <div style={{ color: 'var(--color-blue)', fontWeight: 600 }}>{st.security_symbol}</div>
                                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{st.quantity.toLocaleString('en-IN')}</div>
                                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatMoney(st.final_market_ltp)}</div>
                                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#10b981' }}>{formatMoney(st.settlement_price)}</div>
                                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#fff' }}>{formatMoney(st.settlement_value)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {(!trader.holdings || trader.holdings.length === 0) ? (
                      <div style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>No active holdings</div>
                    ) : (
                      <div>
                        {/* Table Header Level 2 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '0.5rem 1rem 0.5rem 2.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                          <div>Security</div>
                          <div style={{ textAlign: 'right' }}>Avg Price</div>
                          <div style={{ textAlign: 'right' }}>Quantity</div>
                          <div style={{ textAlign: 'right' }}>Total Value</div>
                        </div>

                        {trader.holdings.map((h: any) => {
                          const secKey = `${trader.id}-${h.security_id}`;
                          const avgPrice = h.total_quantity > 0 ? (h.total_value / h.total_quantity) : 0;

                          return (
                            <div key={secKey}>
                              <div 
                                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', alignItems: 'center', padding: '0.5rem 1rem 0.5rem 2.5rem', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                onClick={() => toggleSecurity(secKey)}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                                  {expandedSecurities.has(secKey) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  <span style={{ color: '#60a5fa' }}>{h.security_symbol}</span>
                                </div>
                                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{formatMoney(avgPrice)}</div>
                                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{h.total_quantity.toLocaleString('en-IN')}</div>
                                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{formatMoney(h.total_value)}</div>
                              </div>

                              {/* Level 3: Individual Lots */}
                              {expandedSecurities.has(secKey) && (
                                <div style={{ padding: '0.5rem 1rem 0.5rem 4rem', backgroundColor: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '0.25rem 0', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                                    <div>Trade Audit Log ID</div>
                                    <div style={{ textAlign: 'right' }}>Quantity</div>
                                    <div style={{ textAlign: 'right' }}>Price</div>
                                    <div style={{ textAlign: 'right' }}>Total Price</div>
                                  </div>
                                  
                                  {h.lots.map((lot: any, idx: number) => (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '0.25rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                      <div style={{ fontFamily: 'var(--font-mono)', color: '#a78bfa' }}>{lot.audit_id}</div>
                                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{lot.remaining_quantity.toLocaleString('en-IN')}</div>
                                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatMoney(lot.acquisition_price)}</div>
                                      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatMoney(lot.total_price)}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )})}
          </div>
        )}
      </div>
    </div>
  );
};
