require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

async function main() {
  const conn = await connectDB();

  console.log('Seeding database...');

  // Dev-friendly: wipe these collections
  await Promise.all([User.deleteMany({}), Chat.deleteMany({}), Message.deleteMany({})]);

  const users = await User.insertMany([
    { username: 'mark', displayName: 'Mark' },
    { username: 'ariana', displayName: 'Ariana' },
    { username: 'alyssa', displayName: 'Alyssa' },
    { username: 'jacob', displayName: 'Jacob' },
    { username: 'jonathan', displayName: 'Jonathan' },
    { username: 'lucas', displayName: 'Lucas' },
    { username: 'michelle', displayName: 'Michelle' },
    { username: 'dummy', displayName: 'Dummy (test)' },
  ]);

  const [mark, ariana, alyssa, jacob, jonathan, lucas, michelle, dummy] = users;

  const groupChat = await Chat.create({
    name: 'BruinChat Dev Team',
    isGroup: true,
    members: users.map((u) => u._id),
    createdBy: mark._id,
    lastMessageAt: new Date(),
  });

  // Second chat — backend crew (for testing per-user chat listing)
  const groupChat2 = await Chat.create({
    name: 'Backend Squad',
    isGroup: true,
    members: [mark._id, jacob._id, lucas._id, jonathan._id],
    createdBy: mark._id,
    lastMessageAt: new Date(),
  });

  const now = Date.now();
  const messages = await Message.insertMany([
    { chatId: groupChat._id, senderId: mark._id, text: 'Welcome to BruinChat!', createdAt: new Date(now - 60_000), updatedAt: new Date(now - 60_000) },
    { chatId: groupChat._id, senderId: michelle._id, text: 'Hyped to ship this 🎉', createdAt: new Date(now - 45_000), updatedAt: new Date(now - 45_000) },
    { chatId: groupChat._id, senderId: jacob._id, text: 'Chat endpoints are live ✅', createdAt: new Date(now - 30_000), updatedAt: new Date(now - 30_000) },
    { chatId: groupChat._id, senderId: ariana._id, text: 'Dark mode also live!', createdAt: new Date(now - 15_000), updatedAt: new Date(now - 15_000) },
  ]);

  const messages2 = await Message.insertMany([
    { chatId: groupChat2._id, senderId: jacob._id, text: 'Should we add WebSockets next?', createdAt: new Date(now - 20_000), updatedAt: new Date(now - 20_000) },
    { chatId: groupChat2._id, senderId: mark._id, text: 'After OAuth lands.', createdAt: new Date(now - 10_000), updatedAt: new Date(now - 10_000) },
  ]);

  await Chat.updateOne({ _id: groupChat._id }, { $set: { lastMessageAt: messages[messages.length - 1].createdAt } });
  await Chat.updateOne({ _id: groupChat2._id }, { $set: { lastMessageAt: messages2[messages2.length - 1].createdAt } });

  console.log('Seed complete.');
  console.log('Users:');
  for (const u of users) console.log(`- ${u.displayName} (@${u.username}) id=${u._id}`);
  console.log(`Chat: ${groupChat.name} id=${groupChat._id}`);
  console.log(`Chat: ${groupChat2.name} id=${groupChat2._id}`);

  await conn.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});

