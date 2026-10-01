import { Router } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
import User from '../../models/User.js';
import { devAuth } from '../middleware/devAuth.js';
import { serializeMedia } from '../utils/media.js';
import { validateMessage, validateText } from '../utils/validation.js';
import { sendPush } from '../utils/push.js';
import { messageSendRateLimit, reactionRateLimit } from '../middleware/rateLimit.js';
import { postingBlock } from '../utils/moderation.js';

const router = Router();
const CHAT_LIST_DEFAULT_LIMIT = 20;
const CHAT_LIST_MAX_LIMIT = 50;
const MAX_REACTION_LENGTH = 16;
const mediaLabelByType = {
  image: '[Photo]',
  video: '[Video]',
};
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const videoExtensions = new Set(['.mp4', '.mov', '.m4v', '.webm']);

function parseLimit(value, defaultLimit, maxLimit) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return defaultLimit;
  return Math.min(Math.max(parsed, 1), maxLimit);
}

function populateMessage(query, chatId) {
  return query
    .populate('senderId', '_id displayName avatarUrl')
    .populate('reactions.userId', '_id displayName')
    .populate({ path: 'replyTo', match: { chatId }, populate: { path: 'senderId', select: '_id displayName' } });
}

function getMessageMediaLabel(message) {
  const mediaType = message?.mediaTypes?.[0] || (message?.mediaUrl ? 'image' : null);
  return mediaLabelByType[mediaType] || '[Media]';
}

function inferMediaKindFromUrl(url) {
  const ext = path.extname(url || '').toLowerCase();
  if (videoExtensions.has(ext)) return 'video';
  if (imageExtensions.has(ext)) return 'image';
  return 'image';
}

