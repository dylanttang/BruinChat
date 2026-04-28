import { Router } from 'express';
import mongoose from 'mongoose';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
import { devAuth } from '../middleware/devAuth.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/chats — List the current user's chats
// ---------------------------------------------------------------------------
router.get('/', devAuth, async (req, res) => {
  try {
    const chats = await Chat.find({ members: req.user._id })
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

    res.status(201).json({ message: populated });
  } catch (err) {
    console.error('POST /api/chats/:id/messages error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
