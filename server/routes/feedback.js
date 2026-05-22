import { Router } from 'express';
import Feedback from '../../models/Feedback.js';
import { devAuth } from '../middleware/devAuth.js';
import { feedbackRateLimit } from '../middleware/rateLimit.js';

const router = Router();

// POST /api/feedback
router.post('/', devAuth, feedbackRateLimit, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }

    const feedback = await Feedback.create({
      userId: req.user._id,
      text: text.trim(),
    });

    return res.status(201).json({ feedback });
  } catch (err) {
    console.error('POST /api/feedback error:', err);
    return res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

export default router;
