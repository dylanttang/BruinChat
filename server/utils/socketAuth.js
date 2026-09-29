import mongoose from 'mongoose';
import Chat from '../../models/Chat.js';
import { authenticateToken } from '../middleware/devAuth.js';

// Socket.IO handshake middleware. The client must send its app JWT as
// `auth: { token }`; the connection is refused otherwise. socket.userId is
// set from the verified token, never from anything the client claims.
export async function socketAuth(socket, next) {
  try {
    const { user, error } = await authenticateToken(socket.handshake.auth?.token);
    if (!user) return next(new Error(error));
    if (user.bannedAt) return next(new Error('Your account has been banned'));

    socket.userId = user._id.toString();
    return next();
  } catch (err) {
    console.error('Socket auth error:', err);
    return next(new Error('Authentication failed'));
  }
}

// Per-connection chat events. Joining a chat's room (which is how live
// messages are delivered) requires being a member of that chat.
export function registerChatHandlers(socket) {
  socket.on('joinChat', async (chatId, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (!mongoose.Types.ObjectId.isValid(chatId)) return reply({ ok: false, error: 'Invalid chat ID' });

      const isMember = await Chat.exists({ _id: chatId, members: socket.userId });
      if (!isMember) return reply({ ok: false, error: 'You are not a member of this chat' });

      socket.join(chatId);
      return reply({ ok: true });
    } catch (err) {
      console.error('joinChat error:', err);
      return reply({ ok: false, error: 'Failed to join chat' });
    }
  });

  socket.on('leaveChat', (chatId) => {
    if (typeof chatId === 'string') socket.leave(chatId);
  });

  // Only relayed to rooms the socket actually joined (i.e. chats it's a
  // member of), and always attributed to the authenticated user.
  socket.on('typing', ({ chatId, isTyping } = {}) => {
    if (typeof chatId !== 'string' || !socket.rooms.has(chatId)) return;
    socket.to(chatId).emit('typing', { chatId, userId: socket.userId, isTyping: !!isTyping });
  });
}
