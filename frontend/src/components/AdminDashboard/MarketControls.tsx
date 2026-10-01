import React from 'react';
import { EventState, EventStats } from '../../types';
import { Activity } from 'lucide-react';

interface MarketControlsProps {
  eventState: EventState | null;
  stats: EventStats;
  onStateUpdate?: () => void;
}

export const MarketControls: React.FC<MarketControlsProps> = ({ eventState, stats }) => {
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <em>Market lifecycle controls are managed by Superadmin.</em>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '2rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          <div>Total Trades: <strong style={{ color: '#ffffff' }}>{stats.total_trades}</strong></div>
          <div>LTP Updates: <strong style={{ color: '#10b981' }}>{stats.total_ltp_changes}</strong></div>
        </div>
      </div>

    </div>
  );
};
