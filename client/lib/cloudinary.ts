import { Platform } from 'react-native';
import { apiFetch } from './api';

type UploadFolder = 'avatars' | 'messages';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

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
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();
  if (blob.size > MAX_FILE_SIZE) {
    throw new Error('Media too large (max 10MB)');
  }

  const sigRes = await apiFetch(`/api/upload/signature?folder=${folder}`);
  if (!sigRes.ok) {
    throw new Error('Failed to get upload signature');
  }
  const { signature, timestamp, apiKey, cloudName, folder: uploadFolder, type: deliveryType, publicId, overwrite }: SignatureResponse =
    await sigRes.json();

  const formData = new FormData();
  const type = media?.type || 'image';
  const name = media?.fileName || (type === 'video' ? 'upload.mp4' : 'upload.jpg');
  const mimeType = media?.mimeType || (type === 'video' ? 'video/mp4' : 'image/jpeg');
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

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`,
    { method: 'POST', body: formData }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    const message = (err as any)?.error?.message ?? '';
    if (message.toLowerCase().includes('file size')) {
      throw new Error('Media too large (max 10MB)');
    }
    throw new Error('Upload failed');
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
