import React, { useEffect, useState } from 'react';
import { Security, Trade } from '../../types';
import { Filter, Zap } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useApi } from '../../hooks/useApi';

interface TradeHistoryTableProps {
  securities: Security[];
  refreshTrigger: number;
}

export const TradeHistoryTable: React.FC<TradeHistoryTableProps> = ({ securities, refreshTrigger }) => {
  const { socket } = useSocket();
  const { apiFetch } = useApi();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [filterSecurity, setFilterSecurity] = useState<string>('');
  const [filterTrader, setFilterTrader] = useState<string>('');
  const [filterAuditId, setFilterAuditId] = useState<string>('');
  const [filterOs, setFilterOs] = useState<string>('');

  const fetchTrades = () => {
    let url = '/api/trades?limit=100';
    if (filterSecurity) url += `&securityId=${filterSecurity}`;
    if (filterTrader) url += `&traderId=${encodeURIComponent(filterTrader)}`;
    if (filterAuditId) url += `&auditId=${encodeURIComponent(filterAuditId)}`;
    if (filterOs) url += `&osStatus=${encodeURIComponent(filterOs)}`;

    apiFetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.trades) {
          setTrades(data.trades);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load trade history:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTrades();
  }, [filterSecurity, filterTrader, filterAuditId, filterOs, refreshTrigger]);

  useEffect(() => {
    if (!socket) return;

    const handleTradeExecuted = () => {
      fetchTrades();
    };

    const handleReset = () => {
      setTrades([]);
    };

    socket.on('TRADE_EXECUTED', handleTradeExecuted);
    socket.on('EVENT_RESET', handleReset);

    return () => {
      socket.off('TRADE_EXECUTED', handleTradeExecuted);
      socket.off('EVENT_RESET', handleReset);
    };
  }, [socket, filterSecurity, filterTrader, filterAuditId, filterOs]);

  return (
    <div className="panel-card">
      <div className="panel-header">
        <span>EXECUTED TRADE AUDIT LOG</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Total Logged: {trades.length}
        </span>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem', padding: '0.75rem', backgroundColor: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--border-color)', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
          <Filter size={14} /> FILTER BY:
        </div>

        <input
          type="text"
          placeholder="Search Buyer/Seller..."
          className="form-input font-mono"
          style={{ width: '170px', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
          value={filterTrader}
          onChange={(e) => setFilterTrader(e.target.value)}
        />

        <input
          type="text"
          placeholder="Search Audit ID..."
          className="form-input font-mono"
          style={{ width: '150px', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
          value={filterAuditId}
          onChange={(e) => setFilterAuditId(e.target.value)}
        />

        <select
          className="form-select font-mono"
          style={{ width: '140px', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
          value={filterSecurity}
          onChange={(e) => setFilterSecurity(e.target.value)}
        >
          <option value="">All Securities</option>
          {securities.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.symbol}
            </option>
          ))}
        </select>

        {/* Side filter removed as Trades now use buyer/seller */}

        <select
          className="form-select font-mono"
          style={{ width: '130px', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
          value={filterOs}
          onChange={(e) => setFilterOs(e.target.value)}
        >
          <option value="">All O/S Status</option>
          <option value="OPEN">OPEN</option>
          <option value="SQUARE OFF">SQUARE OFF</option>
        </select>

        {(filterTrader || filterAuditId || filterSecurity || filterOs) && (
          <button
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
            onClick={() => {
              setFilterTrader('');
              setFilterAuditId('');
              setFilterSecurity('');
              setFilterOs('');
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Trade Audit Table */}
      <div className="table-container">
        <table className="custom-table font-mono">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Trade Audit Log ID</th>
              <th>Buyer</th>
              <th>Seller</th>
              <th>Security</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th style={{ textAlign: 'right' }}>Quantity</th>
              <th style={{ textAlign: 'right' }}>Total Value</th>
              <th>O/S</th>
              <th style={{ textAlign: 'center' }}>LTP Trigger</th>
              <th style={{ textAlign: 'right' }}>LTP Transition</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                  Loading trade history...
                </td>
              </tr>
            ) : trades.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                  No executed trades found matching filters.
                </td>
              </tr>
            ) : (
              trades.map((t) => {
                const timeStr = new Date(t.executed_at).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });
                const isTriggered = t.triggered_ltp_update === 1;

                return (
                  <tr key={t.id} style={{ backgroundColor: isTriggered ? 'rgba(16, 185, 129, 0.05)' : undefined }}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{timeStr}</td>
                    <td style={{ fontWeight: 700, color: '#a78bfa' }}>{t.audit_id}</td>
                    <td style={{ fontWeight: 700, color: '#10b981' }}>{t.buyer_id}</td>
                    <td style={{ fontWeight: 700, color: '#ef4444' }}>{t.seller_id}</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-blue)', textTransform: 'uppercase' }}>
                      {t.security_symbol}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#ffffff' }}>₹{t.price.toFixed(2)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{t.quantity.toLocaleString('en-IN')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#ffffff' }}>₹{(t.total_value || 0).toLocaleString('en-IN')}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.os_status}</td>
                    <td style={{ textAlign: 'center' }}>
                      {isTriggered ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                          <Zap size={12} /> LTP UPDATED
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                      {isTriggered && t.previous_ltp !== null && t.new_ltp !== null ? (
                        <span style={{ color: '#10b981', fontWeight: 700 }}>
                          ₹{t.previous_ltp.toFixed(2)} → ₹{t.new_ltp.toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
