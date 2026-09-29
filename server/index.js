import { createOriginPolicy, originGuard, socketCorsOptions } from './utils/cors.js';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
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
import { socketAuth, registerChatHandlers } from './utils/socketAuth.js';
import { isDevLoginEnabled } from './utils/devLogin.js';
import { checkJwtSecret } from './utils/jwtSecret.js';

dotenv.config();

try {
  const jwtWarning = checkJwtSecret();
  if (jwtWarning) console.warn(`Warning: ${jwtWarning}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
const isOriginAllowed = createOriginPolicy();

const app = express();
const PORT = process.env.PORT || 3000;
const httpServer = createServer(app);
const io = new Server(httpServer, socketCorsOptions(isOriginAllowed));
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Trust the first proxy in front of us (load balancer / cloud host) so
// req.ip reflects the real client IP. Without this, all requests appear to
// come from the proxy and share one rate-limit bucket.
app.set('trust proxy', 1);

// Middleware
app.use(originGuard(isOriginAllowed));
app.use(cors({ origin: (origin, callback) => callback(null, isOriginAllowed(origin)) }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Attach io to req
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Global rate limit on all /api/* routes. Keyed by IP (req.user isn't set
// yet at this point in the middleware chain). Per-route limiters below do
// the user-keyed limiting.
app.use('/api', globalRateLimit);

// Socket.io: every connection must present a valid app JWT, and joining a
// chat's room requires membership (see utils/socketAuth.js).
io.use(socketAuth);
io.on('connection', (socket) => {
  registerChatHandlers(socket);
});

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
  if (isDevLoginEnabled()) {
    console.warn('DEV_AUTH is on: anyone who can reach this server can sign in as any user. Local development only.');
  }
});
