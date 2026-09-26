import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApi } from '../hooks/useApi';
import { Shield, Download, AlertCircle } from 'lucide-react';
import { EventState, Trade } from '../types';
import * as XLSX from 'xlsx';

export const SuperadminAuditLogsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const { apiFetch } = useApi();
  const [eventState, setEventState] = useState<EventState | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Fetch event status and trades
    const fetchData = async () => {
      try {
        const [eventRes, tradesRes] = await Promise.all([
          apiFetch('/api/market/event').then(r => r.json()),
          // Fetch unlimited or large limit trades for audit log
          apiFetch('/api/trades?limit=10000').then(r => r.json())
        ]);
        
        if (eventRes.event) setEventState(eventRes.event);
        if (tradesRes.trades) setTrades(tradesRes.trades);
      } catch (err) {
        console.error('Failed to load audit data', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (hasPermission('BULL_RING_SUPERADMIN')) {
      fetchData();
    }
  }, [hasPermission]);

  if (!hasPermission('BULL_RING_SUPERADMIN')) return null;

  const isEnded = eventState?.status === 'ENDED';

  const downloadExcel = () => {
    if (!isEnded) return;

    // Prepare data
    const exportData = trades.map(t => ({
      'Trade Audit Log ID': t.audit_id || `TAL-${t.id}`,
      'Buyer': t.buyer_id,
      'Seller': t.seller_id,
      'Security': t.security_symbol?.toUpperCase(),
      'Price': t.price,
      'Quantity': t.quantity,
      'Total Price': t.total_value,
      'O/S': t.os_status,
      'Timestamp': new Date(t.executed_at).toLocaleString('en-IN'),
      'Entered By': t.entered_by || 'ADMIN',
      'Desk ID': t.desk_id || 'UNKNOWN'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Executed Trade Audit Log');
    
    // Auto-size columns loosely
    const colWidths = [
      { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, 
      { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, 
      { wch: 20 }, { wch: 15 }, { wch: 10 }
    ];
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `Executed_Trade_Audit_Log_${new Date().getTime()}.xlsx`);
  };

  return (
    <div className="admin-container">
      <div className="panel-card">
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Shield size={22} color="#a78bfa" />
            <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>EXECUTED TRADE AUDIT LOG</span>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {!isEnded && (
              <span style={{ fontSize: '0.8rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <AlertCircle size={14} /> Market must be ENDED to download Excel
              </span>
            )}
            <button 
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isEnded ? 1 : 0.5, cursor: isEnded ? 'pointer' : 'not-allowed' }}
              onClick={downloadExcel}
              disabled={!isEnded}
            >
              <Download size={16} /> Download Excel
            </button>
          </div>
        </div>

        <div className="table-container" style={{ padding: '1rem' }}>
          <table className="custom-table font-mono" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)' }}>Timestamp</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)' }}>Audit ID</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)' }}>Buyer</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)' }}>Seller</th>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)' }}>Security</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>Price</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>Qty</th>
                <th style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>Total Value</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)' }}>Desk ID</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading records...</td>
                </tr>
              ) : trades.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No valid trades recorded yet.</td>
                </tr>
              ) : (
                trades.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(t.executed_at).toLocaleString('en-IN')}</td>
                    <td style={{ padding: '0.75rem', fontWeight: 600, color: '#a78bfa' }}>{t.audit_id}</td>
                    <td style={{ padding: '0.75rem', fontWeight: 600, color: '#10b981' }}>{t.buyer_id}</td>
                    <td style={{ padding: '0.75rem', fontWeight: 600, color: '#ef4444' }}>{t.seller_id}</td>
                    <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--color-blue)' }}>{t.security_symbol?.toUpperCase()}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: '#fff' }}>₹{t.price.toFixed(2)}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>{t.quantity.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: '#fff' }}>₹{t.total_value.toLocaleString('en-IN')}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-bright)' }}>{t.desk_id || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
