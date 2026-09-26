import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { FileText } from 'lucide-react';

export const TraderAuditLogs: React.FC = () => {
  const { token, hasPermission } = useAuth();
  const { apiFetch } = useApi();
  const [scrapTrades, setScrapTrades] = useState<any[]>([]);
  const [view, setView] = useState<'VALID' | 'SCRAP'>('SCRAP');

  const fetchScrapTrades = async () => {
    try {
      const res = await apiFetch('/api/trades/scrap');
      if (res.ok) {
        const data = await res.json();
        setScrapTrades(data.scraps);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (token && hasPermission('BULL_RING_SUPERADMIN')) {
      fetchScrapTrades();
      const interval = setInterval(fetchScrapTrades, 5000);
      return () => clearInterval(interval);
    }
  }, [token, hasPermission]);

  const formatMoney = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);

  if (!hasPermission('BULL_RING_SUPERADMIN')) return null;

  return (
    <div className="panel-card mt-4">
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <FileText size={18} />
          <span>SUPERADMIN AUDIT LOGS</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            className={`btn ${view === 'SCRAP' ? 'btn-primary' : ''}`} 
            style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
            onClick={() => setView('SCRAP')}
          >
            SCRAP TRADES
          </button>
        </div>
      </div>

      {view === 'SCRAP' && (
        <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>BUYER</th>
                <th>SELLER</th>
                <th>SECURITY</th>
                <th className="text-right">QTY</th>
                <th className="text-right">PRICE</th>
                <th className="text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {scrapTrades.map((t) => (
                <tr key={t.id} style={{ color: 'var(--text-muted)' }}>
                  <td>{new Date(t.attempted_at).toLocaleTimeString()}</td>
                  <td>{t.buyer_id}</td>
                  <td>{t.seller_id}</td>
                  <td>{t.security_symbol}</td>
                  <td className="text-right font-mono">{t.quantity}</td>
                  <td className="text-right font-mono">{formatMoney(t.price)}</td>
                  <td className="text-right font-mono">{formatMoney(t.total_value)}</td>
                </tr>
              ))}
              {scrapTrades.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
                    No scrapped trades found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
