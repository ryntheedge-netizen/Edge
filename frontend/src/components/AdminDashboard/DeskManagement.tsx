import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Monitor, Unlock } from 'lucide-react';

interface Desk {
  desk_id: string;
  status: string;
  session_token: string | null;
}

export const DeskManagement: React.FC<{ refreshTrigger: number }> = ({ refreshTrigger }) => {
  const { token, hasPermission } = useAuth();
  const [desks, setDesks] = useState<Desk[]>([]);

  const fetchDesks = async () => {
    try {
      const res = await fetch('/api/desks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDesks(data);
      }
    } catch (e) {
      console.error('Failed to load desk status', e);
    }
  };

  useEffect(() => {
    fetchDesks();
  }, [refreshTrigger]);

  const overrideDesk = async (deskId: string) => {
    if (!window.confirm(`Are you sure you want to FORCE RELEASE desk ${deskId}? If someone is using it, they will lose their session.`)) {
      return;
    }
    try {
      const res = await fetch('/api/desks/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deskId })
      });
      if (res.ok) {
        fetchDesks();
      }
    } catch (e) {
      alert('Failed to override desk');
    }
  };

  if (!hasPermission('BULL_RING_SUPERADMIN')) return null;

  return (
    <div className="panel-card" style={{ marginTop: '1.5rem' }}>
      <div className="panel-header">
        <span>ACTIVE BULL RING DESKS</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' }}>
        {desks.map(desk => (
          <div key={desk.desk_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: 'var(--bg-dark)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Monitor size={16} color={desk.status === 'ACTIVE' ? '#10b981' : '#64748b'} />
              <span style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{desk.desk_id}</span>
              <span style={{ fontSize: '0.75rem', color: desk.status === 'ACTIVE' ? '#10b981' : '#64748b', backgroundColor: desk.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(100, 116, 139, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                {desk.status === 'ACTIVE' ? 'Active' : 'Available'}
              </span>
            </div>
            {desk.status === 'ACTIVE' && (
              <button
                onClick={() => overrideDesk(desk.desk_id)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                title="Force Release"
              >
                <Unlock size={12} /> Release
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
