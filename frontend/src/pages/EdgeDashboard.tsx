import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Activity, QrCode, Gavel, Coins, LogIn, User, LogOut } from 'lucide-react';

export const EdgeDashboardPage: React.FC = () => {
  const { isAuthenticated, username, hasPermission, logout } = useAuth();

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const modules = [
    {
      id: 'bull-ring',
      name: 'Bull Ring',
      description: 'Live simulated market trading and auditing. Manage traders, orders, and market controls.',
      icon: <Activity size={32} color="#3b82f6" />,
      active: true,
      path: isAuthenticated && (hasPermission('BULL_RING_ADMIN') || hasPermission('BULL_RING_SUPERADMIN')) ? '/bull-ring/admin' : '/bull-ring/screener',
      visible: true // Always visible (public screener)
    },
    {
      id: 'registration',
      name: 'Attendance',
      description: 'Participant registration, check-ins, and attendance tracking.',
      icon: <QrCode size={32} color="#10b981" />,
      active: true,
      path: '/attendance',
      visible: hasPermission('ATTENDANCE_ADMIN') || hasPermission('ATTENDANCE_VERIFIER')
    },
    {
      id: 'auction',
      name: 'Auction Round',
      description: 'Manage team auctions and bidding operations.',
      icon: <Gavel size={32} color="#8b5cf6" />,
      active: true,
      path: '/auction',
      visible: hasPermission('AUCTION_ADMIN')
    },
    {
      id: 'betting',
      name: 'Betting & Scoring',
      description: 'Score calculations, betting odds, and final payouts.',
      icon: <Coins size={32} color="#f59e0b" />,
      active: true,
      path: '/betting',
      visible: hasPermission('BETTING_ADMIN')
    }
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-dark)' }}>
      {/* Header */}
      <header style={{ padding: '1rem 2rem', backgroundColor: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, color: '#3b82f6', margin: 0, letterSpacing: '2px' }}>
            EDGE
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0', textTransform: 'uppercase' }}>
            Platform Dashboard
          </p>
        </div>
        <div>
          {isAuthenticated ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-bright)', backgroundColor: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.9rem' }}>
                <User size={16} />
                <span>{username || 'Admin'}</span>
              </div>
              <button 
                onClick={() => logout()}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', borderRadius: '20px' }}
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          ) : (
            <button 
              onClick={() => navigate('/login')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1.5rem', background: '#3b82f6', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '20px', fontWeight: 600 }}
            >
              <LogIn size={16} /> Login
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div style={{ maxWidth: '1000px', margin: '3rem auto', padding: '0 1.5rem' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <h3 style={{ color: 'var(--text-bright)', fontFamily: 'var(--font-heading)', margin: '0 0 0.5rem 0', fontSize: '1.8rem' }}>Welcome to EDGE</h3>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '1.1rem' }}>
            {isAuthenticated ? 'Select a module below to begin operations.' : 'Select a public module, or login for administrative access.'}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {modules.filter(m => m.visible).map((mod) => (
            <div 
              key={mod.id}
              onClick={() => mod.active && navigate(mod.path)}
              style={{
                backgroundColor: 'var(--bg-panel)',
                border: `1px solid ${mod.active ? 'var(--border-bright)' : 'var(--border-color)'}`,
                borderRadius: '12px',
                padding: '2rem',
                cursor: mod.active ? 'pointer' : 'not-allowed',
                opacity: mod.active ? 1 : 0.6,
                transition: 'all 0.3s ease',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseOver={(e) => {
                if (mod.active) {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 15px 30px -5px rgba(0, 0, 0, 0.4)';
                  e.currentTarget.style.borderColor = '#3b82f6';
                }
              }}
              onMouseOut={(e) => {
                if (mod.active) {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'var(--border-bright)';
                }
              }}
            >
              {!mod.active && (
                <div style={{ position: 'absolute', top: '1rem', right: '1rem', fontSize: '0.7rem', padding: '0.3rem 0.6rem', backgroundColor: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)', borderRadius: '6px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Coming Soon
                </div>
              )}
              
              <div style={{ marginBottom: '1.5rem', display: 'inline-block', padding: '1rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '16px' }}>
                {mod.icon}
              </div>
              
              <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-bright)', fontSize: '1.4rem', fontFamily: 'var(--font-heading)' }}>{mod.name}</h4>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.6 }}>
                {mod.description}
              </p>
            </div>
          ))}

          {modules.filter(m => m.visible).length === 0 && (
             <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', backgroundColor: 'var(--bg-panel)', borderRadius: '12px', color: 'var(--text-muted)' }}>
               No modules available for your access level.
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
