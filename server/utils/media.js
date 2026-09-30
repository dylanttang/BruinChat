import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadDir = path.join(__dirname, '..', 'uploads', 'chat-photos');

// Remove a message's locally stored photos/videos from disk. Fire-and-forget:
// a missing file is not an error.
export function deleteMessageMediaFiles(message) {
  const urls = [...(message.mediaUrls || []), message.mediaUrl].filter(Boolean);
  for (const url of urls) {
    if (!url.startsWith('/uploads/chat-photos/')) continue;
    const filename = path.basename(url);
    fs.unlink(path.join(uploadDir, filename), () => {});
  }
}
