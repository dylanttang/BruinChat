import { Router } from 'express';
import mongoose from 'mongoose';
import Report from '../../models/Report.js';
import User from '../../models/User.js';
import Message from '../../models/Message.js';
import Chat from '../../models/Chat.js';
import { adminAuth } from '../middleware/adminAuth.js';
import { sendPush } from '../utils/push.js';

const router = Router();

const USER_FIELDS = '_id displayName avatarUrl bannedAt mutedUntil deletedAt moderationHistory';
const MUTE_DAYS = [1, 7, 30];
const REASON_LABELS = {
  spam: 'spam',
  harassment: 'harassment',
  inappropriate_content: 'inappropriate content',
  hate_speech: 'hate speech',
  other: 'breaking the rules',
};

// A user's moderation history, newest first.
function historyOf(user) {
  return [...(user?.moderationHistory ?? [])].sort((a, b) => new Date(b.at) - new Date(a.at));
}

function summarizeUser(user) {
  if (!user) return null;
  return {
    _id: user._id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bannedAt: user.bannedAt,
    mutedUntil: user.mutedUntil,
    deletedAt: user.deletedAt,
    priorActionCount: user.moderationHistory?.length ?? 0,
  };
}

// Resolve a report target to what a moderator needs to see: the message (with
// sender and chat) or the user, plus the user who'd be acted on.
async function loadTarget(targetType, targetId) {
  if (targetType === 'message') {
    const message = await Message.findById(targetId)
      .populate('senderId', USER_FIELDS)
      .populate('chatId', '_id name')
      .lean();
    if (!message) return { target: null, targetUser: null };
    return {
      target: {
        _id: message._id,
        text: message.text,
        mediaUrls: message.mediaUrls?.length ? message.mediaUrls : message.mediaUrl ? [message.mediaUrl] : [],
        deletedAt: message.deletedAt,
        createdAt: message.createdAt,
        chat: message.chatId,
      },
      targetUser: message.senderId,
    };
  }

  const user = await User.findById(targetId).select(USER_FIELDS).lean();
  return { target: user ? { _id: user._id } : null, targetUser: user };
}

