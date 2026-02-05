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
    { username: 'jon', displayName: 'Jon' },
    { username: 'alex', displayName: 'Alex' },
    { username: 'sam', displayName: 'Sam' },
    { username: 'taylor', displayName: 'Taylor' },
  ]);

  const [jon, alex, sam, taylor] = users;

  const groupChat = await Chat.create({
    name: 'BruinChat Test Group',
    isGroup: true,
    members: [jon._id, alex._id, sam._id, taylor._id],
    createdBy: jon._id,
    lastMessageAt: new Date(),
  });

  const now = Date.now();
  const messages = await Message.insertMany([
    { chatId: groupChat._id, senderId: jon._id, text: 'Welcome to BruinChat!', createdAt: new Date(now - 60_000), updatedAt: new Date(now - 60_000) },
    { chatId: groupChat._id, senderId: alex._id, text: 'Ayy we are live.', createdAt: new Date(now - 45_000), updatedAt: new Date(now - 45_000) },
    { chatId: groupChat._id, senderId: sam._id, text: 'Testing messages ✅', createdAt: new Date(now - 30_000), updatedAt: new Date(now - 30_000) },
    { chatId: groupChat._id, senderId: taylor._id, text: 'Let’s ship.', createdAt: new Date(now - 15_000), updatedAt: new Date(now - 15_000) },
  ]);

  await Chat.updateOne({ _id: groupChat._id }, { $set: { lastMessageAt: messages[messages.length - 1].createdAt } });

  console.log('Seed complete.');
  console.log('Users:');
  for (const u of users) console.log(`- ${u.displayName} (@${u.username}) id=${u._id}`);
  console.log(`Chat: ${groupChat.name} id=${groupChat._id}`);

  await conn.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});

