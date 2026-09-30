import React, { useEffect, useState } from 'react';
import { EventState, EventStats, Security } from '../types';
import { MarketControls } from '../components/AdminDashboard/MarketControls';
import { SecuritiesTable } from '../components/AdminDashboard/SecuritiesTable';
import { TradeEntryForm } from '../components/AdminDashboard/TradeEntryForm';
import { TradeHistoryTable } from '../components/AdminDashboard/TradeHistoryTable';
import { ConnectionStatus } from '../components/common/ConnectionStatus';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { DeskEntryScreen } from '../components/AdminDashboard/DeskEntryScreen';

export const AdminDashboardPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [eventState, setEventState] = useState<EventState | null>(null);
  const [stats, setStats] = useState<EventStats>({ total_trades: 0, total_ltp_changes: 0 });
  const [securities, setSecurities] = useState<Security[]>([]);
  const [refreshCount, setRefreshCount] = useState<number>(0);
  
  // Superadmins bypass desk check
  const [deskValidated, setDeskValidated] = useState<boolean>(hasPermission('BULL_RING_SUPERADMIN') || !!sessionStorage.getItem('bull_ring_desk_id'));

  const fetchDashboardData = () => {
    Promise.all([
      fetch('/api/market/event').then((res) => res.json()),
      fetch('/api/market/securities').then((res) => res.json()),
    ])
      .then(([eventRes, secRes]) => {
        if (eventRes.event) setEventState(eventRes.event);
        if (eventRes.stats) setStats(eventRes.stats);
        if (Array.isArray(secRes)) setSecurities(secRes);
        setInitialLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load admin dashboard data:', err);
        setInitialLoading(false);
      });
  };

  useEffect(() => {
    fetchDashboardData();
  }, [refreshCount]);

  const { channel, isConnected } = useSocket();
  const [initialLoading, setInitialLoading] = useState(true);

  // State Recovery on Reconnect
  useEffect(() => {
    if (isConnected && !initialLoading) {
      console.log('[AdminDashboard] Recovering authoritative state after reconnect...');
      fetchDashboardData();
    }
  }, [isConnected]);

  // Auto-refresh the admin dashboard when any relevant socket event occurs
  useEffect(() => {
    if (!channel) return;

    const triggerRefresh = () => {
      setRefreshCount((prev) => prev + 1);
    };

    channel.bind('TRADE_EXECUTED', triggerRefresh);
    channel.bind('MARKET_STATUS_CHANGED', triggerRefresh);
    channel.bind('EVENT_RESET', triggerRefresh);
    // Note: LTP_UPDATE is usually accompanied by TRADE_EXECUTED, but we can listen just in case
    channel.bind('LTP_UPDATE', triggerRefresh);

    return () => {
      channel.unbind('TRADE_EXECUTED', triggerRefresh);
      channel.unbind('MARKET_STATUS_CHANGED', triggerRefresh);
      channel.unbind('EVENT_RESET', triggerRefresh);
      channel.unbind('LTP_UPDATE', triggerRefresh);
    };
  }, [channel]);

  const handleTradeSubmitted = () => {
    setRefreshCount((prev) => prev + 1);
  };

  if (!deskValidated) {
    return (
      <div className="admin-container">
        <DeskEntryScreen onValidated={(id, token) => {
          sessionStorage.setItem('bull_ring_desk_id', id);
          sessionStorage.setItem('bull_ring_desk_token', token);
          setDeskValidated(true);
        }} />
      </div>
    );
  }

  return (
    <div className="admin-container">
      <ConnectionStatus />



      {/* Main Grid Content */}
      <div className="admin-grid">
        <div>
          {/* Market Controls */}
          <MarketControls
            eventState={eventState}
            stats={stats}
            onStateUpdate={() => setRefreshCount((prev) => prev + 1)}
          />

          {/* Securities Monitor Table */}
          <SecuritiesTable securities={securities} />

          {/* Trade History Table */}
          <TradeHistoryTable securities={securities} refreshTrigger={refreshCount} />
        </div>

        <div>
          {/* Trade Entry Form */}
          <TradeEntryForm
            securities={securities}
            onTradeSubmitted={handleTradeSubmitted}
            isMarketLive={eventState?.status === 'LIVE'}
          />
        </div>
      </div>
    </div>
  );
};
