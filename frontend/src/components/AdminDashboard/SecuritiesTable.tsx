import React, { useState } from 'react';
import { Security } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';

interface SecuritiesTableProps {
  securities: Security[];
}

export const SecuritiesTable: React.FC<SecuritiesTableProps> = ({ securities }) => {
  const { hasPermission } = useAuth();
  const { apiFetch } = useApi();
  const isSuperadmin = hasPermission('BULL_RING_SUPERADMIN');

  const [selectedSecurity, setSelectedSecurity] = useState<Security | null>(null);
  const [newLtp, setNewLtp] = useState<string>('');
  const [newsLabel, setNewsLabel] = useState<string>('');
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsSuccess, setNewsSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleNewsUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSecurity || !newLtp) return;

    const val = parseFloat(newLtp);
    if (isNaN(val) || val <= 0) {
      setNewsError('Please enter a valid LTP');
      return;
    }

    setSubmitting(true);
    setNewsError(null);
    setNewsSuccess(null);

    try {
      const res = await apiFetch('/api/market/news-ltp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          securityId: selectedSecurity.id,
          newLtp: val,
          newsLabel
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update LTP');

      setNewsSuccess(`Successfully updated ${selectedSecurity.symbol} LTP to ₹${val}`);
      setTimeout(() => {
        setSelectedSecurity(null);
        setNewLtp('');
        setNewsLabel('');
        setNewsSuccess(null);
      }, 2000);
    } catch (err: any) {
      setNewsError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getCircuitStatus = (current: number, lc: number, uc: number) => {
    const isAtLower = current <= lc;
    const isAtUpper = current >= uc;
    const isNearLower = current > lc && current <= lc * 1.02;
    const isNearUpper = current < uc && current >= uc * 0.98;
    
    if (isAtLower || isAtUpper) return '#ef4444'; // Red
    if (isNearLower || isNearUpper) return '#f59e0b'; // Orange
    return '#ffffff'; // White default
  };

  return (
    <>
      <div className="panel-card" style={{ marginBottom: '1.75rem' }}>
        <div className="panel-header">
          <span>SECURITY THRESHOLD MONITOR</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <input
              type="text"
              placeholder="Search securities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-panel)',
                color: '#fff',
                fontSize: '0.85rem'
              }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Default Threshold: ₹1,00,000 per cycle
            </span>
          </div>
        </div>

        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Security</th>
                <th style={{ textAlign: 'right' }}>Opening Price</th>
                <th style={{ textAlign: 'right' }}>Current LTP</th>
                <th style={{ textAlign: 'right' }}>Lower Circuit</th>
                <th style={{ textAlign: 'right' }}>Upper Circuit</th>
                <th>Threshold Progress (₹1,00,000)</th>
                <th style={{ textAlign: 'right' }}>Remaining</th>
                {isSuperadmin && <th style={{ textAlign: 'center' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {securities.filter(sec => 
                sec.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
                sec.name.toLowerCase().includes(searchQuery.toLowerCase())
              ).map((sec) => {
                const absChange = sec.absolute_change || 0;
                const pctChange = sec.percentage_change || 0;
                const isUp = absChange > 0;
                const isDown = absChange < 0;
                const progressPct = sec.threshold_progress_pct || 0;

                const lc = sec.lower_circuit;
                const uc = sec.upper_circuit;
                const ltpColor = getCircuitStatus(sec.current_ltp, lc, uc);

                return (
                  <tr key={sec.id}>
                    <td>
                      <strong style={{ color: '#ffffff', textTransform: 'uppercase' }}>{sec.symbol}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sec.name}</div>
                      <div style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                        <span className={`movement-badge ${isUp ? 'up' : isDown ? 'down' : 'neutral'}`} style={{ padding: '0.1rem 0.3rem' }}>
                          {isUp ? '▲' : isDown ? '▼' : '—'} {isUp ? `+${pctChange}%` : `${pctChange}%`}
                        </span>
                      </div>
                    </td>

                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      ₹{sec.initial_ltp.toFixed(2)}
                    </td>

                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: ltpColor }}>
                      ₹{sec.current_ltp.toFixed(2)}
                    </td>

                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#ef4444' }}>
                      ₹{lc.toFixed(2)}
                    </td>

                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#10b981' }}>
                      ₹{uc.toFixed(2)}
                    </td>

                    <td style={{ minWidth: '150px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                        <span>₹{(sec.accumulated_trade_value || 0).toLocaleString('en-IN')}</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="progress-bar-bg">
                        <div className="progress-bar-fill" style={{ width: `${progressPct}%` }}></div>
                      </div>
                    </td>

                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      ₹{(sec.remaining_threshold || 0).toLocaleString('en-IN')}
                    </td>

                    {isSuperadmin && (
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          className="btn" 
                          style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid #3b82f6' }}
                          onClick={() => {
                            setSelectedSecurity(sec);
                            setNewLtp(sec.current_ltp.toString());
                          }}
                        >
                          NEWS UPDATE
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isSuperadmin && selectedSecurity && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="panel-card" style={{ width: '400px', backgroundColor: 'var(--bg-dark)' }}>
            <div className="panel-header" style={{ justifyContent: 'space-between' }}>
              <span>MARKET NEWS / LTP ADJUSTMENT</span>
              <button onClick={() => setSelectedSecurity(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
            </div>
            <form onSubmit={handleNewsUpdate} style={{ padding: '1rem' }}>
              
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Security:</span>
                <strong style={{ color: '#60a5fa' }}>{selectedSecurity.symbol}</strong>
              </div>
              
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Current LTP:</span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{selectedSecurity.current_ltp.toFixed(2)}</strong>
              </div>

              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#ef4444' }}>LC: ₹{selectedSecurity.lower_circuit.toFixed(2)}</span>
                <span style={{ color: '#10b981' }}>UC: ₹{selectedSecurity.upper_circuit.toFixed(2)}</span>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>New LTP:</label>
                <input 
                  type="number" 
                  className="input-field" 
                  value={newLtp}
                  onChange={(e) => setNewLtp(e.target.value)}
                  step="0.01"
                  required
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>News / Event Label (Optional):</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={newsLabel}
                  onChange={(e) => setNewsLabel(e.target.value)}
                  placeholder="e.g. Positive earnings announcement"
                />
              </div>

              {newsError && (
                <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.85rem', padding: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
                  {newsError}
                </div>
              )}
              {newsSuccess && (
                <div style={{ color: '#10b981', marginBottom: '1rem', fontSize: '0.85rem', padding: '0.5rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '4px' }}>
                  {newsSuccess}
                </div>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
                {submitting ? 'APPLYING...' : 'APPLY LTP CHANGE'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
