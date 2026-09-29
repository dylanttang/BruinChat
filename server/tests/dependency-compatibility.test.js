import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import WebSocket from 'ws';

test('patched Socket.IO WebSocket transport still handles requests', async () => {
  const app = express();
  const server = createServer(app);
  const io = new Server(server);
  io.on('connection', socket => socket.emit('ready', { ok: true }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(base.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket');
      const timer = setTimeout(() => { socket.terminate(); reject(new Error('Socket.IO handshake timed out')); }, 3000);
      socket.on('message', data => {
        const packet = data.toString();
        if (packet.startsWith('0')) socket.send('40');
        if (packet.startsWith('42')) {
          try { assert.deepEqual(JSON.parse(packet.slice(2)), ['ready', { ok: true }]); clearTimeout(timer); socket.close(); resolve(); }
          catch (error) { clearTimeout(timer); socket.terminate(); reject(error); }
        }
      });
      socket.on('error', error => { clearTimeout(timer); reject(error); });
    });
  } finally {
    server.closeAllConnections(); await new Promise(resolve => io.close(resolve));
  }
});
