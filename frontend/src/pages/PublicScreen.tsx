import React, { useEffect, useState } from 'react';
import { EventState, Security, MarketEvent } from '../types';
import { SecurityRow } from '../components/PublicMarketScreen/SecurityRow';
import { Ticker } from '../components/PublicMarketScreen/Ticker';
import { ConnectionStatus } from '../components/common/ConnectionStatus';
import { useSocket } from '../context/SocketContext';

/**
 * Enrich a raw security DB record (from socket payload) with computed
 * movement fields so cards display the correct % change badge.
 */
function enrichSecurity(raw: Security, existing?: Security): Security {
  const initialLtp = existing?.initial_ltp ?? raw.initial_ltp;
  const currentLtp = raw.current_ltp;
  const absChange = Number((currentLtp - initialLtp).toFixed(2));
  const pctChange =
    initialLtp === 0
      ? 0
      : Number((((currentLtp - initialLtp) / initialLtp) * 100).toFixed(2));
  const threshold = raw.threshold_amount ?? existing?.threshold_amount ?? 100000;
  const accumulated = raw.accumulated_trade_value ?? 0;
  const remainingThreshold = Math.max(0, threshold - accumulated);
  const thresholdProgressPct = Math.min(
    100,
    Number(((accumulated / threshold) * 100).toFixed(1))
  );
  return {
    ...raw,
    initial_ltp: initialLtp,
    absolute_change: absChange,
    percentage_change: pctChange,
    remaining_threshold: remainingThreshold,
    threshold_progress_pct: thresholdProgressPct,
  };
}

export const PublicScreen: React.FC = () => {
  const { channel, isConnected } = useSocket();
  const [eventState, setEventState] = useState<EventState | null>(null);
  const [securities, setSecurities] = useState<Security[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchMarketData = () => {
    Promise.all([
      fetch('/api/market/event').then((res) => res.json()),
      fetch('/api/market/securities').then((res) => res.json()),
    ])
      .then(([eventData, secData]) => {
        if (eventData.event) setEventState(eventData.event);
        if (Array.isArray(secData)) setSecurities(secData);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load public market data:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMarketData();
  }, []);

  // State Recovery on Reconnect
  useEffect(() => {
    if (isConnected && !loading) {
      console.log('[PublicScreen] Recovering authoritative state after reconnect...');
      fetchMarketData();
    }
  }, [isConnected]);

  // Listen to Pusher events for real-time updates
  useEffect(() => {
    if (!channel) return;

    // LTP_UPDATE: a threshold was crossed — use the marketEvent's authoritative
    // absolute_change / percentage_change (prev_ltp → new_ltp), NOT initial_ltp.
    const handleLtpUpdate = (payload: { marketEvent: MarketEvent; security: Security }) => {
      if (payload?.security) {
        const me = payload.marketEvent;
        setSecurities((prev) =>
          prev.map((s) => {
            if (s.id !== payload.security.id) return s;
            const base = enrichSecurity(payload.security, s);
            return {
              ...base,
              // Override computed movement with the exact recorded market-event values
              absolute_change:  me ? Number(me.absolute_change)  : base.absolute_change,
              percentage_change: me ? Number(me.percentage_change) : base.percentage_change,
            };
          })
        );
      }
    };

    // TRADE_EXECUTED: may or may not have triggered an LTP update.
    // Preserve the existing movement badge — only update accumulator / LTP.
    const handleTradeExecuted = (payload: { security: Security; ltpUpdated: boolean }) => {
      if (payload?.security) {
        setSecurities((prev) =>
          prev.map((s) => {
            if (s.id !== payload.security.id) return s;
            const enriched = enrichSecurity(payload.security, s);
            if (!payload.ltpUpdated) {
              // No LTP change — keep the previously computed movement badge
              return { ...enriched, absolute_change: s.absolute_change, percentage_change: s.percentage_change };
            }
            return enriched;
          })
        );
      }
    };

    const handleStatusChanged = (payload: { event: EventState }) => {
      if (payload?.event) setEventState(payload.event);
    };

    const handleEventReset = (payload: { event: EventState; securities: Security[] }) => {
      if (payload?.event) setEventState(payload.event);
      if (payload?.securities) setSecurities(payload.securities);
    };

    channel.bind('LTP_UPDATE', handleLtpUpdate);
    channel.bind('TRADE_EXECUTED', handleTradeExecuted);
    channel.bind('MARKET_STATUS_CHANGED', handleStatusChanged);
    channel.bind('EVENT_RESET', handleEventReset);

    return () => {
      channel.unbind('LTP_UPDATE', handleLtpUpdate);
      channel.unbind('TRADE_EXECUTED', handleTradeExecuted);
      channel.unbind('MARKET_STATUS_CHANGED', handleStatusChanged);
      channel.unbind('EVENT_RESET', handleEventReset);
    };
  }, [channel]);

  return (
    <div className="market-board-container">
      <ConnectionStatus />

      {/* Top Header */}
      <header className="market-header">
        <div className="market-title">
          <h1>Rising Youth Network Stock Exchange</h1>
        </div>

        {eventState && (
          <div className={`status-pill ${eventState.status}`}>
            <span className="status-dot"></span>
            <span>MARKET {eventState.status.replace('_', ' ')}</span>
          </div>
        )}
      </header>

      {/* Securities Split Board */}
      <main className="securities-split">
        {loading ? (
          <div style={{ color: '#94a3b8', fontSize: '1.2rem', padding: '2rem' }}>Loading live market data...</div>
        ) : (
          <>
            <div className="market-panel">
              <table className="market-board-table">
                <thead>
                  <tr>
                    <th className="col-symbol">SECURITY CODE</th>
                    <th className="col-circuit">LOWER</th>
                    <th className="col-circuit">OPEN</th>
                    <th className="col-circuit">UPPER</th>
                    <th className="col-ltp">LTP</th>
                    <th className="col-pct">% CHANGE</th>
                  </tr>
                </thead>
                <tbody>
                  {securities.slice(0, 15).map((security) => (
                    <SecurityRow key={security.id} security={security} isMarketLive={eventState?.status === 'LIVE'} />
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="market-panel">
              <table className="market-board-table">
                <thead>
                  <tr>
                    <th className="col-symbol">SECURITY CODE</th>
                    <th className="col-circuit">LOWER</th>
                    <th className="col-circuit">OPEN</th>
                    <th className="col-circuit">UPPER</th>
                    <th className="col-ltp">LTP</th>
                    <th className="col-pct">% CHANGE</th>
                  </tr>
                </thead>
                <tbody>
                  {securities.slice(15, 30).map((security) => (
                    <SecurityRow key={security.id} security={security} isMarketLive={eventState?.status === 'LIVE'} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* Bottom Continuous Marquee Ticker */}
      <Ticker />
    </div>
  );
};
