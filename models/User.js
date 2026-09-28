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
    notifEnabled: { type: Boolean, default: true },
    classNotif: { type: Boolean, default: true },
    replyNotif: { type: Boolean, default: true },
    year: { type: String, default: null },
    major: { type: String, default: null },
    goal: { type: String, default: null },
    // Set when the user agrees to the Terms of Service / Privacy Policy.
    // termsVersion is compared against CURRENT_TERMS_VERSION on the server.
    termsAcceptedAt: { type: Date, default: null },
    termsVersion: { type: String, default: null },
    // Users this user has blocked. Their messages are hidden from this user
    // and they don't trigger push notifications for this user.
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Set when the account is deleted. The document stays as a tombstone
    // ("Deleted user", no personal data) so old messages still resolve.
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);

