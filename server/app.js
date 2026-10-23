import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import coursesRoutes from './routes/courses.js';
import chatsRoutes from './routes/chats.js';
import usersRoutes from './routes/users.js';
import reportsRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import uploadRoutes from './routes/upload.js';
import feedbackRoutes from './routes/feedback.js';
import authRoutes from './routes/auth.js';
import { globalRateLimit } from './middleware/rateLimit.js';

import { createOriginPolicy, originGuard } from './utils/cors.js';

export function createApp({ io, isOriginAllowed = createOriginPolicy() } = {}) {
  const app = express();
  const corsOptions = { origin: (origin, callback) => callback(null, isOriginAllowed(origin)) };
  // Trust the first proxy in front of us (load balancer / cloud host) so
  // req.ip reflects the real client IP. Without this, all requests appear to
  // come from the proxy and share one rate-limit bucket.
  app.set('trust proxy', 1);

  // Middleware
  app.use(originGuard(isOriginAllowed));
  app.use(cors(corsOptions));
  app.use(express.json());

  // Attach io to req
  app.use((req, res, next) => {
    req.io = io || app.locals.io;
    next();
  });

  // Global rate limit on all /api/* routes. Keyed by IP (req.user isn't set
  // yet at this point in the middleware chain). Per-route limiters below do
  // the user-keyed limiting.
  app.use('/api', globalRateLimit);


  // Test route
  app.get('/', (req, res) => {
    res.json({ message: 'BChat API is running!' });
  });

  app.get('/api/health', (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      mongo: isConnected ? 'connected' : 'disconnected'
    });
  });

  // API routes
  app.use('/api/courses', coursesRoutes);
  app.use('/api/chats', chatsRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/feedback', feedbackRoutes);
  app.use('/api/auth', authRoutes);

  return app;
}