// ---------------------------------------------------------------------------
// GET /api/chats — List the current user's chats (cursor-paginated)
//
// Query params:
//   before  — ObjectId of a chat; returns chats older than this one
//   limit   — number of chats to return (default 20, max 50)
//
// Response: { chats: [...], hasMore: boolean, nextCursor: string | null }
// ---------------------------------------------------------------------------
router.get('/', devAuth, async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, CHAT_LIST_DEFAULT_LIMIT, CHAT_LIST_MAX_LIMIT);
    const query = { members: req.user._id, archivedBy: { $ne: req.user._id } };

    if (req.query.before) {
      if (!mongoose.Types.ObjectId.isValid(req.query.before)) {
        return res.status(400).json({ error: 'Invalid "before" cursor' });
      }

      const cursorChat = await Chat.findOne({
        _id: req.query.before,
        members: req.user._id,
        archivedBy: { $ne: req.user._id },
      }).select('_id lastMessageAt').lean();

      if (!cursorChat) {
        return res.status(400).json({ error: 'Invalid "before" cursor' });
      }

      query.$or = cursorChat.lastMessageAt
        ? [
            { lastMessageAt: { $lt: cursorChat.lastMessageAt } },
            { lastMessageAt: null },
            { lastMessageAt: { $exists: false } },
            { lastMessageAt: cursorChat.lastMessageAt, _id: { $lt: cursorChat._id } },
          ]
        : [
            { lastMessageAt: cursorChat.lastMessageAt, _id: { $lt: cursorChat._id } },
          ];
    }

    const chats = await Chat.find(query)
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate('members', '_id displayName avatarUrl')
      .lean();

    const hasMore = chats.length > limit;
    if (hasMore) chats.pop();

    // Attach the most recent message text to each chat
    const chatIds = chats.map((c) => c._id);
    const latestMessages = await Message.aggregate([
      { $match: { chatId: { $in: chatIds }, senderId: { $nin: req.user.blockedUsers || [] } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$chatId',
          text: { $first: '$text' },
          mediaUrl: { $first: '$mediaUrl' },
          mediaUrls: { $first: '$mediaUrls' },
          mediaTypes: { $first: '$mediaTypes' },
          senderId: { $first: '$senderId' },
        },
      },
    ]);
    const latestByChat = Object.fromEntries(latestMessages.map((m) => [m._id.toString(), m]));

    const enriched = chats.map((c) => ({
      ...c,
      lastMessageText:
        latestByChat[c._id.toString()]?.text ||
        (latestByChat[c._id.toString()]?.mediaUrl ||
        latestByChat[c._id.toString()]?.mediaUrls?.length
          ? getMessageMediaLabel(latestByChat[c._id.toString()])
          : null),
    }));

    res.json({
      chats: enriched,
      hasMore,
      nextCursor: hasMore && enriched.length > 0
        ? enriched[enriched.length - 1]._id.toString()
        : null,
    });
  } catch (err) {
    console.error('GET /api/chats error:', err);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/chats/archived — List chats archived by the current user
// ---------------------------------------------------------------------------
router.get('/archived', devAuth, async (req, res) => {
  try {
    const chats = await Chat.find({
      members: req.user._id,
      archivedBy: req.user._id,
    })
      .sort({ lastMessageAt: -1 })
      .populate('members', '_id displayName avatarUrl')
      .lean();

    return res.json(chats);
  } catch (err) {
    console.error('GET /api/chats/archived error:', err);
    return res.status(500).json({ error: 'Failed to fetch archived chats' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/chats/:id/archive — Toggle archive status for current user
// Body: { archive: true | false }
// ---------------------------------------------------------------------------
router.put('/:id/archive', devAuth, async (req, res) => {
  try {
    const { archive } = req.body;

    if (typeof archive !== 'boolean') {
      return res.status(400).json({ error: 'archive must be a boolean' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    const chat = await Chat.findOne({ _id: req.params.id, members: req.user._id });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const update = archive
      ? { $addToSet: { archivedBy: req.user._id } }
      : { $pull: { archivedBy: req.user._id } };

    const updated = await Chat.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    return res.json(updated);
  } catch (err) {
    console.error('PUT /api/chats/:id/archive error:', err);
    return res.status(500).json({ error: 'Failed to update archive status' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/chats/:id — Get a single chat (populated members and course)
// ---------------------------------------------------------------------------
router.get('/:id', devAuth, async (req, res) => {
  try {
    const chatId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    const chat = await Chat.findById(chatId)
      .populate('members', '_id displayName avatarUrl')
      .populate('course')
      .lean();

    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const isMember = chat.members.some(
      (m) => m._id.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    res.json({ chat });
  } catch (err) {
    console.error('GET /api/chats/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/chats/:id/messages — Get messages in a chat (cursor-paginated)
//
// Query params:
//   before  — ObjectId of a message; returns messages older than this one
//   limit   — number of messages to return (default 50, max 100)
//
// Response: { messages: [...], hasMore: boolean }
// ---------------------------------------------------------------------------
router.get('/:id/messages', devAuth, async (req, res) => {
  try {
    const chatId = req.params.id;

    // Validate chat ID format
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    // Check chat exists
    const chat = await Chat.findById(chatId).lean();
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Check membership
    const isMember = chat.members.some(
      (memberId) => memberId.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    // Pagination
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    // Hide messages from anyone the viewer has blocked.
    const query = { chatId, senderId: { $nin: req.user.blockedUsers || [] } };

    if (req.query.before) {
      if (!mongoose.Types.ObjectId.isValid(req.query.before)) {
        return res.status(400).json({ error: 'Invalid "before" cursor' });
      }
      query._id = { $lt: new mongoose.Types.ObjectId(req.query.before) };
    }

    // Fetch one extra to determine hasMore
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('senderId', '_id displayName avatarUrl')
      .populate('reactions.userId', '_id displayName')
      .populate({ path: 'replyTo', match: { chatId }, populate: { path: 'senderId', select: '_id displayName' } })
      .lean();

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    res.json({ messages, hasMore });
  } catch (err) {
    console.error('GET /api/chats/:id/messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chats/:id/messages — Send a message
//
// Body: { text?: string, mediaUrl?: string }
//   At least one of text or mediaUrl must be non-empty.
//
// Response: 201 { message: {...} }
// ---------------------------------------------------------------------------
router.post('/:id/messages', devAuth, messageSendRateLimit, async (req, res) => {
  try {
    const blocked = postingBlock(req.user);
    if (blocked) return res.status(blocked.status).json(blocked.body);

    const chatId = req.params.id;

    // Validate chat ID format
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    // Check chat exists
    const chat = await Chat.findById(chatId).lean();
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Check membership
    const isMember = chat.members.some(
      (memberId) => memberId.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    // Validate body
    const { text, mediaUrl, mediaUrls, mediaTypes, replyTo } = req.body;
    const bodyError = validateMessage(req.body, req.user._id);
    if (bodyError) return res.status(400).json({ error: bodyError });
    if (replyTo && !(await Message.exists({ _id: replyTo, chatId, deletedAt: null }))) {
      return res.status(400).json({ error: 'Reply must reference a message in this chat' });
    }
    const cleanedMediaUrls = Array.isArray(mediaUrls)
      ? mediaUrls.filter((url) => typeof url === 'string' && url.trim()).map((url) => url.trim())
      : [];
    const cleanedMediaTypes = Array.isArray(mediaTypes)
      ? mediaTypes.filter((type) => type === 'image' || type === 'video')
      : cleanedMediaUrls.map(inferMediaKindFromUrl);
    if ((!text || !text.trim()) && (!mediaUrl || !mediaUrl.trim())) {
      if (cleanedMediaUrls.length === 0) {
        return res.status(400).json({ error: 'Message must include text or media' });
      }
    }

    // Create the message
    const message = await Message.create({
      chatId,
      senderId: req.user._id,
      text: text?.trim() || '',
      mediaUrl: mediaUrl?.trim() || cleanedMediaUrls[0] || '',
      mediaUrls: cleanedMediaUrls,
      mediaTypes: cleanedMediaTypes.slice(0, cleanedMediaUrls.length),
      ...(replyTo && mongoose.Types.ObjectId.isValid(replyTo) ? { replyTo } : {}),
    });

    // Update the chat's lastMessageAt
    await Chat.findByIdAndUpdate(chatId, { lastMessageAt: message.createdAt });

    // Populate sender info before returning
    const populated = await populateMessage(Message.findById(message._id), chatId).lean();

    if (req.io) {
      req.io.to(chatId).emit('newMessage', serializeMedia(populated));
    }

    // Fan out push notifications to members with tokens, excluding sender
    // Respect per-user notification preferences
    const recipients = await User.find({
      _id: { $in: chat.members, $ne: req.user._id },
      pushToken: { $ne: null },
      notifEnabled: true,
      blockedUsers: { $ne: req.user._id },
    }).select('pushToken classNotif replyNotif _id').lean();

    if (recipients.length > 0) {
      const isReply = !!populated.replyTo;
      const isClassChat = !!chat.course;

      const eligibleTokens = recipients
        .filter((u) => {
          if (isReply && u.replyNotif === false) return false;
          if (isClassChat && u.classNotif === false) return false;
          return true;
        })
        .map((u) => u.pushToken);

      if (eligibleTokens.length > 0) {
        const senderName = req.user.displayName || 'Someone';
        sendPush(eligibleTokens, {
          title: senderName,
          body: populated.text || '📎 Media',
          data: { chatId },
        });
      }
    }

    res.status(201).json({ message: populated });
  } catch (err) {
    console.error('POST /api/chats/:id/messages error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/chats/:chatId/messages/:id/react — Toggle a reaction on a message
//
// Body: { emoji: string }
//
// Response: { message: {...} }
// ---------------------------------------------------------------------------
router.post('/:chatId/messages/:id/react', devAuth, reactionRateLimit, async (req, res) => {
  try {
    const blocked = postingBlock(req.user);
    if (blocked) return res.status(blocked.status).json(blocked.body);

    const { chatId, id: messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(chatId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const emoji = typeof req.body.emoji === 'string' ? req.body.emoji.trim() : '';
    if (!emoji || emoji.length > MAX_REACTION_LENGTH) {
      return res.status(400).json({ error: 'emoji is required' });
    }

    const chat = await Chat.findById(chatId).lean();
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const isMember = chat.members.some(
      (memberId) => memberId.toString() === req.user._id.toString()
    );
    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    const accessChat = await Chat.findById(chatId).lean();
    if (!accessChat || !accessChat.members.some((member) => member.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    const message = await Message.findOne({ _id: messageId, chatId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (message.deletedAt) {
      return res.status(400).json({ error: 'Cannot react to a deleted message' });
    }

    // One reaction per person (like Instagram): reacting with the same emoji
    // removes it, and a different emoji replaces your old one. Clearing all of
    // the user's reactions also collapses any duplicates from before this rule.
    const userId = req.user._id.toString();
    const alreadyReactedWithThis = message.reactions.some(
      (reaction) => reaction.emoji === emoji && reaction.userId.toString() === userId
    );

    message.reactions = message.reactions.filter(
      (reaction) => reaction.userId.toString() !== userId
    );
    if (!alreadyReactedWithThis) {
      message.reactions.push({ emoji, userId: req.user._id });
    }

    await message.save();

    const populated = await populateMessage(Message.findById(message._id), chatId).lean();

    if (req.io) {
      req.io.to(chatId).emit('messageReacted', serializeMedia(populated));
    }

    res.json({ message: populated });
  } catch (err) {
    console.error('POST /api/chats/:chatId/messages/:id/react error:', err);
    res.status(500).json({ error: 'Failed to react to message' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/chats/:id/members/me — Leave a chat
// ---------------------------------------------------------------------------
router.delete('/:id/members/me', devAuth, async (req, res) => {
  try {
    const chatId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const userIdStr = req.user._id.toString();
    const isMember = chat.members.some((memberId) => memberId.toString() === userIdStr);

    if (!isMember) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    // Remove user
    chat.members = chat.members.filter((memberId) => memberId.toString() !== userIdStr);
    
    // If chat is course-linked (!isGroup) and empty, delete it
    if (!chat.isGroup && chat.members.length === 0) {
      await Chat.findByIdAndDelete(chatId);
      req.io?.in(`user:${userIdStr}`).socketsLeave(chatId);
      await Message.deleteMany({ chatId });
      return res.json({ message: 'Left chat and deleted empty course chat' });
    } else {
      await chat.save();
      req.io?.in(`user:${userIdStr}`).socketsLeave(chatId);
      return res.json({ message: 'Successfully left chat' });
    }
  } catch (err) {
    console.error('DELETE /api/chats/:id/members/me error:', err);
    res.status(500).json({ error: 'Failed to leave chat' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/chats/:chatId/messages/:id — Edit a message
// ---------------------------------------------------------------------------
router.put('/:chatId/messages/:id', devAuth, async (req, res) => {
  try {
    const blocked = postingBlock(req.user);
    if (blocked) return res.status(blocked.status).json(blocked.body);

    const { chatId, id: messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(chatId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const accessChat = await Chat.findById(chatId).lean();
    if (!accessChat || !accessChat.members.some((member) => member.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    const message = await Message.findOne({ _id: messageId, chatId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.senderId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the sender can edit this message' });
    }

    const { text } = req.body;
    if (validateText(text) || !text.trim()) {
      return res.status(400).json({ error: 'Message text must contain 1 to 4000 characters' });
    }

    message.text = text.trim();
    message.editedAt = new Date();
    await message.save();

    const populated = await populateMessage(Message.findById(message._id), chatId).lean();

    if (req.io) {
      req.io.to(chatId).emit('messageEdited', serializeMedia(populated));
    }

    res.json({ message: populated });
  } catch (err) {
    console.error('PUT /api/chats/:chatId/messages/:id error:', err);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/chats/:chatId/messages/:id — Delete a message
// ---------------------------------------------------------------------------
router.delete('/:chatId/messages/:id', devAuth, async (req, res) => {
  try {
    const { chatId, id: messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(chatId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const accessChat = await Chat.findById(chatId).lean();
    if (!accessChat || !accessChat.members.some((member) => member.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'You are not a member of this chat' });
    }

    const message = await Message.findOne({ _id: messageId, chatId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.senderId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the sender can delete this message' });
    }

    message.text = '';
    message.mediaUrl = '';
    message.mediaUrls = [];
    message.mediaTypes = [];
    message.deletedAt = new Date();
    await message.save();

    const populated = await populateMessage(Message.findById(message._id), chatId).lean();

    if (req.io) {
      req.io.to(chatId).emit('messageDeleted', serializeMedia(populated));
    }

    res.json({ message: populated });
  } catch (err) {
    console.error('DELETE /api/chats/:chatId/messages/:id error:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export default router;
