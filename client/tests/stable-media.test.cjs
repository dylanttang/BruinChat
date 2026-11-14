const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

const { keepLoadedMedia, mediaIdentity } = loadModule('lib/stableMedia.ts');

const NOW = 1_800_000_000;
const signed = (publicId, expiresAt, signature = 'abc') =>
  `https://api.cloudinary.com/v1_1/cloud/image/download?api_key=k&expires_at=${expiresAt}&format=jpg&public_id=${encodeURIComponent(publicId)}&signature=${signature}&timestamp=${expiresAt - 3600}&type=authenticated`;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('the same photo under a new link keeps the link already on screen', () => {
  const before = { mediaUrls: [signed('messages/u/a', NOW + 3000, 'old')] };
  const after = { _id: 'm', reactions: ['❤️'], mediaUrls: [signed('messages/u/a', NOW + 3600, 'new')] };
  const kept = keepLoadedMedia(before, after, NOW);
  assert.deepEqual(plain(kept.mediaUrls), before.mediaUrls);
  assert.deepEqual(plain(kept.reactions), ['❤️']);
});

test('a link about to expire is swapped for the fresh one', () => {
  const before = { mediaUrls: [signed('messages/u/a', NOW + 300, 'old')] };
  const after = { mediaUrls: [signed('messages/u/a', NOW + 3600, 'new')] };
  assert.equal(keepLoadedMedia(before, after, NOW), after);
});

test('a different photo, or a different number of them, takes the new links', () => {
  const before = { mediaUrls: [signed('messages/u/a', NOW + 3000)] };
  assert.deepEqual(plain(keepLoadedMedia(before, { mediaUrls: [signed('messages/u/b', NOW + 3600)] }, NOW).mediaUrls), [signed('messages/u/b', NOW + 3600)]);
  assert.deepEqual(plain(keepLoadedMedia(before, { mediaUrls: [] }, NOW).mediaUrls), []);
});

test('our own just-sent photo keeps the file on the phone', () => {
  const before = { mediaUrls: ['file:///tmp/photo.jpg'] };
  const after = { mediaUrls: [signed('messages/u/a', NOW + 3600)] };
  assert.deepEqual(plain(keepLoadedMedia(before, after, NOW).mediaUrls), ['file:///tmp/photo.jpg']);
});

test('identity ignores the signature and expiry', () => {
  assert.equal(mediaIdentity(signed('messages/u/a', NOW, 'x')), mediaIdentity(signed('messages/u/a', NOW + 900, 'y')));
  assert.notEqual(mediaIdentity(signed('messages/u/a', NOW)), mediaIdentity(signed('messages/u/b', NOW)));
  assert.equal(mediaIdentity('https://example.com/a.jpg'), 'https://example.com/a.jpg');
});
