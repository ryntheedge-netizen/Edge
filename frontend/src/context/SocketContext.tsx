import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import Pusher from 'pusher-js';

interface SocketContextType {
  socket: Pusher | null;
  channel: any | null; // Pusher channel
  isConnected: boolean;
  isReconnecting: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  channel: null,
  isConnected: false,
  isReconnecting: false,
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Pusher | null>(null);
  const [channel, setChannel] = useState<any | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  // We use a ref to prevent double initialization in React Strict Mode
  const pusherInitialized = useRef(false);

  useEffect(() => {
    if (pusherInitialized.current) return;
    pusherInitialized.current = true;

    // @ts-ignore
    const pusherKey = import.meta.env.VITE_PUSHER_KEY;
    // @ts-ignore
    const pusherCluster = import.meta.env.VITE_PUSHER_CLUSTER;

    if (!pusherKey || !pusherCluster) {
      console.warn('[Realtime] Pusher credentials missing. Realtime updates are disabled.');
      return;
    }

    const pusherInstance = new Pusher(pusherKey, {
      cluster: pusherCluster,
    });

    pusherInstance.connection.bind('connected', () => {
      console.log('[Realtime] Connected to Pusher');
      setIsConnected(true);
      setIsReconnecting(false);
    });

    pusherInstance.connection.bind('disconnected', () => {
      console.warn('[Realtime] Disconnected from Pusher');
      setIsConnected(false);
      setIsReconnecting(false);
    });

    pusherInstance.connection.bind('connecting', () => {
      setIsConnected(false);
      setIsReconnecting(true);
    });

    pusherInstance.connection.bind('error', (err: any) => {
      console.error('[Realtime] Pusher connection error', err);
      setIsConnected(false);
      setIsReconnecting(true);
    });

    const publicChannel = pusherInstance.subscribe('edge-global');

    setSocket(pusherInstance);
    setChannel(publicChannel);

    return () => {
      publicChannel.unbind_all();
      pusherInstance.unsubscribe('edge-global');
      pusherInstance.disconnect();
      pusherInitialized.current = false;
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, channel, isConnected, isReconnecting }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
