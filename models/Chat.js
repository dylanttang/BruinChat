const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isGroup: { type: Boolean, default: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessageAt: { type: Date, default: null },
    archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  },
  { timestamps: true }
);

chatSchema.index({ members: 1 });
chatSchema.index({ lastMessageAt: -1 });
// Partial unique index: enforces one chat per course, but allows chats
// without a course field (e.g. direct messages, team group chats)
chatSchema.index(
  { course: 1 },
  { unique: true, partialFilterExpression: { course: { $exists: true } } }
);

module.exports = mongoose.model('Chat', chatSchema);

