import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { devAuth } from '../middleware/devAuth.js';

const router = Router();

const ALLOWED_FOLDERS = new Set(['avatars', 'messages']);

router.get('/signature', devAuth, (req, res) => {
  const { folder } = req.query;

  if (!folder || !ALLOWED_FOLDERS.has(folder)) {
    return res.status(400).json({ error: 'folder must be "avatars" or "messages"' });
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const timestamp = Math.round(Date.now() / 1000);
  const params = { folder, timestamp, upload_preset: 'bruinchat_signed' };
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);

  res.json({
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
  });
});

export default router;
