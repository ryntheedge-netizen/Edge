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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
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

// Initialize Database & Seed default event/securities
initDatabase().then(() => {
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
}).catch(err => {
  console.error("Failed to initialize database", err);
  process.exit(1);
});
