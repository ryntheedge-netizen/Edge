import React, { useEffect, useState } from 'react';
import { useSocket } from '../../context/SocketContext';
import { WifiOff, Wifi } from 'lucide-react';

export const ConnectionStatus: React.FC = () => {
  const { isConnected, isReconnecting } = useSocket();
  const [showRestored, setShowRestored] = useState<boolean>(false);
  const [wasDisconnected, setWasDisconnected] = useState<boolean>(false);

  useEffect(() => {
    if (isReconnecting) {
      setWasDisconnected(true);
    } else if (isConnected && wasDisconnected) {
      setShowRestored(true);
      const timer = setTimeout(() => {
        setShowRestored(false);
        setWasDisconnected(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, isReconnecting, wasDisconnected]);

  if (isReconnecting) {
    return (
      <div className="reconnect-toast">
        <WifiOff size={18} className="animate-pulse" />
        <span>Live connection interrupted — reconnecting...</span>
      </div>
    );
  }

  if (showRestored) {
    return (
      <div className="reconnect-toast restored">
        <Wifi size={18} />
        <span>Live connection restored.</span>
      </div>
    );
  }

  return null;
};
