import Chat from '../../models/Chat.js';
import { authenticateToken } from './auth.js';

export function configureSockets(io) {
  io.use(async (socket, next) => {
    try {
      const { user, expiresAt } = await authenticateToken(socket.handshake.auth?.token);
      socket.data.userId = user._id.toString();
      socket.data.expiresAt = expiresAt;
      next();
    } catch { next(new Error('Authentication required')); }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);
    // Re-arm long lifetimes instead of overflowing Node's timer range.
    let expiryTimer;
    const expire = () => {
      const remaining = socket.data.expiresAt - Date.now();
      if (remaining <= 0) return socket.disconnect(true);
      expiryTimer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
      expiryTimer.unref?.();
    };
    expire();
    socket.on('disconnect', () => clearTimeout(expiryTimer));

    const isMember = async (chatId) => {
      if (typeof chatId !== 'string' || !/^[a-f0-9]{24}$/.test(chatId)) return false;
      // Re-check the account and token for each protected event.
      await authenticateToken(socket.handshake.auth?.token);
      return Boolean(await Chat.exists({ _id: chatId, members: userId }));
    };
    socket.on('joinChat', async (chatId, ack) => {
      try {
        if (!(await isMember(chatId))) throw new Error('Access denied');
        await socket.join(chatId);
        // A membership change can race the asynchronous join.
        if (!(await isMember(chatId))) {
          await socket.leave(chatId);
          throw new Error('Access denied');
        }
        if (typeof ack === 'function') ack({ ok: true });
      } catch {
        if (typeof chatId === 'string' && /^[a-f0-9]{24}$/.test(chatId)) await socket.leave(chatId);
        if (typeof ack === 'function') ack({ ok: false, error: 'Access denied' });
      }
    });
    socket.on('leaveChat', (chatId) => {
      if (typeof chatId === 'string' && /^[a-f0-9]{24}$/.test(chatId)) socket.leave(chatId);
    });
    socket.on('typing', async (data) => {
      if (!data || typeof data !== 'object') return;
      const { chatId, isTyping } = data;
      if (typeof isTyping !== 'boolean' || !socket.rooms.has(chatId)) return;
      try {
        if (!(await isMember(chatId))) { await socket.leave(chatId); return; }
        socket.to(chatId).emit('typing', { chatId, userId, isTyping });
      } catch { socket.disconnect(true); }
    });
  });
}
