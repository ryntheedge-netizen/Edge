import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { ChevronDown, ChevronRight, Wallet } from 'lucide-react';

export const TraderPortfolioList: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const { apiFetch } = useApi();
  const [traders, setTraders] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const fetchTraders = async () => {
    try {
      const res = await apiFetch('/api/traders');
      if (res.ok) {
        setTraders(await res.json());
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

  const toggleExpand = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const formatMoney = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);

  if (traders.length === 0) return null;

  return (
    <div className="panel-card mt-4">
      <div className="panel-header">
        <Wallet size={18} />
        <span>TRADER PORTFOLIOS</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {traders.map(trader => (
          <div key={trader.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1rem', cursor: 'pointer', backgroundColor: 'var(--bg-panel)' }}
              onClick={() => toggleExpand(trader.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {expanded.has(trader.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span style={{ fontWeight: 'bold' }}>{trader.trader_identifier}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {formatMoney(trader.current_cash_balance)}
              </div>
            </div>
            {expanded.has(trader.id) && (
              <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Share Holdings</div>
                {trader.holdings.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No holdings</div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.25rem' }}>
                    {trader.holdings.map((h: any) => (
                      <li key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span>{h.security_symbol} ({h.security_name})</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{h.quantity} shares</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
