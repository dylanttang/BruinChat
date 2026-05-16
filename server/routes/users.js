import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Course from '../../models/Course.js';
import { devAuth } from '../middleware/devAuth.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/users/dev-list — List all users (for dev user picker before OAuth)
//
// TEMPORARY: Remove this once Google OAuth is implemented.
// ---------------------------------------------------------------------------
router.get('/dev-list', async (req, res) => {
  try {
    const users = await User.find({}, '_id displayName username')
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
    const user = await User.findById(req.user._id)
      .populate('courses')
      .lean();

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error('GET /api/users/me error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
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
router.put('/me/courses', devAuth, async (req, res) => {
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

export default router;
