const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, trim: true, default: '' },
    mediaUrl: { type: String, default: '' },
    mediaUrls: [{ type: String }],
    mediaTypes: [{ type: String, enum: ['image', 'video'] }],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ chatId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
