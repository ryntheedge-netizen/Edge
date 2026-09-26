import React, { useEffect, useState } from 'react';
import { Security } from '../../types';

interface SecurityCardProps {
  security: Security;
}

export const SecurityCard: React.FC<SecurityCardProps> = ({ security }) => {
  const [flashClass, setFlashClass] = useState<string>('');

  useEffect(() => {
    if (security.last_ltp_update_at) {
      const isUp = (security.absolute_change || 0) > 0;
      const isDown = (security.absolute_change || 0) < 0;
      if (isUp) {
        setFlashClass('flash-up');
      } else if (isDown) {
        setFlashClass('flash-down');
      }
      const timer = setTimeout(() => setFlashClass(''), 1200);
      return () => clearTimeout(timer);
    }
  }, [security.current_ltp, security.last_ltp_update_at]);

  const absChange = security.absolute_change || 0;
  const pctChange = security.percentage_change || 0;

  const isUp = absChange > 0;
  const isDown = absChange < 0;

  const formattedLtp = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(security.current_ltp);

  return (
    <div className={`security-card ${flashClass}`}>
      <div className="security-header">
        <div>
          <div className="security-symbol">{security.symbol}</div>
          <div className="security-name">{security.name}</div>
        </div>

        <div className={`movement-badge ${isUp ? 'up' : isDown ? 'down' : 'neutral'}`}>
          {isUp ? '▲' : isDown ? '▼' : '—'}
          <span>
            {isUp ? `+${absChange.toFixed(2)}` : absChange.toFixed(2)} ({isUp ? `+${pctChange.toFixed(2)}%` : `${pctChange.toFixed(2)}%`})
          </span>
        </div>
      </div>

      <div className="ltp-container">
        <div className="ltp-label">Last Traded Price (LTP)</div>
        <div className="ltp-value">{formattedLtp}</div>
      </div>
    </div>
  );
};
