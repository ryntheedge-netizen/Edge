import React, { useEffect, useState } from 'react';
import { EventState, EventStats, Security } from '../types';
import { MarketControls } from '../components/AdminDashboard/MarketControls';
import { SecuritiesTable } from '../components/AdminDashboard/SecuritiesTable';
import { TradeEntryForm } from '../components/AdminDashboard/TradeEntryForm';
import { TradeHistoryTable } from '../components/AdminDashboard/TradeHistoryTable';
import { ConnectionStatus } from '../components/common/ConnectionStatus';
import { useSocket } from '../context/SocketContext';

export const AdminDashboardPage: React.FC = () => {
  const [eventState, setEventState] = useState<EventState | null>(null);
  const [stats, setStats] = useState<EventStats>({ total_trades: 0, total_ltp_changes: 0 });
  const [securities, setSecurities] = useState<Security[]>([]);
  const [refreshCount, setRefreshCount] = useState<number>(0);

  const fetchDashboardData = () => {
    Promise.all([
      fetch('/api/market/event').then((res) => res.json()),
      fetch('/api/market/securities').then((res) => res.json()),
    ])
      .then(([eventRes, secRes]) => {
        if (eventRes.event) setEventState(eventRes.event);
        if (eventRes.stats) setStats(eventRes.stats);
        if (Array.isArray(secRes)) setSecurities(secRes);
      })
      .catch((err) => console.error('Failed to load admin dashboard data:', err));
  };

  useEffect(() => {
    fetchDashboardData();
  }, [refreshCount]);

  const { socket } = useSocket();

  // Auto-refresh the admin dashboard when any relevant socket event occurs
  useEffect(() => {
    if (!socket) return;

    const triggerRefresh = () => {
      setRefreshCount((prev) => prev + 1);
    };

    socket.on('TRADE_EXECUTED', triggerRefresh);
    socket.on('MARKET_STATUS_CHANGED', triggerRefresh);
    socket.on('EVENT_RESET', triggerRefresh);
    // Note: LTP_UPDATE is usually accompanied by TRADE_EXECUTED, but we can listen just in case
    socket.on('LTP_UPDATE', triggerRefresh);

    return () => {
      socket.off('TRADE_EXECUTED', triggerRefresh);
      socket.off('MARKET_STATUS_CHANGED', triggerRefresh);
      socket.off('EVENT_RESET', triggerRefresh);
      socket.off('LTP_UPDATE', triggerRefresh);
    };
  }, [socket]);

  const handleTradeSubmitted = () => {
    // Also trigger local refresh immediately for responsiveness, though socket will catch it too
    setRefreshCount((prev) => prev + 1);
  };

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
