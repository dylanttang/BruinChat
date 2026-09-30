import { Router } from 'express';
import mongoose from 'mongoose';
import Report from '../../models/Report.js';
import User from '../../models/User.js';
import Message from '../../models/Message.js';
import { devAuth } from '../middleware/devAuth.js';
import { reportRateLimit } from '../middleware/rateLimit.js';
import { sendPush } from '../utils/push.js';

const router = Router();

// Push "new report" to every admin with a registered device so reports get
// handled within the 24 hours the Terms promise. Fire-and-forget.
async function notifyAdmins(report, reporterId) {
  try {
    const admins = await User.find({
      role: 'admin',
      pushToken: { $ne: null },
      _id: { $ne: reporterId },
    }).select('pushToken').lean();
    if (admins.length === 0) return;

    const reason = report.reason.replace(/_/g, ' ');
    sendPush(admins.map((a) => a.pushToken), {
      title: 'New report',
      body: `A ${report.targetType} was reported for ${reason}.`,
      data: { type: 'report', targetType: report.targetType, targetId: report.targetId.toString() },
    });
  } catch (err) {
    console.error('Failed to notify admins of report:', err);
  }
}

// GET /api/reports/me — current user's submitted reports
router.get('/me', devAuth, async (req, res) => {
  try {
    const reports = await Report.find({ reporterId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(reports);
  } catch (err) {
    console.error('GET /api/reports/me error:', err);
    return res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

router.post('/', devAuth, reportRateLimit, async (req, res) => {
  try {
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
    if (details != null && (typeof details !== 'string' || details.length > 500)) {
      return res.status(400).json({ error: 'details must be a string of at most 500 characters' });
    }

    const TargetModel = targetType === 'user' ? User : Message;
    const target = await TargetModel.findById(targetId).lean();
    if (!target) return res.status(404).json({ error: `${targetType} not found` });

    if (targetType === 'user' && targetId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot report yourself' });
    }

    const report = await Report.create({
      reporterId: req.user._id,
      targetType,
      targetId,
      reason,
      details: details ?? '',
    });
    notifyAdmins(report, req.user._id);
    return res.status(201).json(report);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'You already have an open report for this target' });
    }
    // Express 4 doesn't catch rejected promises, so a rethrow here would
    // leave the request hanging.
    console.error('POST /api/reports error:', err);
    return res.status(500).json({ error: 'Failed to submit report' });
  }
});

export default router;
