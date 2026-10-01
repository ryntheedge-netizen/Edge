import React, { useState, useEffect } from 'react';
import { SocketProvider } from './context/SocketContext';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PublicScreen } from './pages/PublicScreen';
import { LoginPage } from './pages/LoginPage';
import { EdgeLayout } from './components/EdgeLayout';

// Lazy loaded pages for performance code-splitting
const AdminDashboardPage = React.lazy(() => import('./pages/AdminDashboard').then(module => ({ default: module.AdminDashboardPage })));
const SuperadminDashboardPage = React.lazy(() => import('./pages/SuperadminDashboard').then(module => ({ default: module.SuperadminDashboardPage })));
const EdgeDashboardPage = React.lazy(() => import('./pages/EdgeDashboard').then(module => ({ default: module.EdgeDashboardPage })));
const TraderPortfolioPage = React.lazy(() => import('./pages/TraderPortfolioPage').then(module => ({ default: module.TraderPortfolioPage })));
const AttendanceDashboardPage = React.lazy(() => import('./pages/AttendanceDashboard').then(module => ({ default: module.AttendanceDashboardPage })));
const AttendanceScannerPage = React.lazy(() => import('./pages/AttendanceScanner').then(module => ({ default: module.AttendanceScannerPage })));
const QRBookPage = React.lazy(() => import('./pages/QRBook').then(module => ({ default: module.QRBookPage })));
const AttendanceAuditLogPage = React.lazy(() => import('./pages/AttendanceAuditLog').then(module => ({ default: module.AttendanceAuditLogPage })));
const SuperadminMarketPage = React.lazy(() => import('./pages/SuperadminMarketPage').then(module => ({ default: module.SuperadminMarketPage })));
const SuperadminAuditLogsPage = React.lazy(() => import('./pages/SuperadminAuditLogsPage').then(module => ({ default: module.SuperadminAuditLogsPage })));
const QueueManagerPage = React.lazy(() => import('./pages/QueueManagerPage').then(module => ({ default: module.QueueManagerPage })));
const QueueViewerPage = React.lazy(() => import('./pages/QueueViewerPage').then(module => ({ default: module.QueueViewerPage })));

