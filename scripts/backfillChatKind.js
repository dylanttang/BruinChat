// Gives every chat without a `kind` the kind the app has always inferred
// (same rule as Chat.kindOf): a course means class, isGroup false means
// direct, anything else is team. Safe to run more than once; it only touches
// chats that have no kind, and never changes isGroup, course or anything else.
//
//   NODE_PATH=server/node_modules node scripts/backfillChatKind.js           # dry run: counts only
//   NODE_PATH=server/node_modules node scripts/backfillChatKind.js --apply   # write, then verify
//
// Reads MONGODB_URI and MONGODB_DB from server/.env. Run on a dev database
// first, then on production only after the server code that writes `kind`
// is deployed (otherwise new chats could be created without one).
const Chat = require('../models/Chat');

const MISSING = { kind: null }; // matches a missing or null kind

// Order matters: a chat with a course is a class even if isGroup is false.
const RULES = [
  { kind: 'class', filter: { course: { $exists: true, $ne: null } } },
  { kind: 'direct', filter: { isGroup: false } },
  { kind: 'team', filter: {} },
];

async function backfillChatKinds({ apply = false, log = console.log } = {}) {
  const before = await Chat.countDocuments(MISSING);
  log(`${before} chat(s) without a kind${apply ? '' : ' (dry run, nothing will be written)'}.`);

  const planned = {};
  if (apply) {
    for (const { kind, filter } of RULES) {
      // timestamps: false leaves updatedAt alone; only kind changes.
      const result = await Chat.updateMany({ ...MISSING, ...filter }, { $set: { kind } }, { timestamps: false });
      planned[kind] = result.modifiedCount;
    }
  } else {
    // Count each rule against what earlier rules would not already claim.
    const claimed = [];
    for (const { kind, filter } of RULES) {
      planned[kind] = await Chat.countDocuments({ $and: [MISSING, filter, ...claimed.map((f) => ({ $nor: [f] }))] });
      claimed.push(filter);
    }
  }
  for (const { kind } of RULES) log(`  ${apply ? 'set' : 'would set'} ${kind}: ${planned[kind]}`);

  const odd = await Chat.countDocuments({ course: { $exists: true, $ne: null }, isGroup: false });
  if (odd) log(`  note: ${odd} chat(s) have a course and isGroup false; treated as class.`);

  const remaining = await Chat.countDocuments(MISSING);
  if (apply) log(remaining === 0 ? 'Verified: every chat has a kind.' : `WARNING: ${remaining} chat(s) still have no kind.`);

  const totals = Object.fromEntries(await Promise.all(Chat.KINDS.map(async (kind) => [kind, await Chat.countDocuments({ kind })])));
  log(`Chats by stored kind now: ${Chat.KINDS.map((kind) => `${kind} ${totals[kind]}`).join(', ')}, missing ${remaining}.`);
  return { before, planned, remaining, totals };
}

async function main() {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../server/.env') });
  const mongoose = require('mongoose');
  const { connectDB } = require('../config/db');
  const apply = process.argv.includes('--apply');
  const conn = await connectDB();
  try {
    console.log(`Database: ${process.env.MONGODB_DB || '(from MONGODB_URI)'}`);
    const { remaining } = await backfillChatKinds({ apply });
    if (apply && remaining !== 0) process.exitCode = 1;
  } finally {
    await conn.close();
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { backfillChatKinds };
