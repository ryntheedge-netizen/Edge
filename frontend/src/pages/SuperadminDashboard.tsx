import React, { useEffect, useState } from 'react';
import { EventState, Security } from '../types';
import { SuperadminControls } from '../components/AdminDashboard/SuperadminControls';
import { JobberControls } from '../components/AdminDashboard/JobberControls';
import { BrokerControls } from '../components/AdminDashboard/BrokerControls';
import { DeskManagement } from '../components/AdminDashboard/DeskManagement';
import { TraderPortfolioList } from '../components/AdminDashboard/TraderPortfolioList';
import { ConnectionStatus } from '../components/common/ConnectionStatus';
import { useSocket } from '../context/SocketContext';

export const SuperadminDashboardPage: React.FC = () => {
  const [eventState, setEventState] = useState<EventState | null>(null);
  const [securities, setSecurities] = useState<Security[]>([]);
  const [refreshCount, setRefreshCount] = useState<number>(0);

  const fetchDashboardData = () => {
    Promise.all([
      fetch('/api/market/event').then((res) => res.json()),
      fetch('/api/market/securities').then((res) => res.json()),
    ])
      .then(([eventRes, secRes]) => {
        if (eventRes.event) setEventState(eventRes.event);
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
      console.log('[SuperadminDashboard] Recovering authoritative state after reconnect...');
      fetchDashboardData();
    }
  }, [isConnected]);

  useEffect(() => {
    if (!channel) return;
    const triggerRefresh = () => setRefreshCount((prev) => prev + 1);

    channel.bind('EVENT_RESET', triggerRefresh);
    channel.bind('MARKET_STATUS_CHANGED', triggerRefresh);

    return () => {
      channel.unbind('EVENT_RESET', triggerRefresh);
      channel.unbind('MARKET_STATUS_CHANGED', triggerRefresh);
    };
  }, [channel]);

  return (
    <div className="admin-container">
      <ConnectionStatus />
      
      {/* 2-Column Grid Layout for Controls akin to Market grid */}
      <div className="admin-grid" style={{ alignItems: 'start' }}>
        {/* Left Column: Jobbers and Brokers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <JobberControls securities={securities} />
          <BrokerControls securities={securities} />
        </div>

        {/* Right Column: Desks, Lifecycle, and Config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <DeskManagement refreshTrigger={refreshCount} />
          
          <SuperadminControls 
            eventState={eventState}
            onStateChange={() => setRefreshCount((prev) => prev + 1)}
          />

          <TraderPortfolioList />
        </div>
      </div>
    </div>
  );
};