const MainApp: React.FC = () => {
  const { isAuthenticated, hasPermission } = useAuth();
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (currentPath === '/') {
    window.history.replaceState(null, '', '/dashboard');
    setCurrentPath('/dashboard');
    return null;
  }

  if (currentPath === '/login' || currentPath === '/dashboard') {
    if (isAuthenticated) {
      if (hasPermission('EDGE_SUPERADMIN') || hasPermission('BULL_RING_SUPERADMIN') || hasPermission('BULL_RING_ADMIN')) {
        return <EdgeDashboardPage />;
      }
      if (hasPermission('ATTENDANCE_ADMIN')) {
        window.history.replaceState(null, '', '/attendance');
        setCurrentPath('/attendance');
        return null;
      }
      if (hasPermission('ATTENDANCE_VERIFIER')) {
        window.history.replaceState(null, '', '/attendance/scanner');
        setCurrentPath('/attendance/scanner');
        return null;
      }
      return <EdgeDashboardPage />;
    }
    return <LoginPage title="EDGE PLATFORM LOGIN" />;
  }

  // Attendance Module Routes
  if (currentPath === '/attendance') {
    if (hasPermission('ATTENDANCE_ADMIN')) {
      return <AttendanceDashboardPage />;
    }
    return <LoginPage title="ATTENDANCE ADMIN LOGIN" expectedRole="att_admin" />;
  }

  if (currentPath === '/attendance/scanner') {
    if (hasPermission('ATTENDANCE_VERIFIER')) {
      return <AttendanceScannerPage />;
    }
    return <LoginPage title="SCANNER LOGIN" expectedRole="att_scanner" />;
  }

  if (currentPath === '/attendance/qr-book') {
    if (hasPermission('ATTENDANCE_ADMIN')) {
      return <QRBookPage />;
    }
    return <LoginPage title="ATTENDANCE ADMIN LOGIN" expectedRole="att_admin" />;
  }

  if (currentPath === '/attendance/audit') {
    if (hasPermission('ATTENDANCE_ADMIN')) {
      return <AttendanceAuditLogPage />;
    }
    return <LoginPage title="ATTENDANCE ADMIN LOGIN" expectedRole="att_admin" />;
  }

  // Bull Ring Admin Routes
  if (currentPath === '/admin' || currentPath === '/bull-ring/admin') {
    if (hasPermission('BULL_RING_ADMIN')) {
      return (
        <EdgeLayout title="Bull Ring Organizer">
          <AdminDashboardPage />
        </EdgeLayout>
      );
    }
    return <LoginPage title="ORGANIZER LOGIN" expectedRole="admin" />;
  }

  if (currentPath === '/superadmin' || currentPath === '/bull-ring/superadmin') {
    if (hasPermission('BULL_RING_SUPERADMIN')) {
      return (
        <EdgeLayout title="Bull Ring Market">
          <SuperadminMarketPage />
        </EdgeLayout>
      );
    }
    return <LoginPage title="SUPERADMIN LOGIN" expectedRole="superadmin" />;
  }

  if (currentPath === '/bull-ring/superadmin-controls') {
    if (hasPermission('BULL_RING_SUPERADMIN')) {
      return (
        <EdgeLayout title="Bull Ring Controls">
          <SuperadminDashboardPage />
        </EdgeLayout>
      );
    }
    return <LoginPage title="SUPERADMIN LOGIN" expectedRole="superadmin" />;
  }

  if (currentPath === '/bull-ring/superadmin-audit') {
    if (hasPermission('BULL_RING_SUPERADMIN')) {
      return (
        <EdgeLayout title="Trade Audit Log">
          <SuperadminAuditLogsPage />
        </EdgeLayout>
      );
    }
    return <LoginPage title="SUPERADMIN LOGIN" expectedRole="superadmin" />;
  }

  if (currentPath === '/bull-ring/portfolio') {
    if (hasPermission('BULL_RING_ADMIN') || hasPermission('BULL_RING_SUPERADMIN')) {
      return (
        <EdgeLayout title="Trader Portfolio">
          <TraderPortfolioPage />
        </EdgeLayout>
      );
    }
    return <LoginPage title="PORTFOLIO LOGIN" expectedRole="admin" />;
  }

  // Queue System Routes
  if (currentPath === '/queue/admin') {
    if (hasPermission('BULL_RING_ADMIN') || hasPermission('BULL_RING_SUPERADMIN')) {
      return (
        <EdgeLayout title="Queue Manager">
          <QueueManagerPage />
        </EdgeLayout>
      );
    }
    return <LoginPage title="QUEUE ADMIN LOGIN" expectedRole="admin" />;
  }

  if (currentPath === '/queue/viewer' || currentPath === '/queue') {
    return <QueueViewerPage />;
  }

  // Other specific modules placeholders
  if (currentPath === '/betting' || currentPath === '/betting/admin') {
    if (hasPermission('BETTING_ADMIN')) {
      return <EdgeLayout title="Betting Admin"><div style={{padding: '2rem'}}>Betting Module (Coming Soon)</div></EdgeLayout>;
    }
    return <LoginPage title="BETTING ADMIN LOGIN" expectedRole="betting_admin" />;
  }

  if (currentPath === '/auction' || currentPath === '/auction/admin') {
    if (hasPermission('AUCTION_ADMIN')) {
      return <EdgeLayout title="Auction Admin"><div style={{padding: '2rem'}}>Auction Module (Coming Soon)</div></EdgeLayout>;
    }
    return <LoginPage title="AUCTION ADMIN LOGIN" expectedRole="auction_admin" />;
  }

  // Public Screener - Accessible to public without login, but can be viewed by anyone who visits /bull-ring/screener
  if (currentPath === '/bull-ring' || currentPath === '/bull-ring/screener') {
    return <PublicScreen />;
  }

  // Fallback to Public Screener for unknown paths
  return <PublicScreen />;
};

export function App() {
  return (
    <SocketProvider>
      <ToastProvider>
        <AuthProvider>
          <React.Suspense fallback={<div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Loading...</div>}>
            <MainApp />
          </React.Suspense>
        </AuthProvider>
      </ToastProvider>
    </SocketProvider>
  );
}

export default App;
