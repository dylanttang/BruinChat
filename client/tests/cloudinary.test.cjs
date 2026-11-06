const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');

function setup({ platform = 'ios', size = 1024, type = 'image', uploadStatus = 200, uploadError, uploadThrows = false, fileExists = true, signatureStatus = 200 } = {}) {
  const policy = loadModule('lib/mediaPolicy.ts');
  const requests = [], signatures = [], forms = [];
  class TestFormData {
    constructor() { this.fields = new Map(); forms.push(this); }
    append(key, value) { this.fields.set(key, value); }
  }
  const upload = loadModule('lib/cloudinary.ts', {
    'react-native': { Platform: { OS: platform } },
    'expo-file-system/legacy': { getInfoAsync: async () => ({ exists: fileExists, isDirectory: false, size }) },
    './mediaPolicy': policy,
    './api': { apiFetch: async path => {
      signatures.push(path);
      return { ok: signatureStatus === 200, status: signatureStatus, json: async () => ({
        signature: 'signed', timestamp: 123, apiKey: 'public-key', cloudName: 'test-cloud',
        folder: 'messages/student', type: 'authenticated', publicId: 'messages/student/asset', overwrite: false,
      }) };
    } },
  }, {
    FormData: TestFormData,
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (!init) return { ok: true, blob: async () => ({ size, type: type === 'video' ? 'video/mp4' : 'image/jpeg' }) };
      if (uploadThrows) throw new TypeError('Network request failed');
      return { ok: uploadStatus === 200, status: uploadStatus, json: async () => uploadError
        ? { error: { message: uploadError } }
        : { type: 'authenticated', resource_type: type, public_id: 'messages/student/asset', version: 1, format: type === 'video' ? 'mp4' : 'jpg' } };
    },
  });
  return { ...upload, policy, requests, signatures, forms };
}

test('native video above the old 10 MB limit uploads from its URI without fetching a blob', async () => {
  const h = setup({ type: 'video', size: 30 * 1024 * 1024 });
  const reference = await h.uploadToCloudinary('file:///compressed.mp4', 'messages', { type: 'video', mimeType: 'video/mp4' });
  assert.equal(reference, 'https://res.cloudinary.com/test-cloud/video/authenticated/v1/messages/student/asset.mp4');
  assert.equal(h.requests.length, 1);
  assert.match(h.requests[0].url, /\/video\/upload$/);
  assert.equal(h.forms[0].fields.get('file').uri, 'file:///compressed.mp4');
  assert.equal(h.forms[0].fields.get('upload_preset'), 'bruinchat_signed');
  assert.equal(h.forms[0].fields.get('type'), 'authenticated');
  assert.equal(h.forms[0].fields.get('signature'), 'signed');
});

test('native MOV uses its correct filename and MIME type when metadata is missing', async () => {
  const h = setup({ type: 'video' });
  await h.uploadToCloudinary('file:///capture.MOV', 'messages', { type: 'video' });
  assert.equal(h.forms[0].fields.get('file').name, 'upload.mov');
  assert.equal(h.forms[0].fields.get('file').type, 'video/quicktime');
});

test('photos and avatars retain the 10 MB boundary and image upload path', async () => {
  const h = setup({ size: 10 * 1024 * 1024 });
  assert.match(await h.uploadToCloudinary('file:///photo.jpg', 'avatars'), /\/image\/authenticated\//);
  assert.match(h.requests[0].url, /\/image\/upload$/);
  const tooBig = setup({ size: 10 * 1024 * 1024 + 1 });
  await assert.rejects(tooBig.uploadToCloudinary('file:///photo.jpg', 'avatars'), /Photos must be 10 MB or smaller/);
  assert.equal(tooBig.signatures.length, 0);
});

test('actual video bytes are checked even when picker metadata is missing or stale', async () => {
  const h = setup({ type: 'video', size: 50 * 1024 * 1024 + 1 });
  await assert.rejects(h.uploadToCloudinary('file:///video.mp4', 'messages', { type: 'video' }), /Videos must be 50 MB or smaller/);
  assert.equal(h.signatures.length, 0);
  assert.equal(h.requests.length, 0);
  const boundary = setup({ type: 'video', size: 50 * 1024 * 1024 });
  await boundary.uploadToCloudinary('file:///video.mp4', 'messages', { type: 'video' });
});

test('web still uses a Blob and the resource-specific size limit', async () => {
  const h = setup({ platform: 'web', type: 'video', size: 20 * 1024 * 1024 });
  await h.uploadToCloudinary('blob:video', 'messages', { type: 'video' });
  assert.equal(h.requests.length, 2);
  assert.equal(h.forms[0].fields.get('file').size, 20 * 1024 * 1024);
});

test('Cloudinary size, format and upload-rate failures reach the user clearly', async () => {
  const size = setup({ type: 'video', uploadStatus: 400, uploadError: 'File size too large. Got 12000000. Maximum is 10485760.' });
  await assert.rejects(size.uploadToCloudinary('file:///video.mp4', 'messages', { type: 'video' }), /Videos must be 10 MB or smaller/);
  const format = setup({ type: 'video', uploadStatus: 400, uploadError: 'Video format not allowed' });
  await assert.rejects(format.uploadToCloudinary('file:///video.mp4', 'messages', { type: 'video' }), /MP4 or MOV/);
  const rate = setup({ signatureStatus: 429 });
  await assert.rejects(rate.uploadToCloudinary('file:///photo.jpg', 'messages'), /Too many uploads/);
});

test('missing or empty files cannot request signatures, and avatars cannot be videos', async () => {
  for (const options of [{ fileExists: false }, { size: 0 }]) {
    const h = setup(options);
    await assert.rejects(h.uploadToCloudinary('file:///gone.jpg', 'messages'), /select it again/i);
    assert.equal(h.signatures.length, 0);
  }
  const h = setup({ type: 'video' });
  await assert.rejects(h.uploadToCloudinary('file:///video.mp4', 'avatars', { type: 'video' }), /photo for your avatar/);
});

test('network upload failures preserve an actionable media error for the conversation', async () => {
  const h = setup({ type: 'video', uploadThrows: true });
  await assert.rejects(h.uploadToCloudinary('file:///video.mp4', 'messages', { type: 'video' }), error => {
    assert.ok(error instanceof h.policy.MediaUploadError);
    assert.match(error.message, /Check your connection and try again/);
    return true;
  });
});
