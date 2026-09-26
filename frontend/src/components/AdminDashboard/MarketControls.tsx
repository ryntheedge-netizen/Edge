import React, { useState } from 'react';
import { EventState, EventStats } from '../../types';
import { Play, Pause, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';

interface MarketControlsProps {
  eventState: EventState | null;
  stats: EventStats;
  onStateUpdate: () => void;
}

export const MarketControls: React.FC<MarketControlsProps> = ({ eventState, stats, onStateUpdate }) => {
  const { token } = useAuth();
  const { apiFetch } = useApi();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const updateStatus = async (status: string) => {
    if (!token) return;
    setLoading(true);
    setError('');

    try {
      const res = await apiFetch('/api/market/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update market status');
      }

      onStateUpdate();
    } catch (err: any) {
      setError(err.message || 'Status change failed');
    } finally {
      setLoading(false);
    }
  };



  if (!eventState) return null;

  return (
    <div className="panel-card" style={{ marginBottom: '1.75rem' }}>
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Activity color="#3b82f6" size={22} />
          <span>MARKET LIFECYCLE CONTROLS</span>
        </div>

        <div className={`status-pill ${eventState.status}`}>
          <span className="status-dot"></span>
          <span>MARKET {eventState.status.replace('_', ' ')}</span>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          {eventState.status === 'NOT_STARTED' && (
            <button className="btn btn-success" onClick={() => updateStatus('LIVE')} disabled={loading}>
              <Play size={16} /> Start Market
            </button>
          )}

          {eventState.status === 'LIVE' && (
            <button className="btn btn-warning" onClick={() => updateStatus('PAUSED')} disabled={loading}>
              <Pause size={16} /> Pause Market
            </button>
          )}

          {eventState.status === 'PAUSED' && (
            <button className="btn btn-success" onClick={() => updateStatus('LIVE')} disabled={loading}>
              <Play size={16} /> Resume Market
            </button>
          )}

          {eventState.status === 'ENDED' && (
            <button className="btn btn-outline" disabled style={{ opacity: 0.7 }}>
              Market Ended
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '2rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          <div>Total Trades: <strong style={{ color: '#ffffff' }}>{stats.total_trades}</strong></div>
          <div>LTP Updates: <strong style={{ color: '#10b981' }}>{stats.total_ltp_changes}</strong></div>
        </div>
      </div>

    </div>
  );
};
