const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, lowercase: true },
    displayName: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: '' },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    // NOTE: for now we seed fake users without auth; later replace this with hashedPassword, etc.
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    bannedAt: { type: Date, default: null },
    pushToken: { type: String, default: null },
    notifEnabled: { type: Boolean, default: true },
    classNotif: { type: Boolean, default: true },
    replyNotif: { type: Boolean, default: true },
    year: { type: String, default: null },
    major: { type: String, default: null },
    goal: { type: String, default: null },
  },
  { timestamps: true }
);

userSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);

