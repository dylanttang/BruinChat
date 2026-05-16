import { Router } from 'express';
import mongoose from 'mongoose';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
import User from '../../models/User.js';
import { devAuth } from '../middleware/devAuth.js';
import { sendPush } from '../utils/push.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/chats — List the current user's chats
// ---------------------------------------------------------------------------
router.get('/', devAuth, async (req, res) => {
  try {
    const chats = await Chat.find({ members: req.user._id, archivedBy: { $ne: req.user._id } })
      .sort({ lastMessageAt: -1 })
      .populate('members', '_id displayName avatarUrl')
      .lean();

    // Attach the most recent message text to each chat
    const chatIds = chats.map((c) => c._id);
    const latestMessages = await Message.aggregate([
      { $match: { chatId: { $in: chatIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$chatId', text: { $first: '$text' }, senderId: { $first: '$senderId' } } },
    ]);
    const latestByChat = Object.fromEntries(latestMessages.map((m) => [m._id.toString(), m]));

    const enriched = chats.map((c) => ({
      ...c,
      lastMessageText: latestByChat[c._id.toString()]?.text ?? null,
    }));

    res.json({ chats: enriched });
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
    const query = { chatId };

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
      .populate({ path: 'replyTo', populate: { path: 'senderId', select: '_id displayName' } })
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
router.post('/:id/messages', devAuth, async (req, res) => {
  try {
    if (req.user.bannedAt) {
      return res.status(403).json({ error: 'Your account has been banned' });
    }

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
    const { text, mediaUrl, replyTo } = req.body;
    if ((!text || !text.trim()) && (!mediaUrl || !mediaUrl.trim())) {
      return res.status(400).json({ error: 'Message must include text or mediaUrl' });
    }

    // Create the message
    const message = await Message.create({
      chatId,
      senderId: req.user._id,
      text: text?.trim() || '',
      mediaUrl: mediaUrl?.trim() || '',
      ...(replyTo && mongoose.Types.ObjectId.isValid(replyTo) ? { replyTo } : {}),
    });

    // Update the chat's lastMessageAt
    await Chat.findByIdAndUpdate(chatId, { lastMessageAt: message.createdAt });

    // Populate sender info before returning
    const populated = await Message.findById(message._id)
      .populate('senderId', '_id displayName avatarUrl')
      .populate({ path: 'replyTo', populate: { path: 'senderId', select: '_id displayName' } })
      .lean();

    if (req.io) {
      req.io.to(chatId).emit('newMessage', populated);
    }

    // Fan out push notifications to members with tokens, excluding sender
    // Respect per-user notification preferences
    const recipients = await User.find({
      _id: { $in: chat.members, $ne: req.user._id },
      pushToken: { $ne: null },
      notifEnabled: true,
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
      await Message.deleteMany({ chatId });
      return res.json({ message: 'Left chat and deleted empty course chat' });
    } else {
      await chat.save();
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
    const { chatId, id: messageId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(chatId) || !mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const message = await Message.findOne({ _id: messageId, chatId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.senderId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the sender can edit this message' });
    }

    const { text } = req.body;
    if (text === undefined || !text.trim()) {
      return res.status(400).json({ error: 'Message text cannot be empty' });
    }

    message.text = text.trim();
    message.editedAt = new Date();
    await message.save();

    const populated = await Message.findById(message._id)
      .populate('senderId', '_id displayName avatarUrl')
      .lean();

    if (req.io) {
      req.io.to(chatId).emit('messageEdited', populated);
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

    const message = await Message.findOne({ _id: messageId, chatId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.senderId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Only the sender can delete this message' });
    }

    message.text = '';
    message.mediaUrl = '';
    message.deletedAt = new Date();
    await message.save();

    const populated = await Message.findById(message._id)
      .populate('senderId', '_id displayName avatarUrl')
      .lean();

    if (req.io) {
      req.io.to(chatId).emit('messageDeleted', populated);
    }

    res.json({ message: populated });
  } catch (err) {
    console.error('DELETE /api/chats/:chatId/messages/:id error:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

export default router;