// ---------------------------------------------------------------------------
// GET /api/admin/reports?status=pending|resolved
//
// pending:  one entry per reported message/user (reports on the same target
//           are grouped), oldest first so nothing sits past the 24h promise.
// resolved: the 50 most recently resolved reports, newest first.
//
// Response: { items: [...], pendingCount }
// ---------------------------------------------------------------------------
router.get('/reports', adminAuth, async (req, res) => {
  try {
    const resolved = req.query.status === 'resolved';

    const groups = resolved
      ? await Report.aggregate([
          { $match: { status: { $ne: 'pending' } } },
          { $sort: { resolvedAt: -1 } },
          { $limit: 50 },
          {
            $project: {
              targetType: 1, targetId: 1, status: 1, actions: 1, muteDays: 1,
              resolutionNote: 1, resolvedAt: 1,
              reasons: ['$reason'], reportCount: { $literal: 1 },
              firstReportedAt: '$createdAt',
            },
          },
        ])
      : await Report.aggregate([
          { $match: { status: 'pending' } },
          {
            $group: {
              _id: { targetType: '$targetType', targetId: '$targetId' },
              reasons: { $addToSet: '$reason' },
              reportCount: { $sum: 1 },
              firstReportedAt: { $min: '$createdAt' },
            },
          },
          { $sort: { firstReportedAt: 1 } },
          {
            $project: {
              _id: 0,
              targetType: '$_id.targetType',
              targetId: '$_id.targetId',
              reasons: 1, reportCount: 1, firstReportedAt: 1,
            },
          },
        ]);

    const items = await Promise.all(
      groups.map(async (group) => {
        const { target, targetUser } = await loadTarget(group.targetType, group.targetId);
        return { ...group, target, targetUser: summarizeUser(targetUser) };
      })
    );

    const pendingTargets = await Report.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: '$targetId' } },
      { $count: 'n' },
    ]);

    res.json({ items, pendingCount: pendingTargets[0]?.n ?? 0 });
  } catch (err) {
    console.error('GET /api/admin/reports error:', err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/reports/:targetType/:targetId — Everything needed to decide
//
// Response: {
//   targetType, target, targetUser,
//   reports:  every report on this target (reporter, reason, details, status)
//   context:  message reports -> up to 4 messages before and after it
//             user reports    -> their 10 most recent messages
//   history:  moderation actions previously taken against targetUser
// }
// ---------------------------------------------------------------------------
router.get('/reports/:targetType/:targetId', adminAuth, async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    if (!['user', 'message'].includes(targetType) || !mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'Invalid report target' });
    }

    const { target, targetUser } = await loadTarget(targetType, targetId);

    const reports = await Report.find({ targetType, targetId })
      .sort({ createdAt: -1 })
      .populate('reporterId', '_id displayName')
      .populate('resolvedBy', '_id displayName')
      .lean();

    let context = [];
    const populateSender = (query) => query.populate('senderId', '_id displayName avatarUrl').lean();
    if (targetType === 'message' && target) {
      const [before, after] = await Promise.all([
        populateSender(Message.find({ chatId: target.chat._id, createdAt: { $lt: target.createdAt } }).sort({ createdAt: -1 }).limit(4)),
        populateSender(Message.find({ chatId: target.chat._id, createdAt: { $gt: target.createdAt } }).sort({ createdAt: 1 }).limit(4)),
      ]);
      const reported = await populateSender(Message.findById(target._id));
      context = [...before.reverse(), { ...reported, isReported: true }, ...after];
    } else if (targetType === 'user' && targetUser) {
      context = await Message.find({ senderId: targetUser._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('senderId', '_id displayName avatarUrl')
        .populate('chatId', '_id name')
        .lean();
    }

    // Moderator names for the history list.
    const history = historyOf(targetUser);
    const moderatorIds = [...new Set(history.map((h) => h.by?.toString()).filter(Boolean))];
    const moderators = await User.find({ _id: { $in: moderatorIds } }).select('_id displayName').lean();
    const moderatorName = Object.fromEntries(moderators.map((m) => [m._id.toString(), m.displayName]));

    res.json({
      targetType,
      target,
      targetUser: summarizeUser(targetUser),
      reports,
      context,
      history: history.map((h) => ({ ...h, byName: h.by ? moderatorName[h.by.toString()] ?? null : null })),
    });
  } catch (err) {
    console.error('GET /api/admin/reports/:targetType/:targetId error:', err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/reports/resolve — Act on every pending report for a target
//
// Body: {
//   targetType: 'user' | 'message',
//   targetId,
//   action: 'dismiss' | 'warn' | 'mute' | 'ban',
//   removeMessage?: boolean,   // message reports only; combines with action
//   muteDays?: 1 | 7 | 30,     // required for 'mute'
//   note?: string              // internal, shown to admins only
// }
//
// The target user is told about warnings, mutes and removed messages the
// next time they open the app (moderationNotices) and by push notification.
// Every action except a plain dismissal is added to their moderationHistory.
//
// Response: { resolvedCount, status, actions }
// ---------------------------------------------------------------------------
router.post('/reports/resolve', adminAuth, async (req, res) => {
  try {
    const { targetType, targetId, action, removeMessage = false, muteDays, note = '' } = req.body;

    if (!['user', 'message'].includes(targetType) || !mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'Invalid report target' });
    }
    if (!['dismiss', 'warn', 'mute', 'ban'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    if (action === 'mute' && !MUTE_DAYS.includes(muteDays)) {
      return res.status(400).json({ error: 'muteDays must be 1, 7, or 30' });
    }
    if (removeMessage && targetType !== 'message') {
      return res.status(400).json({ error: 'removeMessage only applies to message reports' });
    }
    if (typeof note !== 'string' || note.length > 500) {
      return res.status(400).json({ error: 'note must be at most 500 characters' });
    }

    const pending = await Report.find({ targetType, targetId, status: 'pending' }).lean();
    if (pending.length === 0) {
      return res.status(409).json({ error: 'No pending reports for this target' });
    }

    const { target, targetUser } = await loadTarget(targetType, targetId);
    if (!targetUser) return res.status(404).json({ error: 'Reported user not found' });
    if (targetUser._id.toString() === req.user._id.toString() && action !== 'dismiss') {
      return res.status(400).json({ error: "You can't take action against yourself" });
    }

    const now = new Date();
    const reason = REASON_LABELS[pending[0].reason] ?? 'breaking the rules';
    const actions = [];
    const history = [];
    const notices = [];
    const userUpdate = {};

    if (removeMessage && target && !target.deletedAt) {
      const message = await Message.findById(targetId);
      message.text = '';
      message.mediaUrl = '';
      message.mediaUrls = [];
      message.mediaTypes = [];
      message.deletedAt = now;
      await message.save();

      const populated = await Message.findById(targetId)
        .populate('senderId', '_id displayName avatarUrl')
        .populate('reactions.userId', '_id displayName')
        .lean();
      req.io?.to(message.chatId.toString()).emit('messageDeleted', populated);

      actions.push('removed_message');
      history.push({ action: 'removed_message', messageText: target.text?.slice(0, 200) || null });
      notices.push({
        type: 'removal',
        message: `A message you posted in ${target.chat?.name ?? 'a chat'} was removed for ${reason}.`,
      });
    }

    if (action === 'warn') {
      actions.push('warned');
      history.push({ action: 'warned' });
      notices.push({
        type: 'warning',
        message: `You've received a warning for ${reason}. Further violations may lead to a mute or ban.`,
      });
    } else if (action === 'mute') {
      const until = new Date(now.getTime() + muteDays * 24 * 60 * 60 * 1000);
      userUpdate.mutedUntil = until;
      actions.push('muted');
      history.push({ action: 'muted', muteDays });
      notices.push({
        type: 'mute',
        message: `You've been muted for ${muteDays} day${muteDays === 1 ? '' : 's'} for ${reason}. You can read chats but can't post until ${until.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
      });
    } else if (action === 'ban') {
      userUpdate.bannedAt = now;
      actions.push('banned');
      history.push({ action: 'banned' });
    }

    const historyEntries = history.map((entry) => ({
      reason: pending[0].reason,
      note,
      by: req.user._id,
      at: now,
      muteDays: null,
      messageText: null,
      ...entry,
    }));
    const noticeEntries = notices.map((n) => ({ ...n, createdAt: now, seenAt: null }));

    if (historyEntries.length || noticeEntries.length || Object.keys(userUpdate).length) {
      await User.updateOne(
        { _id: targetUser._id },
        {
          ...(Object.keys(userUpdate).length ? { $set: userUpdate } : {}),
          $push: {
            moderationHistory: { $each: historyEntries },
            moderationNotices: { $each: noticeEntries },
          },
        }
      );
    }

    const status = actions.length ? 'actioned' : 'dismissed';
    const result = await Report.updateMany(
      { targetType, targetId, status: 'pending' },
      {
        $set: {
          status,
          actions,
          muteDays: action === 'mute' ? muteDays : null,
          resolvedBy: req.user._id,
          resolvedAt: now,
          resolutionNote: note,
        },
      }
    );

    // A ban takes effect on open sockets immediately, not just on the next
    // request.
    if (action === 'ban') req.io?.in(`user:${targetUser._id}`).disconnectSockets(true);

    // Let the user know right away if they have a device registered. Bans
    // are shown by the banned screen instead.
    const pushUser = await User.findById(targetUser._id).select('pushToken').lean();
    if (pushUser?.pushToken && notices.length) {
      sendPush([pushUser.pushToken], {
        title: 'BChat moderation',
        body: notices[notices.length - 1].message,
        data: { type: 'moderation' },
      });
    }

    res.json({ resolvedCount: result.modifiedCount, status, actions });
  } catch (err) {
    console.error('POST /api/admin/reports/resolve error:', err);
    res.status(500).json({ error: 'Failed to resolve report' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/(ban|unban|unmute) — Direct account actions,
// also recorded in the user's moderationHistory.
// ---------------------------------------------------------------------------
async function accountAction(req, res, { action, check, update }) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const conflict = check(user);
    if (conflict) return res.status(409).json({ error: conflict });

    const updated = await User.findByIdAndUpdate(
      user._id,
      {
        $set: update,
        $push: { moderationHistory: { action, note: req.body?.note ?? '', by: req.user._id, at: new Date() } },
      },
      { new: true }
    ).lean();

    if (action === 'banned') req.io?.in(`user:${user._id}`).disconnectSockets(true);

    return res.json({ user: summarizeUser(updated) });
  } catch (err) {
    console.error(`POST /api/admin/users/:id/${action} error:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

router.post('/users/:id/ban', adminAuth, (req, res) =>
  accountAction(req, res, {
    action: 'banned',
    check: (user) => (user.bannedAt ? 'User already banned' : null),
    update: { bannedAt: new Date() },
  })
);

router.post('/users/:id/unban', adminAuth, (req, res) =>
  accountAction(req, res, {
    action: 'unbanned',
    check: (user) => (user.bannedAt ? null : 'User is not banned'),
    update: { bannedAt: null },
  })
);

router.post('/users/:id/unmute', adminAuth, (req, res) =>
  accountAction(req, res, {
    action: 'unmuted',
    check: (user) => (user.mutedUntil && new Date(user.mutedUntil) > new Date() ? null : 'User is not muted'),
    update: { mutedUntil: null },
  })
);

export default router;
