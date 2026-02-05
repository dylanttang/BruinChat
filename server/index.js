import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'BruinChat API is running!' });
});

app.get('/api/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mongo: isConnected ? 'connected' : 'disconnected'
  });
});

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (process.env.SERVER_PUBLIC_URL) {
    console.log(`For mobile devices, use: ${process.env.SERVER_PUBLIC_URL}`);
  } else {
    console.log(`For mobile devices, set SERVER_PUBLIC_URL in .env to your computer's IP (e.g. http://192.168.1.100:${PORT})`);
  }
});
