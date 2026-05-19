import { Router } from 'express';
import Course from '../../models/Course.js';

const router = Router();

// GET /api/courses
// Returns all courses in the database (basic fields only).
// The client fetches these once and filters locally.
router.get('/', async (req, res) => {
  try {
    const query = {};
    if (req.query.term) {
      query.term = req.query.term;
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
