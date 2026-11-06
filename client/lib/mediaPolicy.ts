export type MediaKind = 'image' | 'video';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// Cloudinary account verified on 2026-11-06: images 10 MiB, videos 100 MiB.
// Stay below both the plan allowance and the single-request upload threshold.
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 60;

export class MediaUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaUploadError';
  }
}

export function maxMediaBytes(type: MediaKind): number {
  return type === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

export function mediaLimitMessage(type: MediaKind, limit = maxMediaBytes(type)): string {
  const mb = Math.round((limit / (1024 * 1024)) * 10) / 10;
  return type === 'video'
    ? `Videos must be ${mb} MB or smaller. Try a shorter video.`
    : `Photos must be ${mb} MB or smaller.`;
}

export function mediaSizeError(type: MediaKind, bytes?: number): string | null {
  if (bytes === undefined) return null; // Checked from the actual file before upload.
  if (!Number.isFinite(bytes) || bytes < 0) return 'Could not read the file size. Please select the file again.';
  return bytes > maxMediaBytes(type) ? mediaLimitMessage(type) : null;
}
