import React, { useEffect, useState } from 'react';
import { Security } from '../../types';

interface SecurityRowProps {
  security: Security;
  isMarketLive?: boolean;
}

export const SecurityRow: React.FC<SecurityRowProps> = ({ security, isMarketLive = false }) => {
  const [flashClass, setFlashClass] = useState<string>('');

  useEffect(() => {
    if (security.last_ltp_update_at) {
      const isUp = (security.absolute_change || 0) > 0;
      const isDown = (security.absolute_change || 0) < 0;
      if (isUp) {
        setFlashClass('flash-up-row');
      } else if (isDown) {
        setFlashClass('flash-down-row');
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

  const formattedLc = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(security.lower_circuit);

  const formattedUc = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(security.upper_circuit);

  const colorClass = isMarketLive ? (isUp ? 'text-up' : isDown ? 'text-down' : 'text-neutral') : 'text-neutral';

  return (
    <tr className={`market-row ${flashClass}`}>
      <td className="col-symbol">
        <span className="symbol-text">{security.symbol}</span>
      </td>
      <td className={`col-ltp ${colorClass}`}>{formattedLtp}</td>
      <td className={`col-pct ${colorClass}`}>
        {isUp ? '▲' : isDown ? '▼' : '■'} {isUp ? `+${pctChange.toFixed(2)}%` : isDown ? `${pctChange.toFixed(2)}%` : '0.00%'}
      </td>
      <td className="col-circuit text-muted">{formattedLc}</td>
      <td className="col-circuit text-muted">{formattedUc}</td>
    </tr>
  );
};
