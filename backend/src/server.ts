import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import { initDatabase } from './db/database';
import { initSocketServer } from './websocket/socketServer';
import authRoutes from './routes/auth';
import marketRoutes from './routes/market';
import tradeRoutes from './routes/trades';
import tradersRoutes from './routes/traders';
import attendanceRoutes from './routes/attendance';
import jobbersRoutes from './routes/jobbers';
import brokersRoutes from './routes/brokers';
import desksRoutes from './routes/desks';
import auctionRoutes from './routes/auction';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.set('trust proxy', 1);
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/traders', tradersRoutes);
app.use('/api/jobbers', jobbersRoutes);
app.use('/api/brokers', brokersRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/desks', desksRoutes);
app.use('/api/auction', auctionRoutes);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve frontend build in production if available
const frontendBuildPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendBuildPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendBuildPath, 'index.html'), (err) => {
    if (err) {
      res.send('Bull Ring Backend API is running.');
    }
  });
});

// Export the Express app for Vercel Serverless Functions
export default app;

// Initialize Database & Seed default event/securities
initDatabase().then(() => {
  // Only start the local HTTP server if we are not running on Vercel
  if (!process.env.VERCEL) {
    // Create HTTP server & Socket.io server
    const server = http.createServer(app);
    initSocketServer(server);

    server.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`  BULL RING SIMULATION BACKEND ENGINE READY`);
      console.log(`  Server running at: http://localhost:${PORT}`);
      console.log(`  Realtime mechanism: Pusher Channels`);
      console.log(`=======================================================`);
    });
  } else {
    // On Vercel, we still need to initialize Pusher (initSocketServer initializes Pusher)
    // We pass null or a dummy server since Pusher doesn't actually need the HTTP server
    // Wait, let's just initialize Pusher directly if initSocketServer requires an http.Server.
    // Actually, initSocketServer just reads env vars and creates a Pusher instance. It ignores the server argument now!
    initSocketServer(null as any);
  }
}).catch(err => {
  console.error("Failed to initialize database", err);
  if (!process.env.VERCEL) {
    process.exit(1);
  }
});
