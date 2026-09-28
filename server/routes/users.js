import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Course from '../../models/Course.js';
import Message from '../../models/Message.js';
import Feedback from '../../models/Feedback.js';
import { v2 as cloudinary } from 'cloudinary';
import { deleteMessageMediaFiles } from '../utils/media.js';
import { devAuth } from '../middleware/devAuth.js';
import { authRateLimit, enrollmentRateLimit } from '../middleware/rateLimit.js';
import { CURRENT_TERMS_VERSION } from '../utils/terms.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/users/dev-list — List all users (for dev user picker before OAuth)
//
// TEMPORARY: Remove this once Google OAuth is implemented.
// ---------------------------------------------------------------------------
router.get('/dev-list', authRateLimit, async (req, res) => {
  try {
    const users = await User.find({ deletedAt: null }, '_id displayName username')
      .sort({ displayName: 1 })
      .lean();
    res.json({ users });
  } catch (err) {
    console.error('GET /api/users/dev-list error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/me — Return the current user with populated courses
// ---------------------------------------------------------------------------
router.get('/me', devAuth, async (req, res) => {
  try {
    // moderationHistory holds internal moderator notes; admins see it through
    // /api/admin, users only get their notices.
    const user = await User.findById(req.user._id)
      .select('-moderationHistory')
      .populate('courses')
      .lean();

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user, currentTermsVersion: CURRENT_TERMS_VERSION });
  } catch (err) {
    console.error('GET /api/users/me error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/users/me/terms — Record that the user accepted the current Terms
//
// Body: { version: string }  (must match CURRENT_TERMS_VERSION, so a client
// can't accept a version it never showed the user)
//
// Response: { termsAcceptedAt, termsVersion }
// ---------------------------------------------------------------------------
router.put('/me/terms', devAuth, async (req, res) => {
  try {
    const { version } = req.body;
    if (version !== CURRENT_TERMS_VERSION) {
      return res.status(400).json({
        error: 'Terms version is out of date',
        currentTermsVersion: CURRENT_TERMS_VERSION,
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { termsAcceptedAt: new Date(), termsVersion: CURRENT_TERMS_VERSION },
      { new: true }
    ).lean();

    res.json({ termsAcceptedAt: user.termsAcceptedAt, termsVersion: user.termsVersion });
  } catch (err) {
    console.error('PUT /api/users/me/terms error:', err);
    res.status(500).json({ error: 'Failed to record terms acceptance' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/users/me/courses — Replace the user's enrolled courses
//
// Body: { courseIds: string[] }
//
// Behavior:
//   - Validates all courseIds exist
//   - Diffs against the user's current courses
//   - For added courses: finds or creates the chat, adds the user as a member
//   - For removed courses: removes the user from the chat's members
//   - Saves the new courses array on the user
//
// Response: { user: User }  (with populated courses)
// ---------------------------------------------------------------------------
router.put('/me/courses', devAuth, enrollmentRateLimit, async (req, res) => {
  try {
    const { courseIds } = req.body;

    if (!Array.isArray(courseIds)) {
      return res.status(400).json({ error: 'courseIds must be an array' });
    }

    // Validate each courseId is a valid ObjectId format
    for (const id of courseIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: `Invalid course ID: ${id}` });
      }
    }

    // Verify all courses exist
    const courses = await Course.find({ _id: { $in: courseIds } }).lean();
    if (courses.length !== courseIds.length) {
      return res.status(400).json({ error: 'One or more course IDs do not exist' });
    }

    // Load the full user doc so we can see their current courses
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const oldIds = user.courses.map((id) => id.toString());
    const newIds = courseIds.map(String);

    const added = newIds.filter((id) => !oldIds.includes(id));
    const removed = oldIds.filter((id) => !newIds.includes(id));

    // For each added course: find or create the chat, add user to members
    for (const courseId of added) {
      const course = courses.find((c) => c._id.toString() === courseId);
      const chatName = `${course.subjectArea.trim()} ${course.number} — ${course.title}`;

      // Use findOneAndUpdate with upsert to avoid a race between two users picking
      // the same course at the same time
      await Chat.findOneAndUpdate(
        { course: course._id },
        {
          $setOnInsert: {
            name: chatName,
            isGroup: true,
            course: course._id,
            createdBy: user._id,
            lastMessageAt: null,
          },
          $addToSet: { members: user._id },
        },
        { upsert: true, new: true }
      );
    }

    // For each removed course: remove user from the chat's members
    if (removed.length > 0) {
      await Chat.updateMany(
        { course: { $in: removed } },
        { $pull: { members: user._id } }
      );
    }

    // Update the user's courses array
    user.courses = courseIds;
    await user.save();

    const populated = await User.findById(user._id).populate('courses').lean();
    res.json({ user: populated });
  } catch (err) {
    console.error('PUT /api/users/me/courses error:', err);
    res.status(500).json({ error: 'Failed to update courses' });
  }
});

// GET /api/users/me/stats
router.get('/me/stats', devAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [chatCount, messageCount] = await Promise.all([
      Chat.countDocuments({ members: userId }),
      Message.countDocuments({ senderId: userId }),
    ]);

    return res.json({
      courseCount: user.courses.length,
      chatCount,
      messageCount,
    });
  } catch (err) {
    console.error('GET /api/users/me/stats error:', err);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// PUT /api/users/me/notifications
router.put('/me/notifications', devAuth, async (req, res) => {
  try {
    const { notifEnabled, classNotif, replyNotif } = req.body;

    const update = {};
    if (typeof notifEnabled === 'boolean') update.notifEnabled = notifEnabled;
    if (typeof classNotif === 'boolean') update.classNotif = classNotif;
    if (typeof replyNotif === 'boolean') update.replyNotif = replyNotif;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true })
      .select('notifEnabled classNotif replyNotif')
      .lean();

    return res.json(user);
  } catch (err) {
    console.error('PUT /api/users/me/notifications error:', err);
    return res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

// PUT /api/users/me/profile — Save year, major, goal
router.put('/me/profile', devAuth, async (req, res) => {
  try {
    const { year, major, goal } = req.body;
    const update = {};
    if (year !== undefined) update.year = year;
    if (major !== undefined) update.major = major;
    if (goal !== undefined) update.goal = goal;

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true })
      .populate('courses')
      .lean();
    res.json({ user });
  } catch (err) {
    console.error('PUT /api/users/me/profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /api/users/me/push-token
router.put('/me/push-token', devAuth, async (req, res) => {
  try {
    const { pushToken } = req.body;

    if (pushToken !== null && typeof pushToken !== 'string') {
      return res.status(400).json({ error: 'pushToken must be a string or null' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { pushToken: pushToken ?? null },
      { new: true }
    ).lean();

    return res.json({ pushToken: user.pushToken });
  } catch (err) {
    console.error('PUT /api/users/me/push-token error:', err);
    return res.status(500).json({ error: 'Failed to update push token' });
  }
});

// PUT /api/users/me/avatar
router.put('/me/avatar', devAuth, async (req, res) => {
  try {
    const { avatarUrl } = req.body;

    if (typeof avatarUrl !== 'string' || !avatarUrl.startsWith('https://res.cloudinary.com/')) {
      return res.status(400).json({ error: 'avatarUrl must be a Cloudinary URL' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatarUrl },
      { new: true }
    ).lean();

    return res.json({ avatarUrl: user.avatarUrl });
  } catch (err) {
    console.error('PUT /api/users/me/avatar error:', err);
    return res.status(500).json({ error: 'Failed to update avatar' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/me/notices/seen — Mark all moderation notices as seen
//
// The app shows unseen notices (warnings, mutes, removed messages) once when
// it opens, then calls this.
// ---------------------------------------------------------------------------
router.post('/me/notices/seen', devAuth, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user._id },
      { $set: { 'moderationNotices.$[unseen].seenAt': new Date() } },
      { arrayFilters: [{ 'unseen.seenAt': null }] }
    );
    res.status(204).end();
  } catch (err) {
    console.error('POST /api/users/me/notices/seen error:', err);
    res.status(500).json({ error: 'Failed to update notices' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/me/blocked — Users the current user has blocked
//
// Response: { users: [{ _id, displayName, avatarUrl }] }
// ---------------------------------------------------------------------------
router.get('/me/blocked', devAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('blockedUsers', '_id displayName avatarUrl')
      .lean();
    res.json({ users: user?.blockedUsers ?? [] });
  } catch (err) {
    console.error('GET /api/users/me/blocked error:', err);
    res.status(500).json({ error: 'Failed to fetch blocked users' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/:id/block — Block a user
// DELETE /api/users/:id/block — Unblock a user
//
// Blocking hides the target's messages from the current user (history, chat
// previews, live messages on the client) and stops push notifications from
// them. It's one-way: the blocked user isn't told and can still see the
// blocker's messages in shared class chats.
//
// Response: { blockedUsers: string[] }
// ---------------------------------------------------------------------------
router.post('/:id/block', devAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    if (targetId === req.user._id.toString()) {
      return res.status(400).json({ error: "You can't block yourself" });
    }

    const target = await User.findById(targetId).select('_id').lean();
    if (!target) return res.status(404).json({ error: 'User not found' });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { blockedUsers: target._id } },
      { new: true }
    ).lean();

    res.json({ blockedUsers: user.blockedUsers });
  } catch (err) {
    console.error('POST /api/users/:id/block error:', err);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

router.delete('/:id/block', devAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { blockedUsers: targetId } },
      { new: true }
    ).lean();

    res.json({ blockedUsers: user.blockedUsers });
  } catch (err) {
    console.error('DELETE /api/users/:id/block error:', err);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// Best-effort removal of an avatar we host on Cloudinary. Google profile
// photo URLs aren't ours, so those are skipped.
async function deleteCloudinaryAvatar(avatarUrl) {
  const match = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?(avatars\/[^.]+)/.exec(avatarUrl || '');
  if (!match || !process.env.CLOUDINARY_API_SECRET) return;

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  try {
    await cloudinary.uploader.destroy(match[1]);
  } catch (err) {
    console.error('Failed to delete Cloudinary avatar:', err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/users/me — Permanently delete the current user's account
//
// Matches the Privacy Policy (docs/legal/privacy-policy.md, section 6):
//   - Messages they sent are cleared the same way as a single-message delete
//     (text and media removed, a "deleted" placeholder stays in the chat)
//   - Their reactions are removed from other people's messages
//   - They're removed from every chat, and their feedback is deleted
//   - The user document becomes a tombstone named "Deleted user" with no
//     personal data, so old messages still resolve a sender
//   - Banned users keep their email and Google ID on the tombstone so they
//     can't sign up again (Privacy Policy section 5)
//   - Reports they filed or that are about them are kept (section 5)
//
// Every step is idempotent, so a failed request can simply be retried.
//
// Response: 204
// ---------------------------------------------------------------------------
router.delete('/me', devAuth, async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    const sentMedia = await Message.find({ senderId: userId })
      .select('mediaUrl mediaUrls')
      .lean();
    sentMedia.forEach(deleteMessageMediaFiles);

    await Message.updateMany(
      { senderId: userId, deletedAt: null },
      { $set: { text: '', mediaUrl: '', mediaUrls: [], mediaTypes: [], deletedAt: now } }
    );
    await Message.updateMany(
      { 'reactions.userId': userId },
      { $pull: { reactions: { userId } } }
    );
    await Chat.updateMany(
      { $or: [{ members: userId }, { archivedBy: userId }] },
      { $pull: { members: userId, archivedBy: userId } }
    );
    await Feedback.deleteMany({ userId });
    await deleteCloudinaryAvatar(req.user.avatarUrl);

    const tombstone = {
      $set: {
        username: `deleted-${userId}`,
        displayName: 'Deleted user',
        avatarUrl: '',
        emailVerified: false,
        courses: [],
        pushToken: null,
        year: null,
        major: null,
        goal: null,
        blockedUsers: [],
        termsAcceptedAt: null,
        termsVersion: null,
        deletedAt: now,
      },
    };
    if (!req.user.bannedAt) {
      // $unset rather than null: the email/googleId indexes are sparse, so a
      // missing field frees the value for a future sign-up.
      tombstone.$unset = { email: '', googleId: '' };
    }
    await User.updateOne({ _id: userId }, tombstone);

    res.status(204).end();
  } catch (err) {
    console.error('DELETE /api/users/me error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;
