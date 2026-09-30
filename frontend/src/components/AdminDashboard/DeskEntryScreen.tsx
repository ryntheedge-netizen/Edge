import React, { useState } from 'react';
import { useApi } from '../../hooks/useApi';

export const DeskEntryScreen: React.FC<{ onValidated: (deskId: string, sessionToken: string) => void }> = ({ onValidated }) => {
  const [deskId, setDeskId] = useState('DESK-01');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { apiFetch } = useApi();

  const handleClaim = async () => {
    setLoading(true);
    setError('');
    const token = Math.random().toString(36).substring(2, 15);
    try {
      const res = await apiFetch('/api/desks/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deskId, sessionToken: token })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      onValidated(deskId, token);
    } catch (err: any) {
      setError(err.message || 'Invalid Desk ID or Desk already in use');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '60vh' }}>
      <div className="panel-card" style={{ width: '400px', padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1.5rem', color: '#e2e8f0' }}>Enter Desk ID</h2>
        
        {error && (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '4px', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}
        
        <input 
          type="text" 
          value={deskId} 
          onChange={e => setDeskId(e.target.value)} 
          placeholder="e.g. DESK-01"
          style={{ width: '100%', padding: '0.75rem', marginBottom: '1.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: '#fff', fontSize: '1.1rem', textAlign: 'center', textTransform: 'uppercase' }}
          disabled={loading}
        />
        
        <button 
          className="btn btn-primary" 
          style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
          onClick={handleClaim}
          disabled={loading || !deskId}
        >
          {loading ? 'Validating...' : 'Access Dashboard'}
        </button>
      </div>
    </div>
  );
};
