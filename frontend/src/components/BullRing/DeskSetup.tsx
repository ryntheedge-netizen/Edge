import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AlertCircle, Monitor } from 'lucide-react';

interface Desk {
  desk_id: string;
  status: string;
  session_token: string | null;
}

export const DeskSetup: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { token, hasPermission } = useAuth();
  const [desks, setDesks] = useState<Desk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualDeskId, setManualDeskId] = useState('');

  const fetchDesks = async () => {
    try {
      const res = await fetch('/api/desks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch desks');
      const data = await res.json();
      setDesks(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDesks();
  }, []);

  const claimDesk = async (deskId: string) => {
    setError(null);
    let sessionToken = sessionStorage.getItem('bull_ring_session_token');
    if (!sessionToken) {
      sessionToken = crypto.randomUUID();
      sessionStorage.setItem('bull_ring_session_token', sessionToken);
    }

    try {
      const res = await fetch('/api/desks/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ deskId, sessionToken })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to claim desk');
      }
      
      sessionStorage.setItem('bull_ring_active_desk', deskId);
      onComplete();
    } catch (err: any) {
      setError(err.message);
      fetchDesks(); // refresh desk status
    }
  };

  const overrideDesk = async (deskId: string) => {
    try {
      const res = await fetch('/api/desks/override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ deskId })
      });
      if (res.ok) {
        claimDesk(deskId);
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Override failed');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'var(--bg-dark)', zIndex: 1000,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '2rem'
    }}>
      <div style={{
        maxWidth: '600px', width: '100%',
        backgroundColor: 'var(--bg-panel)',
        borderRadius: '12px', padding: '2rem',
        border: '1px solid var(--border-color)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', color: '#fff', marginTop: 0, textAlign: 'center', marginBottom: '0.5rem' }}>
          Bull Ring Station Setup
        </h2>
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '2rem' }}>
          Please select your physical verification desk below.
        </p>

        {error && (
          <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#ef4444', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} />
            <span style={{ flex: 1 }}>{error}</span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading desks...</div>
        ) : hasPermission('BULL_RING_SUPERADMIN') ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
            {desks.map(desk => {
              const isActive = desk.status === 'ACTIVE';
              return (
                <div key={desk.desk_id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button
                    onClick={() => !isActive && claimDesk(desk.desk_id)}
                    style={{
                      padding: '1.5rem 1rem',
                      borderRadius: '8px',
                      border: `2px solid ${isActive ? 'rgba(239, 68, 68, 0.3)' : '#3b82f6'}`,
                      backgroundColor: isActive ? 'rgba(239, 68, 68, 0.05)' : 'rgba(59, 130, 246, 0.05)',
                      color: isActive ? '#ef4444' : '#fff',
                      cursor: isActive ? 'not-allowed' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                      transition: 'all 0.2s',
                      opacity: isActive ? 0.7 : 1
                    }}
                    onMouseOver={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                    }}
                    onMouseOut={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.05)';
                    }}
                  >
                    <Monitor size={32} />
                    <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{desk.desk_id}</span>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      {isActive ? 'In Use' : 'Available'}
                    </span>
                  </button>
                  {isActive && (
                    <button
                      onClick={() => overrideDesk(desk.desk_id)}
                      style={{
                        padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                        border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem'
                      }}
                    >
                      Override
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: '300px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 'bold', textAlign: 'center' }}>
                DESK ID
              </label>
              <input 
                type="text" 
                value={manualDeskId} 
                onChange={e => setManualDeskId(e.target.value.toUpperCase())}
                placeholder="e.g. D01"
                style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: '#fff', fontSize: '1.1rem', fontFamily: 'var(--font-mono)', textAlign: 'center' }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (!manualDeskId.trim()) {
                      setError('Please enter a Desk ID');
                      return;
                    }
                    claimDesk(manualDeskId.trim());
                  }
                }}
              />
            </div>
            <button 
              onClick={() => {
                if (!manualDeskId.trim()) {
                  setError('Please enter a Desk ID');
                  return;
                }
                claimDesk(manualDeskId.trim());
              }}
              style={{ width: '100%', maxWidth: '300px', padding: '0.75rem 2rem', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
