import { Router } from 'express';
import Report from '../../models/Report.js';
import User from '../../models/User.js';
import { adminAuth } from '../middleware/adminAuth.js';

const router = Router();

// GET /api/admin/reports?status=pending&targetType=user
router.get('/reports', adminAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.targetType) filter.targetType = req.query.targetType;

    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .populate('reporterId', 'displayName username')
      .populate('resolvedBy', 'displayName username')
      .lean();

    return res.json(reports);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/reports/:id
router.patch('/reports/:id', adminAuth, async (req, res) => {
  try {
    const { resolution, resolutionNote } = req.body;

    if (!['dismissed', 'warned', 'banned'].includes(resolution)) {
      return res.status(400).json({ error: 'Invalid resolution' });
    }

    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.status !== 'pending') {
      return res.status(409).json({ error: 'Report already resolved' });
    }

    report.status = resolution;
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    report.resolutionNote = resolutionNote ?? '';
    await report.save();

    if (resolution === 'banned' && report.targetType === 'user') {
      await User.findByIdAndUpdate(report.targetId, { bannedAt: new Date() });
    }

    return res.json(report);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
