import { Router } from 'express';
import Course from '../../models/Course.js';

const router = Router();

// GET /api/courses
// Returns one quarter's courses (basic fields only): ?term= if given,
// otherwise CURRENT_TERM (e.g. 26F), so the picker doesn't mix in old
// quarters still in the database. Without either, returns every term.
// The client fetches these once and filters locally.
router.get('/', async (req, res) => {
  try {
    const query = {};
    // Only accept a plain string so ?term[$ne]=... can't become a Mongo operator.
    const term = typeof req.query.term === 'string' && req.query.term
      ? req.query.term
      : process.env.CURRENT_TERM;
    if (term) {
      query.term = term;
    }

    const courses = await Course.find(query, '_id subjectArea number title term')
      .sort({ subjectArea: 1, number: 1 })
      .lean();

    res.json({ courses });
  } catch (err) {
    console.error('GET /api/courses error:', err);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
});

export default router;
