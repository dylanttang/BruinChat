require('dotenv').config({
  path: require('path').resolve(__dirname, '../server/.env'),
});
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Course = require('../models/Course');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');

// --- End-of-quarter cleanup ---
// Removes an old term's class chats so people only see the current quarter:
//   1. finds the term's courses and the chats linked to them (chats without a
//      course, e.g. DMs, team chats and the App Review demo chat, are never touched)
//   2. writes a JSON backup of those chats, their messages and the affected
//      users' course lists to a folder OUTSIDE the repo (it holds real messages)
//   3. deletes the messages' photos/videos from Cloudinary, then the messages
//      and chats, then pulls the old courses from every user's course list
//      (otherwise saving your classes later re-creates the old chat)
// The Course documents themselves are kept. Reports are kept too (Privacy
// Policy section 5), even when the reported message is deleted.
//
// Dry run by default (only prints counts); pass --apply to back up and delete.

const MEDIA_DELETE_BATCH = 50; // Cloudinary deletes in flight at once

// --- CLI args ---

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

// UCLA term codes are YYQ; within a year the quarters run Winter, Spring,
// Summer (1), Fall. Returns a number that sorts terms in calendar order.
const QUARTER_ORDER = ['W', 'S', '1', 'F'];
const TERM_PATTERN = /^\d{2}[WS1F]$/;

function termOrder(term) {
  return Number(term.slice(0, 2)) * QUARTER_ORDER.length + QUARTER_ORDER.indexOf(term[2]);
}

function parseTerm() {
  const term = argValue('--term');
  if (!term || !TERM_PATTERN.test(term)) {
    console.error('Usage: node scripts/archiveTerm.js --term 26S            # dry run: print what would be deleted');
    console.error('       node scripts/archiveTerm.js --term 26S --apply    # back up, then delete');
    console.error('       [--backup-dir <folder>]                           # default: ~/bchat-backups');
    console.error('');
    console.error('Term codes: YYQ format (e.g., 26W = Winter 2026, 26S = Spring 2026, 261 = Summer 2026, 26F = Fall 2026)');
    process.exit(1);
  }
  return term;
}

// --- Backup ---

function writeBackup(dir, term, data) {
  const repoRoot = path.resolve(__dirname, '..');
  const resolved = path.resolve(dir);
  if (resolved === repoRoot || resolved.startsWith(repoRoot + path.sep)) {
    throw new Error(`Backup folder ${resolved} is inside the repo. It holds real messages, so pick a folder outside it.`);
  }
  fs.mkdirSync(resolved, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(resolved, `archive-${term}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });

  // Read it back before deleting anything: a truncated or unparseable backup
  // is no backup.
  const check = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (
    check.chats.length !== data.chats.length ||
    check.messages.length !== data.messages.length ||
    check.users.length !== data.users.length
  ) {
    throw new Error(`Backup ${file} doesn't match what was read from the database. Nothing was deleted.`);
  }
  return file;
}

// --- Main ---

async function main() {
  const term = parseTerm();
  const apply = process.argv.includes('--apply');
  const backupDir = argValue('--backup-dir') || path.join(os.homedir(), 'bchat-backups');

  // Only ever archive a quarter that's already over. CURRENT_TERM comes from
  // server/.env (or the command line), which can be stale, so it's printed
  // below: check it matches CURRENT_TERM in Railway.
  const currentTerm = process.env.CURRENT_TERM;
  if (!currentTerm || !TERM_PATTERN.test(currentTerm)) {
    console.error(`Refusing to run: CURRENT_TERM is ${currentTerm ? `"${currentTerm}", not a term code` : 'not set'}.`);
    console.error('Set it to the quarter the app is on (the same value as in Railway), e.g. CURRENT_TERM=26F.');
    process.exit(1);
  }
  if (termOrder(term) >= termOrder(currentTerm)) {
    console.error(`Refusing to archive ${term}: it isn't before CURRENT_TERM (${currentTerm}). Only past quarters can be archived.`);
    process.exit(1);
  }

  await connectDB();
  console.log(`Database: ${mongoose.connection.name}`);
  console.log(`CURRENT_TERM: ${currentTerm} (should match Railway)`);
  console.log(`Term: ${term}${apply ? '' : ' (dry run, nothing will be changed)'}\n`);

  const courseIds = (await Course.find({ term }).select('_id').lean()).map((c) => c._id);
  const chats = await Chat.find({ course: { $in: courseIds } }).lean();
  const chatIds = chats.map((c) => c._id);
  const messages = await Message.find({ chatId: { $in: chatIds } }).lean();
  const users = await User.find({ courses: { $in: courseIds } }).select('_id displayName courses').lean();

  // ES-module helpers from the server; imported here since scripts are CommonJS.
  const { deleteMediaAssets, messageMediaReferences } = await import('../server/utils/media.js');
  const media = messages.flatMap(messageMediaReferences);

  console.log(`Courses in ${term}:        ${courseIds.length}`);
  console.log(`Class chats to delete:   ${chats.length}`);
  console.log(`Messages to delete:      ${messages.length}`);
  console.log(`Photos/videos to delete: ${media.length}`);
  console.log(`Users to update:         ${users.length}`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to back up and delete.');
    return;
  }
  if (chats.length === 0 && users.length === 0) {
    console.log('\nNothing to archive for that term.');
    return;
  }

  const backupFile = writeBackup(backupDir, term, {
    term,
    database: mongoose.connection.name,
    createdAt: new Date().toISOString(),
    courseIds,
    chats,
    messages,
    users,
  });
  console.log(`\nBackup written and checked: ${backupFile}`);

  for (let i = 0; i < media.length; i += MEDIA_DELETE_BATCH) {
    await deleteMediaAssets(media.slice(i, i + MEDIA_DELETE_BATCH));
  }
  const deletedMessages = await Message.deleteMany({ chatId: { $in: chatIds } });
  const deletedChats = await Chat.deleteMany({ _id: { $in: chatIds } });
  const updatedUsers = await User.updateMany(
    { courses: { $in: courseIds } },
    { $pull: { courses: { $in: courseIds } } }
  );

  console.log(`Deleted ${deletedMessages.deletedCount} messages and ${deletedChats.deletedCount} chats`);
  console.log(`Removed ${term} courses from ${updatedUsers.modifiedCount} users`);
  console.log(`Requested deletion of ${media.length} photos/videos from Cloudinary (failures are logged above)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
