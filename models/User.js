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
    // While in the future, the user can read but not post, react or edit.
    mutedUntil: { type: Date, default: null },
    // Moderation messages shown to the user the next time they open the app
    // (warnings, mutes, removed messages). seenAt is set once acknowledged.
    moderationNotices: [
      {
        type: { type: String, enum: ['warning', 'mute', 'removal'], required: true },
        message: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        seenAt: { type: Date, default: null },
      },
    ],
    // Every moderation action taken against this user (dismissals aren't
    // recorded). Shown to admins when reviewing new reports about them.
    moderationHistory: [
      {
        action: { type: String, enum: ['removed_message', 'warned', 'muted', 'banned', 'unmuted', 'unbanned'], required: true },
        reason: { type: String, default: null },
        note: { type: String, default: '' },
        muteDays: { type: Number, default: null },
        messageText: { type: String, default: null },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        at: { type: Date, default: Date.now },
      },
    ],
    pushToken: { type: String, maxlength: 4096, default: null },
    notifEnabled: { type: Boolean, default: true },
    classNotif: { type: Boolean, default: true },
    replyNotif: { type: Boolean, default: true },
    year: { type: String, maxlength: 32, default: null },
    major: { type: String, maxlength: 120, default: null },
    goal: { type: String, maxlength: 1000, default: null },
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

