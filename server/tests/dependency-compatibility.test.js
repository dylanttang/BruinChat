import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import multer from 'multer';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import WebSocket from 'ws';

test('patched multipart parser and Socket.IO WebSocket transport still handle requests', async () => {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 } });
  app.post('/upload', upload.single('media'), (req, res) => res.json({ size: req.file.size, text: req.file.buffer.toString() }));
  const server = createServer(app);
  const io = new Server(server);
  io.on('connection', socket => socket.emit('ready', { ok: true }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const body = new FormData(); body.append('media', new Blob(['test image']), 'test.jpg');
    const response = await fetch(base + '/upload', { method: 'POST', body });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { size: 10, text: 'test image' });
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
