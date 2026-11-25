const mongoose = require('mongoose');

// What a chat is. Older chats have no kind until scripts/backfillChatKind.js
// runs; Chat.kindOf() falls back to the same rule the backfill uses.
//   class  — one per course, members come from enrollment
//   direct — two people
//   group  — a group DM people made themselves (#116)
//   team   — other group chats: the BChat Team chat, the review demo chat
const CHAT_KINDS = ['class', 'direct', 'group', 'team'];

const chatSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Optional while older chats are backfilled; becomes required after.
    kind: { type: String, enum: CHAT_KINDS },
    directKey: { type: String },
    // Kept for app versions that read it: false only for direct chats.
    isGroup: { type: Boolean, default: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessageAt: { type: Date, default: null },
    archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  },
  { timestamps: true }
);

chatSchema.index({ directKey: 1 }, { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } });
chatSchema.index({ members: 1 });
chatSchema.index({ lastMessageAt: -1, _id: -1 });
chatSchema.index({ members: 1, kind: 1, lastMessageAt: -1, _id: -1 });
// Partial unique index: enforces one chat per course, but allows chats
// without a course field (e.g. direct messages, team group chats)
chatSchema.index(
  { course: 1 },
  { unique: true, partialFilterExpression: { course: { $exists: true } } }
);

// The kind of a chat, stored or (for chats not backfilled yet) inferred the
// way the app always has: isGroup false means direct (the app shows it as a
// DM, so DM protections must apply even if a course is somehow set), a course
// means class, anything else is a team chat. Group DMs are always created
// with a kind.
chatSchema.statics.kindOf = function kindOf(chat) {
  if (chat?.kind) return chat.kind;
  if (chat?.isGroup === false) return 'direct';
  if (chat?.course) return 'class';
  return 'team';
};
chatSchema.statics.KINDS = CHAT_KINDS;

module.exports = mongoose.model('Chat', chatSchema);
