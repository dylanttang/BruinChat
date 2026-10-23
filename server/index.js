import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { createOriginPolicy, socketCorsOptions } from './utils/cors.js';
import { configureSockets } from './utils/sockets.js';

dotenv.config();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === 'replace-with-a-long-random-secret') {
  throw new Error('Set JWT_SECRET to a random secret of at least 32 characters');
}
const isOriginAllowed = createOriginPolicy();

const app = createApp({ isOriginAllowed });
const PORT = process.env.PORT || 3000;
const httpServer = createServer(app);
const io = new Server(httpServer, socketCorsOptions(isOriginAllowed));
app.locals.io = io;
configureSockets(io);

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
