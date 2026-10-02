import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, User } from 'lucide-react';

interface LoginPageProps {
  title?: string;
  expectedRole?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({ title = 'ORGANIZER LOGIN', expectedRole }) => {
  const { login } = useAuth();
  const [username, setUsername] = useState<string>(expectedRole || '');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(password, username || undefined);
    if (!result.success) {
      setError(result.message || 'Invalid credentials.');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-dark)', padding: '1rem' }}>
      <div className="panel-card" style={{ maxWidth: '420px', width: '100%', border: '1px solid var(--border-bright)' }}>
        <div style={{ textTransform: 'center', textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ display: 'inline-flex', padding: '0.85rem', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', marginBottom: '0.85rem' }}>
            <Shield size={36} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>{title}</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
            Enter credentials to access platform controls
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Username (Optional)</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <div style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }}><User size={16} /></div>
              <input
                type="text"
                className="form-input"
                placeholder="Enter username (e.g. edge_superadmin)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <div style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }}><Lock size={16} /></div>
              <input
                type="password"
                className="form-input"
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Authenticating...' : 'Secure Login'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
          Restricted System Access. All activities are monitored.
        </div>
      </div>
    </div>
  );
};
