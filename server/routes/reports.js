import { Router } from 'express';
import mongoose from 'mongoose';
import Report from '../../models/Report.js';
import User from '../../models/User.js';
import Message from '../../models/Message.js';
import { devAuth } from '../middleware/devAuth.js';

const router = Router();

router.post('/', devAuth, async (req, res) => {
  const { targetType, targetId, reason, details } = req.body;

  if (!['user', 'message'].includes(targetType)) {
    return res.status(400).json({ error: 'Invalid targetType' });
  }
  if (!['spam', 'harassment', 'inappropriate_content', 'hate_speech', 'other'].includes(reason)) {
    return res.status(400).json({ error: 'Invalid reason' });
  }
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    return res.status(400).json({ error: 'Invalid targetId' });
  }

  const TargetModel = targetType === 'user' ? User : Message;
  const target = await TargetModel.findById(targetId).lean();
  if (!target) return res.status(404).json({ error: `${targetType} not found` });

  if (targetType === 'user' && targetId === req.user._id.toString()) {
    return res.status(400).json({ error: 'Cannot report yourself' });
  }

  try {
    const report = await Report.create({
      reporterId: req.user._id,
      targetType,
      targetId,
      reason,
      details: details ?? '',
    });
    return res.status(201).json(report);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'You already have an open report for this target' });
    }
    throw err;
  }
});

export default router;
