import { Server as HttpServer } from 'http';
import Pusher from 'pusher';
import dotenv from 'dotenv';

dotenv.config();

let pusher: Pusher | null = null;

export function initSocketServer(httpServer: HttpServer) {
  // We keep the signature of initSocketServer to avoid breaking server.ts,
  // but we initialize Pusher instead of Socket.IO.
  if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER) {
    pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER,
      useTLS: true
    });
    console.log('[Realtime] Pusher initialized successfully.');
  } else {
    console.warn('[Realtime] Pusher credentials missing. Realtime broadcasts will be disabled locally.');
  }
  return null; // Return null instead of io
}

export function broadcastEvent(eventName: string, payload: any) {
  if (pusher) {
    pusher.trigger('edge-global', eventName, payload).catch((err) => {
      console.error(`[Realtime] Failed to broadcast ${eventName} via Pusher:`, err);
      // We catch and log, but do not throw, to ensure PostgreSQL transactions do not rollback!
    });
  } else {
    // If running locally without credentials, just log
    // console.log(`[Realtime Mock] Emitted ${eventName}`);
  }
}
