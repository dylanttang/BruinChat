const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Missing MONGODB_URI in environment. Create a .env file or set the env var.');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || undefined,
  });

  return mongoose.connection;
}

module.exports = { connectDB };

