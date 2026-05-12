import * as FileSystem from 'expo-file-system';
import { apiFetch } from './api';

type UploadFolder = 'avatars' | 'messages';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type SignatureResponse = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: UploadFolder;
};

export async function uploadToCloudinary(
  uri: string,
  folder: UploadFolder
): Promise<string> {
  const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
  if (fileInfo.exists && fileInfo.size && fileInfo.size > MAX_FILE_SIZE) {
    throw new Error('Image too large (max 5MB)');
  }

  const sigRes = await apiFetch(`/api/upload/signature?folder=${folder}`);
  if (!sigRes.ok) {
    throw new Error('Failed to get upload signature');
  }
  const { signature, timestamp, apiKey, cloudName }: SignatureResponse =
    await sigRes.json();

  const formData = new FormData();
  formData.append('file', { uri, name: 'upload.jpg', type: 'image/jpeg' } as any);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('folder', folder);
  formData.append('upload_preset', 'bruinchat_signed');

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    const message = (err as any)?.error?.message ?? '';
    if (message.toLowerCase().includes('file size')) {
      throw new Error('Image too large (max 5MB)');
    }
    throw new Error('Upload failed');
  }

  const data = await uploadRes.json();
  return data.secure_url as string;
}
