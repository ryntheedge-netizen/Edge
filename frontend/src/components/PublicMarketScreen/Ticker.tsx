import React, { useEffect, useState } from 'react';
import { MarketEvent } from '../../types';
import { useSocket } from '../../context/SocketContext';

export const Ticker: React.FC = () => {
  const { channel, isConnected } = useSocket();
  const [initialLoading, setInitialLoading] = useState(true);

  // Map keyed by security_id → only the LATEST LTP event per security is kept.
  const [movementsMap, setMovementsMap] = useState<Map<number, MarketEvent>>(new Map());

  const fetchMovements = () => {
    fetch('/api/trades/movements?limit=100')
      .then((res) => res.json())
      .then((data: MarketEvent[]) => {
        if (!Array.isArray(data)) return;
        // Data is ordered ASC by created_at, so iterating forward means later
        // entries naturally overwrite earlier ones — giving us the latest per security.
        const map = new Map<number, MarketEvent>();
        data.forEach((ev) => map.set(ev.security_id, ev));
        setMovementsMap(map);
        setInitialLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load ticker movements:', err);
        setInitialLoading(false);
      });
  };

  // Fetch initial movements — keep only the latest event per security.
  useEffect(() => {
    fetchMovements();
  }, []);

  // State Recovery on Reconnect
  useEffect(() => {
    if (isConnected && !initialLoading) {
      console.log('[Ticker] Recovering authoritative state after reconnect...');
      fetchMovements();
    }
  }, [isConnected]);

  // Live LTP_UPDATE: replace (or insert) the entry for this security.
  useEffect(() => {
    if (!channel) return;

    const handleLtpUpdate = (payload: { marketEvent: MarketEvent }) => {
      if (payload?.marketEvent) {
        setMovementsMap((prev) => {
          const next = new Map(prev);
          next.set(payload.marketEvent.security_id, payload.marketEvent);
          return next;
        });
      }
    };

    const handleReset = () => setMovementsMap(new Map());

    channel.bind('LTP_UPDATE', handleLtpUpdate);
    channel.bind('EVENT_RESET', handleReset);

    return () => {
      channel.unbind('LTP_UPDATE', handleLtpUpdate);
      channel.unbind('EVENT_RESET', handleReset);
    };
  }, [channel]);

  const movements = Array.from(movementsMap.values());

  if (movements.length === 0) {
    return (
      <footer className="ticker-footer">
        <div className="ticker-track">
          <span className="ticker-item neutral">
            <span className="ticker-symbol">BULL RING MARKET READY</span> — Waiting for initial qualifying trades...
          </span>
        </div>
      </footer>
    );
  }

  // Duplicate the list to create a seamless looping marquee.
  const displayQueue = [...movements, ...movements];

  return (
    <footer className="ticker-footer">
      <div className="ticker-track">
        {displayQueue.map((item, idx) => {
          const isUp = item.absolute_change > 0;
          const isDown = item.absolute_change < 0;
          return (
            <span key={`${item.security_id}-${idx}`} className={`ticker-item ${isUp ? 'up' : isDown ? 'down' : 'neutral'}`}>
              <span className="ticker-symbol">{item.security_symbol || item.security_name}</span>
              <span className="ticker-arrow">{isUp ? '▲' : isDown ? '▼' : '—'}</span>
              <span>
                ₹{item.previous_ltp.toFixed(2)} → ₹{item.new_ltp.toFixed(2)}
              </span>
              <span>
                ({isUp ? `+${item.percentage_change.toFixed(2)}%` : `${item.percentage_change.toFixed(2)}%`})
              </span>
            </span>
          );
        })}
      </div>
    </footer>
  );
};

