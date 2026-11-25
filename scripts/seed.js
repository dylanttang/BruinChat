// Fills a local dev database with fake classmates, class chats, a DM and a
// team chat, including the awkward cases (blocked, banned, deleted, not a
// classmate) so features can be tested by hand.
//
//   npm run db:start                     # local MongoDB in Docker
//   npm run db:seed                      # wipe and seed
//   npm run db:seed -- --me you@g.ucla.edu
//
// --me: sign in once with Google against the local server first, then seed
// with your email. Your account is kept, joined to the seeded classes, the
// team chat and a DM, so you see real-looking data when you sign in.
require('dotenv').config({
  path: require('path').resolve(__dirname, '../server/.env'),
});
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Course = require('../models/Course');

const COURSES = [
  ['COM SCI', '35L', 'Software Construction'],
  ['MATH', '32B', 'Calculus of Several Variables'],
  ['PHYSICS', '1A', 'Physics for Scientists and Engineers: Mechanics'],
  ['STATS', '10', 'Introduction to Statistical Reasoning'],
];

// username, display name, course indexes, extra fields
const PEOPLE = [
  ['ana', 'Ana Lopez', [0, 1]],
  ['ben', 'Ben Park', [0, 1, 2]],
  ['cam', 'Cam Nguyen', [0, 2]],
  ['dee', 'Dee Shah', [1, 2]],
  ['eli', 'Eli Brooks', [0]],
  ['fay', 'Fay Kim', [1]],
  ['gus', 'Gus Banned', [0], { bannedAt: new Date() }],
  ['ivy', 'Ivy (Ana blocked her)', [0]],
  ['jay', 'Jay (blocked Ana)', [0]],
  ['kim', 'Kim (no shared class with Ana)', [3]],
];

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] || null;
}

async function main() {
  // This deletes EVERY user, chat and message. Only allow it on a database
  // whose name marks it as dev/test, and only when --wipe is passed.
  const dbName = process.env.MONGODB_DB || '';
  if (!process.argv.includes('--wipe') || !/dev|test/i.test(dbName)) {
    console.error(
      `Refusing to seed: this deletes ALL users, chats and messages in "${dbName || '(the database in MONGODB_URI)'}".\n` +
      'Only run it against a development database: set MONGODB_DB to a name containing "dev" or "test" and pass --wipe.'
    );
    process.exit(1);
  }
  const term = process.env.CURRENT_TERM;
  if (!term) throw new Error('Set CURRENT_TERM in server/.env (e.g. 26F) so seeded courses show in the picker.');
  const { CURRENT_TERMS_VERSION } = await import('../server/utils/terms.js');

  const conn = await connectDB();
  const myEmail = argValue('--me')?.toLowerCase() || null;
  const me = myEmail ? await User.findOne({ email: myEmail }) : null;
  if (myEmail && !me) {
    throw new Error(`No user with email ${myEmail}. Sign in once with Google against the local server, then run this again.`);
  }

  console.log(`Seeding ${dbName}...`);
  await Promise.all([
    User.deleteMany(me ? { _id: { $ne: me._id } } : {}),
    Chat.deleteMany({}),
    Message.deleteMany({}),
    Course.deleteMany({ term }),
  ]);

  const courses = await Course.insertMany(COURSES.map(([subjectArea, number, title]) => ({ subjectArea, number, title, term })));
  const accepted = { termsVersion: CURRENT_TERMS_VERSION, termsAcceptedAt: new Date() };
  const users = await User.insertMany(PEOPLE.map(([username, displayName, courseIndexes, extra]) => ({
    username, displayName, courses: courseIndexes.map((i) => courses[i]._id), ...accepted, ...extra,
  })));
  const byName = Object.fromEntries(users.map((user) => [user.username, user]));
  const deleted = await User.create({ username: 'deleted-hal', displayName: 'Deleted user', deletedAt: new Date() });

  await User.updateOne({ _id: byName.ana._id }, { $set: { blockedUsers: [byName.ivy._id] } });
  await User.updateOne({ _id: byName.jay._id }, { $set: { blockedUsers: [byName.ana._id] } });
  if (me) {
    await User.updateOne({ _id: me._id }, { $set: { courses: [courses[0]._id, courses[1]._id], blockedUsers: [], ...accepted } });
  }

  // Class chats, shaped like PUT /api/users/me/courses creates them.
  const now = Date.now();
  const at = (minutesAgo) => new Date(now - minutesAgo * 60_000);
  const classChats = [];
  for (const [index, course] of courses.entries()) {
    const members = PEOPLE.filter(([, , courseIndexes, extra]) => courseIndexes.includes(index) && !extra?.bannedAt)
      .map(([username]) => byName[username]._id);
    // Banned users stay members of their class chats; they just can't post.
    if (index === 0) members.push(byName.gus._id);
    if (me && index <= 1) members.push(me._id);
    classChats.push(await Chat.create({
      name: `${course.subjectArea} ${course.number} — ${course.title}`,
      isGroup: true,
      course: course._id,
      members,
      createdBy: members[0],
      lastMessageAt: null,
    }));
  }

  const team = await Chat.create({
    name: 'BChat Team',
    isGroup: true,
    members: [...users.filter((user) => !user.bannedAt).map((user) => user._id), ...(me ? [me._id] : [])],
    createdBy: byName.ana._id,
    lastMessageAt: null,
  });

  const dmMembers = [byName.ana._id, me ? me._id : byName.ben._id].map(String).sort();
  const dm = await Chat.create({
    name: 'Direct message',
    isGroup: false,
    directKey: dmMembers.join(':'),
    members: dmMembers,
    createdBy: byName.ana._id,
    lastMessageAt: null,
  });

  const messages = [
    [classChats[0], 'ben', 'Anyone started the shell scripting lab?', 50],
    [classChats[0], 'cam', 'Halfway. The sed part is rough', 45],
    [classChats[0], 'ivy', 'Office hours moved to 3pm today', 40],
    [classChats[0], 'jay', 'Thanks Ivy!', 38],
    [classChats[1], 'dee', 'Is the midterm cumulative?', 30],
    [classChats[1], 'fay', 'Just chapters 15 and 16 I think', 28],
    [classChats[2], 'cam', 'Problem 4 on the homework is wild', 20],
    [classChats[3], 'kim', 'Does anyone have the lecture slides?', 18],
    [team, 'ana', 'Welcome to BChat!', 15],
    [dm, 'ana', 'Want to study for 35L together?', 10],
  ];
  for (const [chat, username, text, minutesAgo] of messages) {
    const message = await Message.create({ chatId: chat._id, senderId: byName[username]._id, text, createdAt: at(minutesAgo), updatedAt: at(minutesAgo) });
    await Chat.updateOne({ _id: chat._id }, { $set: { lastMessageAt: message.createdAt } });
  }

  console.log('Seed complete.\n');
  console.log(`Courses (term ${term}): ${courses.map((c) => `${c.subjectArea} ${c.number}`).join(', ')}`);
  console.log('People:');
  for (const user of users) console.log(`- ${user.displayName} (@${user.username}) id=${user._id}`);
  console.log(`- ${deleted.displayName} (@${deleted.username}) id=${deleted._id}`);
  if (me) console.log(`\nYou (${myEmail}) are in COM SCI 35L, MATH 32B, BChat Team and a DM with Ana.`);
  else console.log('\nTip: sign in with Google against the local server, then run with --me <your email> to join these chats.');

  await conn.close();
}

main().catch(async (err) => {
  console.error(err.message || err);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});
