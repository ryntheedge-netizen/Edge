import React, { useEffect, useState } from 'react';
import { EventState, EventStats, Security } from '../types';
import { MarketControls } from '../components/AdminDashboard/MarketControls';
import { SecuritiesTable } from '../components/AdminDashboard/SecuritiesTable';
import { TradeEntryForm } from '../components/AdminDashboard/TradeEntryForm';
import { TradeHistoryTable } from '../components/AdminDashboard/TradeHistoryTable';
import { ConnectionStatus } from '../components/common/ConnectionStatus';
import { useSocket } from '../context/SocketContext';

export const SuperadminMarketPage: React.FC = () => {
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
        setInitialLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load superadmin market data:', err);
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
      console.log('[SuperadminMarket] Recovering authoritative state after reconnect...');
      fetchDashboardData();
    }
  }, [isConnected]);

  useEffect(() => {
    if (!channel) return;

    const triggerRefresh = () => {
      setRefreshCount((prev) => prev + 1);
    };

    channel.bind('TRADE_EXECUTED', triggerRefresh);
    channel.bind('MARKET_STATUS_CHANGED', triggerRefresh);
    channel.bind('EVENT_RESET', triggerRefresh);
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
