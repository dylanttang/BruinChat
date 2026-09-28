const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['user', 'message'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: {
      type: String,
      enum: ['spam', 'harassment', 'inappropriate_content', 'hate_speech', 'other'],
      required: true,
    },
    details: { type: String, default: '' },
    // pending -> dismissed (no action) or actioned (see `actions`).
    // 'warned' and 'banned' are legacy values from before `actions` existed.
    status: {
      type: String,
      enum: ['pending', 'dismissed', 'actioned', 'warned', 'banned'],
      default: 'pending',
    },
    // What the moderator did, e.g. ['removed_message', 'muted'].
    actions: [{ type: String, enum: ['removed_message', 'warned', 'muted', 'banned'] }],
    muteDays: { type: Number, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: '' },
  },
  { timestamps: true }
);

// One active (pending) report per reporter+target pair
reportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = mongoose.model('Report', reportSchema);
