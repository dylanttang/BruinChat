const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, lowercase: true },
    email: { type: String, trim: true, lowercase: true },
    googleId: { type: String, trim: true },
    emailVerified: { type: Boolean, default: false },
    displayName: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: '' },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
    // NOTE: for now we seed fake users without auth; later replace this with hashedPassword, etc.
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    bannedAt: { type: Date, default: null },
    pushToken: { type: String, default: null },
  },
  { timestamps: true }
);

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);

