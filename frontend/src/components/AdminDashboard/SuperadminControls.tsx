import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { AlertCircle, RefreshCw, Play, Pause } from 'lucide-react';
import { EventState } from '../../types';

interface SuperadminControlsProps {
  eventState: EventState | null;
  onStateChange: () => void;
}

export const SuperadminControls: React.FC<SuperadminControlsProps> = ({ eventState, onStateChange }) => {
  const { token, hasPermission } = useAuth();
  const { apiFetch } = useApi();
  const [corpus, setCorpus] = useState(eventState?.starting_trader_corpus?.toString() || '2000000');
  const [numTraders, setNumTraders] = useState('20');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!hasPermission('BULL_RING_SUPERADMIN')) return null;

  const handleUpdateConfig = async () => {
    if (!token) return;
    const parsedCorpus = parseFloat(corpus);
    const parsedNumTraders = parseInt(numTraders);

    if (isNaN(parsedCorpus) || parsedCorpus < 0) {
      setFeedback({ type: 'error', message: 'Invalid corpus amount' });
      return;
    }
    
    if (isNaN(parsedNumTraders) || parsedNumTraders < 0) {
      setFeedback({ type: 'error', message: 'Invalid number of traders' });
      return;
    }

    if (!window.confirm(`Are you sure you want to initialize/update ${parsedNumTraders} traders with starting corpus ₹${parsedCorpus}?`)) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/market/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startingCorpus: parsedCorpus, numberOfTraders: parsedNumTraders }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setFeedback({ type: 'success', message: 'Configuration updated and traders initialized' });
      onStateChange();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetMarket = async () => {
    if (!window.confirm('CRITICAL WARNING: Are you sure you want to RESET the entire event? All trades, wallets, and holdings will be wiped out!')) return;
    
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/market/reset', {
        method: 'POST',
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setFeedback({ type: 'success', message: 'Market Reset Successfully' });
      onStateChange();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (status: string) => {
    if (!token) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/api/market/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setFeedback({ type: 'success', message: `Market status updated to ${status}` });
      onStateChange();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Status change failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndMarket = async () => {
    if (!window.confirm('Are you sure you want to end the market? This will stop further market operations.')) return;
    await updateStatus('ENDED');
  };

  if (!eventState) return null;

  const isLive = eventState.status === 'LIVE';

  return (
    <div className="panel-card">
      <div className="panel-header" style={{ color: '#ef4444' }}>
        <AlertCircle size={18} />
        <span style={{ fontWeight: 'bold' }}>SYSTEM CONFIGURATION</span>
      </div>

      {feedback && (
        <div style={{ backgroundColor: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: feedback.type === 'success' ? '#10b981' : '#ef4444', padding: '0.75rem', borderRadius: '6px', margin: '1rem', fontSize: '0.85rem', border: `1px solid ${feedback.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` }}>
          {feedback.message}
        </div>
      )}

      {/* MARKET LIFECYCLE SECTION */}
      <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '1rem' }}>
          MARKET LIFECYCLE
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-success" 
            onClick={() => updateStatus('LIVE')} 
            disabled={submitting || eventState.status !== 'NOT_STARTED'}
          >
            <Play size={16} /> Start Market
          </button>
          
          <button 
            className="btn btn-warning" 
            onClick={() => updateStatus(eventState.status === 'PAUSED' ? 'LIVE' : 'PAUSED')} 
            disabled={submitting || (eventState.status !== 'LIVE' && eventState.status !== 'PAUSED')}
          >
            {eventState.status === 'PAUSED' ? <><Play size={16} /> Resume</> : <><Pause size={16} /> Pause</>}
          </button>

          <button className="btn" style={{ backgroundColor: '#dc2626', color: 'white' }} onClick={handleEndMarket} disabled={submitting || eventState.status === 'ENDED'}>
            End Market
          </button>
          <button className="btn" style={{ backgroundColor: '#7f1d1d', color: 'white' }} onClick={handleResetMarket} disabled={submitting || isLive}>
            <RefreshCw size={14} /> Reset Event
          </button>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
          <strong>END MARKET:</strong> Permanently end the current market session. <br/>
          <strong>RESET EVENT:</strong> Wipes out all trades, holdings, and jobber inventories (must NOT be LIVE).
        </div>
      </div>

      {/* TRADER CONFIGURATION SECTION */}
      <div style={{ padding: '1.25rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '1rem' }}>
          TRADER CONFIGURATION
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '150px' }}>
            <label className="form-label">Starting Trader Corpus</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>₹</span>
              <input
                type="number"
                className="form-input"
                style={{ paddingLeft: '1.5rem', width: '100%' }}
                value={corpus}
                onChange={(e) => setCorpus(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '150px' }}>
            <label className="form-label">Number of Traders</label>
            <input
              type="number"
              className="form-input"
              style={{ width: '100%' }}
              value={numTraders}
              onChange={(e) => setNumTraders(e.target.value)}
              disabled={submitting}
            />
          </div>

          <button className="btn btn-primary" onClick={handleUpdateConfig} disabled={submitting} style={{ height: '40px' }}>
            Update
          </button>
        </div>
      </div>
    </div>
  );
};
