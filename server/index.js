import { createOriginPolicy, originGuard, socketCorsOptions } from './utils/cors.js';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import coursesRoutes from './routes/courses.js';
import chatsRoutes from './routes/chats.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import usersRoutes from './routes/users.js';
import reportsRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import uploadRoutes from './routes/upload.js';
import feedbackRoutes from './routes/feedback.js';
import authRoutes from './routes/auth.js';
import { globalRateLimit } from './middleware/rateLimit.js';

import { mediaResponseMiddleware } from './utils/media.js';
import { configureSockets } from './utils/sockets.js';

dotenv.config();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === 'replace-with-a-long-random-secret') {
  throw new Error('Set JWT_SECRET to a random secret of at least 32 characters');
}
const isOriginAllowed = createOriginPolicy();

const app = express();
const PORT = process.env.PORT || 3000;
const httpServer = createServer(app);
const io = new Server(httpServer, socketCorsOptions(isOriginAllowed));

// Trust the first proxy in front of us (load balancer / cloud host) so
// req.ip reflects the real client IP. Without this, all requests appear to
// come from the proxy and share one rate-limit bucket.
app.set('trust proxy', 1);

// Middleware
app.use(originGuard(isOriginAllowed));
app.use(cors({ origin: (origin, callback) => callback(null, isOriginAllowed(origin)) }));
app.use(express.json());
app.use(mediaResponseMiddleware);

// Attach io to req
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Global rate limit on all /api/* routes. Keyed by IP (req.user isn't set
// yet at this point in the middleware chain). Per-route limiters below do
// the user-keyed limiting.
app.use('/api', globalRateLimit);

configureSockets(io);

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

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment. Create a .env file or set the env var.');
  process.exit(1);
}

mongoose.set('strictQuery', true);
mongoose.connect(MONGODB_URI, {
  dbName: process.env.MONGODB_DB || undefined,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (process.env.SERVER_PUBLIC_URL) {
    console.log(`For mobile devices, use: ${process.env.SERVER_PUBLIC_URL}`);
  } else {
    console.log(`For mobile devices, set SERVER_PUBLIC_URL in .env to your computer's IP (e.g. http://192.168.1.100:${PORT})`);
  }
});
