const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, maxlength: 64, required: true, trim: true, lowercase: true },
    email: { type: String, maxlength: 254, trim: true, lowercase: true },
    googleId: { type: String, maxlength: 255, trim: true },
    emailVerified: { type: Boolean, default: false },
    displayName: { type: String, maxlength: 100, required: true, trim: true },
    avatarUrl: { type: String, maxlength: 2048, default: '' },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    bannedAt: { type: Date, default: null },
    pushToken: { type: String, maxlength: 4096, default: null },
    notifEnabled: { type: Boolean, default: true },
    classNotif: { type: Boolean, default: true },
    replyNotif: { type: Boolean, default: true },
    year: { type: String, maxlength: 32, default: null },
    major: { type: String, maxlength: 120, default: null },
    goal: { type: String, maxlength: 1000, default: null },
  },
  { timestamps: true }
);

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);

