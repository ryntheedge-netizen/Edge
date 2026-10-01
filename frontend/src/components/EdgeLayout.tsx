import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, LogOut, Activity, Settings, QrCode, Briefcase, ChevronLeft, ChevronRight, Coins, Gavel, Scan, Menu, Monitor } from 'lucide-react';
import { DeskSetup } from './BullRing/DeskSetup';

interface EdgeLayoutProps {
  children: React.ReactNode;
  title: string;
}

export const EdgeLayout: React.FC<EdgeLayoutProps> = ({ children, title }) => {
  const { logout, username, hasPermission, token } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth <= 768);
  const [activeDesk, setActiveDesk] = useState<string | null>(sessionStorage.getItem('bull_ring_active_desk'));

  const isBullRingMode = title.includes('Bull Ring');

  const handleLogout = async () => {
    if (activeDesk && token) {
      const sessionToken = sessionStorage.getItem('bull_ring_session_token');
      try {
        await fetch('/api/desks/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ deskId: activeDesk, sessionToken })
        });
      } catch (e) { }
    }
    sessionStorage.removeItem('bull_ring_active_desk');
    sessionStorage.removeItem('bull_ring_session_token');
    logout();
    navigate('/login');
  };

  const handleChangeDesk = async () => {
    if (activeDesk && token) {
      const sessionToken = sessionStorage.getItem('bull_ring_session_token');
      try {
        await fetch('/api/desks/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ deskId: activeDesk, sessionToken })
        });
      } catch (e) { }
    }
    sessionStorage.removeItem('bull_ring_active_desk');
    setActiveDesk(null);
  };

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const showBullRing = hasPermission('BULL_RING_ADMIN') || hasPermission('BULL_RING_SUPERADMIN');
  const showAttendance = hasPermission('ATTENDANCE_ADMIN') || hasPermission('ATTENDANCE_VERIFIER');
  const showBetting = hasPermission('BETTING_ADMIN');
  const showAuction = hasPermission('AUCTION_ADMIN');
  const showSettings = hasPermission('EDGE_SUPERADMIN');

  const sidebarWidth = isCollapsed ? '70px' : '250px';
  
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-dark)' }}>

      <style>
        {`
          .edge-sidebar {
            width: ${sidebarWidth};
            background-color: var(--bg-panel);
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            transition: all 0.3s ease-in-out;
            position: relative;
            z-index: 100;
          }
          
          .mobile-backdrop {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 90;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
          }

          @media (max-width: 768px) {
            .hide-on-mobile {
              display: none !important;
            }
            .mobile-only-menu {
              display: block !important;
            }
            .edge-sidebar {
              position: fixed;
              top: 0;
              bottom: 0;
              left: 0;
              transform: ${isCollapsed ? 'translateX(-100%)' : 'translateX(0)'};
              width: 250px; /* Always full width on mobile when open */
              box-shadow: ${isCollapsed ? 'none' : '4px 0 15px rgba(0,0,0,0.3)'};
            }
            .mobile-backdrop.open {
              display: block;
              opacity: 1;
              pointer-events: auto;
            }
            .sidebar-toggle-btn {
              display: none !important; /* Hide desktop toggle on mobile */
            }
          }
        `}
      </style>

      {/* Mobile Backdrop */}
      <div className={`mobile-backdrop ${!isCollapsed ? 'open' : ''}`} onClick={() => setIsCollapsed(true)} />

      {/* Sidebar */}
      <div className="edge-sidebar">
        {/* Toggle Button */}
        <button 
          className="sidebar-toggle-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            position: 'absolute',
            top: '20px',
            right: '-12px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10
          }}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div style={{ padding: '1.5rem 1rem', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: isCollapsed ? 'center' : 'flex-start' }} onClick={() => navigate('/dashboard')}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: isCollapsed ? '1.25rem' : '1.5rem', fontWeight: 800, color: '#3b82f6', margin: 0, letterSpacing: '2px' }}>
            {isCollapsed ? 'E' : 'EDGE'}
          </h1>
          {!isCollapsed && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0', textTransform: 'uppercase' }}>
              Operations
            </p>
          )}
        </div>

        <nav style={{ flex: 1, padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', overflowX: 'hidden' }}>
          
          <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" isCollapsed={isCollapsed} onClick={() => navigate('/dashboard')} />

          {showBullRing && (
            <>
              <NavHeader label="Bull Ring" isCollapsed={isCollapsed} />
              {hasPermission('BULL_RING_ADMIN') && !hasPermission('BULL_RING_SUPERADMIN') && (
                <NavItem icon={<Activity size={20} />} label="Market Controls" isCollapsed={isCollapsed} onClick={() => navigate('/bull-ring/admin')} />
              )}
              {hasPermission('BULL_RING_SUPERADMIN') && (
                <NavItem icon={<Activity size={20} />} label="Market" isCollapsed={isCollapsed} onClick={() => navigate('/bull-ring/superadmin')} />
              )}
              {hasPermission('BULL_RING_SUPERADMIN') && (
                <NavItem icon={<Settings size={20} />} label="Controls" isCollapsed={isCollapsed} onClick={() => navigate('/bull-ring/superadmin-controls')} />
              )}
              {hasPermission('BULL_RING_SUPERADMIN') && (
                <NavItem icon={<Activity size={20} />} label="Trade Audit Log" isCollapsed={isCollapsed} onClick={() => navigate('/bull-ring/superadmin-audit')} />
              )}
              {(hasPermission('BULL_RING_ADMIN') || hasPermission('BULL_RING_SUPERADMIN')) && (
                <NavItem icon={<Briefcase size={20} />} label="Trader Portfolio" isCollapsed={isCollapsed} onClick={() => navigate('/bull-ring/portfolio')} />
              )}
            </>
          )}

          {showAttendance && (
            <>
              <NavHeader label="Attendance" isCollapsed={isCollapsed} />
              {hasPermission('ATTENDANCE_ADMIN') && (
                <NavItem icon={<QrCode size={20} />} label="Dashboard" isCollapsed={isCollapsed} onClick={() => navigate('/attendance')} />
              )}
              {(hasPermission('ATTENDANCE_ADMIN') || hasPermission('ATTENDANCE_VERIFIER')) && (
                <NavItem icon={<Scan size={20} />} label="Scanning Station" isCollapsed={isCollapsed} onClick={() => navigate('/attendance/scan')} />
              )}
            </>
          )}

          {showBetting && (
            <>
              <NavHeader label="Betting" isCollapsed={isCollapsed} />
              <NavItem icon={<Coins size={20} />} label="Betting Dashboard" isCollapsed={isCollapsed} onClick={() => navigate('/betting')} />
            </>
          )}

          {showAuction && (
            <>
              <NavHeader label="Auction" isCollapsed={isCollapsed} />
              <NavItem icon={<Gavel size={20} />} label="Auction Controls" isCollapsed={isCollapsed} onClick={() => navigate('/auction')} />
            </>
          )}

          {showSettings && (
            <>
              <NavHeader label="Platform" isCollapsed={isCollapsed} />
              <NavItem icon={<Settings size={20} />} label="Global Settings" isCollapsed={isCollapsed} onClick={() => navigate('/settings')} />
            </>
          )}

        </nav>

        <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
          <button 
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start', gap: '0.75rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', borderRadius: '6px', width: '100%', overflow: 'hidden' }}
            title="Logout"
          >
            <LogOut size={20} style={{ minWidth: '20px' }} /> {!isCollapsed && <span>Logout</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <header style={{ padding: '1rem 2rem', backgroundColor: 'var(--bg-panel)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="mobile-only-menu" onClick={() => setIsCollapsed(!isCollapsed)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', display: 'none' }}>
              <Menu size={24} />
            </button>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#fff', fontFamily: 'var(--font-heading)' }}>{title}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {isBullRingMode && activeDesk && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', padding: '0.25rem 0.75rem', borderRadius: '4px' }}>
                <Monitor size={14} color="#f59e0b" />
                <span style={{ color: '#f59e0b', fontSize: '0.85rem', fontWeight: 600 }}>DESK: {activeDesk}</span>
                {hasPermission('BULL_RING_SUPERADMIN') && (
                  <button onClick={handleChangeDesk} style={{ background: 'transparent', border: 'none', color: '#f59e0b', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                    Change
                  </button>
                )}
              </div>
            )}
            {isBullRingMode && (
              <a href="/bull-ring/screener" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3b82f6', textDecoration: 'none', fontSize: '0.85rem', padding: '0.4rem 0.8rem', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px', fontWeight: 500 }}>
                <Activity size={14} /> Public Display
              </a>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem' }}>
              <span className="hide-on-mobile">Logged in as:</span>
              <span style={{ color: 'var(--text-bright)', fontWeight: 600, padding: '0.25rem 0.5rem', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                {username ? username.toUpperCase() : 'ADMIN'}
              </span>
            </div>
          </div>
        </header>
        <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
      <style>
        {`
          @media (max-width: 768px) {
            .hide-on-mobile {
              display: none !important;
            }
            .mobile-only-menu {
              display: block !important;
            }
          }
        `}
      </style>
      {isBullRingMode && !activeDesk && !hasPermission('BULL_RING_SUPERADMIN') && (
        <DeskSetup onComplete={() => setActiveDesk(sessionStorage.getItem('bull_ring_active_desk'))} />
      )}
    </div>
  );
};

const NavHeader: React.FC<{ label: string, isCollapsed: boolean }> = ({ label, isCollapsed }) => {
  if (isCollapsed) return <div style={{ height: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', margin: '0.5rem 1rem' }} title={label} />;
  return (
    <div style={{ padding: '1rem 1rem 0.25rem', fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '0.5rem' }}>
      {label}
    </div>
  );
};

const NavItem: React.FC<{ icon: React.ReactNode, label: string, isCollapsed: boolean, onClick: () => void }> = ({ icon, label, isCollapsed, onClick }) => {
  return (
    <button 
      onClick={onClick}
      title={isCollapsed ? label : undefined}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        gap: '0.75rem', 
        padding: '0.75rem 1rem', 
        margin: '0 0.5rem',
        background: 'transparent', 
        border: 'none', 
        color: 'var(--text-bright)', 
        cursor: 'pointer', 
        borderRadius: '6px', 
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden'
      }}
      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      <div style={{ minWidth: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      {!isCollapsed && <span>{label}</span>}
    </button>
  );
};
