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
      })
      .catch((err) => console.error('Failed to load admin dashboard data:', err));
  };

  useEffect(() => {
    fetchDashboardData();
  }, [refreshCount]);

  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;
    const triggerRefresh = () => setRefreshCount((prev) => prev + 1);

    socket.on('EVENT_RESET', triggerRefresh);
    socket.on('MARKET_STATUS_CHANGED', triggerRefresh);

    return () => {
      socket.off('EVENT_RESET', triggerRefresh);
      socket.off('MARKET_STATUS_CHANGED', triggerRefresh);
    };
  }, [socket]);

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
