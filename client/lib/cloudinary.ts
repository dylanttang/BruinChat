import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { apiFetch } from './api';
import { maxMediaBytes, mediaLimitMessage, mediaSizeError, MediaUploadError } from './mediaPolicy';

type UploadFolder = 'avatars' | 'messages';

type SignatureResponse = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  type: "authenticated";
  publicId: string;
  overwrite: false;
};

export async function uploadToCloudinary(
  uri: string,
  folder: UploadFolder,
  media?: { type: 'image' | 'video'; fileName?: string | null; mimeType?: string | null }
): Promise<string> {
  const type = media?.type || 'image';
  if (folder === 'avatars' && type === 'video') {
    throw new MediaUploadError('Choose a photo for your avatar.');
  }
  let blob: Blob | undefined;
  let size: number;
  try {
    if (Platform.OS === 'web') {
      const fileRes = await fetch(uri);
      if (!fileRes.ok) throw new Error('Cannot read selected file');
      blob = await fileRes.blob();
      size = blob.size;
    } else {
      // Stat the exported file instead of copying a whole video into JS memory.
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || info.isDirectory) throw new Error('File unavailable');
      size = info.size;
    }
  } catch {
    throw new MediaUploadError('Could not read this file. Please select it again.');
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new MediaUploadError('This file is empty or unreadable. Please select it again.');
  }
  const sizeError = mediaSizeError(type, size);
  if (sizeError) throw new MediaUploadError(sizeError);

  const sigRes = await apiFetch(`/api/upload/signature?folder=${folder}`);
  if (!sigRes.ok) {
    throw new MediaUploadError(sigRes.status === 429
      ? 'Too many uploads. Please wait a few minutes and try again.'
      : 'Media uploads are temporarily unavailable. Please try again.');
  }
  const { signature, timestamp, apiKey, cloudName, folder: uploadFolder, type: deliveryType, publicId, overwrite }: SignatureResponse =
    await sigRes.json();

  const formData = new FormData();
  const isMov = /\.mov(?:[?#]|$)/i.test(uri);
  const name = media?.fileName || (type === 'video' ? (isMov ? 'upload.mov' : 'upload.mp4') : 'upload.jpg');
  const mimeType = media?.mimeType || blob?.type || (type === 'video' ? (isMov ? 'video/quicktime' : 'video/mp4') : 'image/jpeg');
  if (Platform.OS === 'web') formData.append('file', blob, name);
  else formData.append('file', { uri, name, type: mimeType } as any);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder', uploadFolder);
  formData.append('type', deliveryType);
  formData.append('public_id', publicId);
  formData.append('overwrite', String(overwrite));
  formData.append('upload_preset', 'bruinchat_signed');

  let uploadRes: Response;
  try {
    uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`,
      { method: 'POST', body: formData }
    );
  } catch {
    throw new MediaUploadError('Could not upload this file. Check your connection and try again.');
  }

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    const message = (err as any)?.error?.message ?? '';
    if (uploadRes.status === 413 || /file size|too large/i.test(message)) {
      const maximum = message.match(/maximum(?:\s+(?:file\s+)?size)?(?:\s+is)?[:\s]+(\d+)/i);
      const providerLimit = maximum ? Number(maximum[1]) : 0;
      if (providerLimit > 0) {
        throw new MediaUploadError(mediaLimitMessage(type, Math.min(providerLimit, maxMediaBytes(type))));
      }
      throw new MediaUploadError(`Media storage rejected this file as too large. ${mediaLimitMessage(type)}`);
    }
    if (/format.*(?:not allowed|not supported|unsupported)|(?:not allowed|unsupported).*format/i.test(message)) {
      throw new MediaUploadError(type === 'video'
        ? 'This video format is not supported. Choose an MP4 or MOV video.'
        : 'This photo format is not supported. Choose JPG, PNG, WebP, or GIF.');
    }
    throw new MediaUploadError('Could not upload this file. Please try again.');
  }

  const data = await uploadRes.json();
  if (data.type !== 'authenticated' || data.resource_type !== type ||
      typeof data.public_id !== 'string' || !data.public_id.startsWith(`${uploadFolder}/`) ||
      !/^[a-zA-Z0-9]+$/.test(data.format) || !Number.isInteger(data.version)) {
    throw new Error('Upload did not return an authenticated asset');
  }
  // Keep an unsigned reference in MongoDB; the API issues expiring delivery links.
  return `https://res.cloudinary.com/${cloudName}/${type}/authenticated/v${data.version}/${data.public_id}.${data.format}`;
}
