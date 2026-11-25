import { before, after, beforeEach } from 'node:test';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import User from '../../../models/User.js';
import { CURRENT_TERMS_VERSION } from '../../utils/terms.js';

// Tests that need real database behavior (atomic updates, indexes, races)
// run against a throwaway MongoDB started in memory. Call useRealDb() at the
// top of a test file. Every test starts with empty collections.
export function useRealDb() {
  let server;
  process.env.JWT_SECRET ||= 'real-db-test-secret-with-at-least-32-characters';
  before(async () => {
    // A one-node replica set, like Atlas, so transactions work if needed.
    server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(server.getUri(), { dbName: 'bchat-test' });
    await mongoose.connection.syncIndexes();
  });
  beforeEach(async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });
  after(async () => {
    await mongoose.disconnect();
    await server?.stop();
  });
}

let sequence = 0;
export async function makeUser(fields = {}) {
  sequence += 1;
  return User.create({
    username: `user${sequence}`,
    displayName: `User ${sequence}`,
    termsVersion: CURRENT_TERMS_VERSION,
    termsAcceptedAt: new Date(),
    ...fields,
  });
}

export function authHeaders(user) {
  return { authorization: `Bearer ${jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '1h' })}` };
}
