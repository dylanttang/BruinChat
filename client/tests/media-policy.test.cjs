const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadModule = require('./helpers/load-module.cjs');
const policy = loadModule('lib/mediaPolicy.ts');

test('picker validation and upload validation share image/video byte limits', () => {
  assert.equal(policy.mediaSizeError('image', policy.MAX_IMAGE_BYTES), null);
  assert.match(policy.mediaSizeError('image', policy.MAX_IMAGE_BYTES + 1), /10 MB/);
  assert.equal(policy.mediaSizeError('video', 30 * 1024 * 1024), null);
  assert.equal(policy.mediaSizeError('video', policy.MAX_VIDEO_BYTES), null);
  assert.match(policy.mediaSizeError('video', policy.MAX_VIDEO_BYTES + 1), /50 MB/);
  assert.equal(policy.mediaSizeError('video', undefined), null);
  assert.match(policy.mediaSizeError('video', NaN), /file size/);
  assert.ok(policy.MAX_VIDEO_BYTES < 100 * 1024 * 1024);
});

test('iOS picker requests H.264 720p export, medium recording quality and a 60-second recording cap', () => {
  const picker = loadModule('lib/mediaPicker.ts', {
    './mediaPolicy': policy,
    'expo-image-picker': {
      VideoExportPreset: { H264_1280x720: 'H264_720' },
      UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
      UIImagePickerControllerQualityType: { Medium: 'medium' },
    },
  });
  assert.equal(picker.LIBRARY_MEDIA_OPTIONS.videoExportPreset, 'H264_720');
  assert.equal(picker.LIBRARY_MEDIA_OPTIONS.preferredAssetRepresentationMode, 'compatible');
  assert.equal(picker.LIBRARY_MEDIA_OPTIONS.allowsMultipleSelection, true);
  assert.equal(picker.LIBRARY_MEDIA_OPTIONS.quality, 0.85);
  assert.equal(picker.CAMERA_MEDIA_OPTIONS.videoExportPreset, 'H264_720');
  assert.equal(picker.CAMERA_MEDIA_OPTIONS.videoQuality, 'medium');
  assert.equal(picker.CAMERA_MEDIA_OPTIONS.videoMaxDuration, 60);
});
