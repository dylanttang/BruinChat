# Video uploads

## Account and app limits

The Cloudinary Admin API was checked on November 6, 2026. The Free account's
`media_limits` reported:

- Images: 10,485,760 bytes (10 MiB).
- Videos: 104,857,600 bytes (100 MiB).

The app keeps photos and avatars at 10 MiB and limits videos to 50 MiB. The video
limit leaves headroom below both the account allowance and Cloudinary's
single-request upload threshold. Both picker validation and upload validation
use `client/lib/mediaPolicy.ts`; user-facing messages label these limits as MB.
Recheck the account limits before increasing them or changing Cloudinary accounts.

## Cloudinary preset

The live `bruinchat_signed` preset was updated through the Admin API to allow
`jpg, png, webp, gif, mp4, mov`. It remains signed (`unsigned: false`), and every
other preset setting was verified unchanged. This fixes existing clients' format
rejections, although they still have the old 10 MB cap until updated.

The server continues to sign `type=authenticated`, user-scoped folders, random
public IDs, and `overwrite=false`. No credentials or signed delivery links are
stored in this repository. Dashboard changes are not part of a Git deployment;
another Cloudinary environment must have the same formats enabled in its preset.

References: [upload presets](https://cloudinary.com/documentation/upload_presets)
and [uploading videos](https://cloudinary.com/documentation/upload_parameters#uploading_videos).

## Preparing and uploading files

`client/lib/mediaPicker.ts` asks the SDK 54 iOS image picker to export library
videos as compatible H.264/AAC MP4 at 720p. Camera recordings request medium
quality, the same export preset, and a 60-second recording limit. The existing
photo quality and multiple-selection behavior are preserved. Android and web do
not support the iOS export presets; their returned files still get the same size
checks. Library videos are not silently trimmed to the recording-duration cap.

Limits apply to the resulting exported file, not the original camera-roll size.
The uploader checks the actual native file with `expo-file-system/legacy` rather
than reading an entire video into a JavaScript Blob. Native multipart uploads
continue to use the file URI; web uploads continue to use a Blob. MOV uploads get
the QuickTime MIME type when picker metadata is missing.

Size, unsupported-format, connection, and upload-rate errors are actionable.
Known upload errors reach the chat alert instead of being replaced by “Please
try again.” Failed sends still restore the attachment and draft for retry.

Build a fresh development/TestFlight app when deploying so the native dependency
version matches the updated lockfile.

## Verification

- Client unit tests cover image/video size boundaries, native URI uploads, web
  Blobs, absent picker size metadata, MOV MIME fallback, picker export options,
  missing files, and readable provider errors.
- The existing server tests continue to cover private-media authorization and
  expiring delivery links.
- A live smoke test used synthetic 30-second portrait clips with audio, exported
  through AVFoundation's 720p preset. An input of 198,261,804 bytes produced an MP4
  of 35,637,989 bytes, comfortably above the former 10 MiB cap and below 50 MiB.
- The actual client uploader and mounted server routes uploaded MP4, MOV, and PNG
  using the live signed preset. MongoDB was replaced with test doubles; neither
  real database accounts nor stored chats were accessed.
- A second synthetic user read the messages through the authorized message
  endpoint. Their signed Cloudinary links returned all three assets. AVPlayer
  remotely played and sought both 30-second videos, with audio tracks present.
- All three synthetic Cloudinary assets were deleted after verification.

### Required device acceptance check

This has not yet been verified with a physical iPhone recording and a second
physical device. Before marking device acceptance complete:

1. Record a 30-second video in the app. Send it with a caption to another account.
2. On the recipient's device, confirm playback, audio, and seeking.
3. Select a 30-second video from the library and repeat. Check portrait orientation.
4. Send a photo and update an avatar to check image uploads.
5. Select a video that remains over 50 MB after export and a photo over 10 MB.
   Verify that each rejection names the relevant limit, and that valid files in a
   mixed selection can still be sent.
