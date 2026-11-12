
const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Task 13.2 - Require users to be logged in
router.use(requireAuth);

// Only job seekers can access reminders
router.use((req, res, next) => {
  if (req.user.role !== 'job_seeker') {
    return res.status(403).json({
      error: 'Only job seekers can view deadline reminders.'
    });
  }

  next();
});

// GET /api/reminders - Upcoming application deadlines
router.get('/', (req, res) => {
  const reminders = getDb().prepare(`
    SELECT
      j.id AS jobId,
      j.title,
      j.company,
      j.application_deadline
    FROM saved_jobs s
    JOIN jobs j ON j.id = s.job_id
    WHERE s.user_id = ?
      AND j.status = 'open'
      AND j.application_deadline IS NOT NULL
      AND j.application_deadline >= date('now')
      AND j.application_deadline <= date('now', '+3 days')
    ORDER BY j.application_deadline ASC, j.id ASC
  `).all(req.user.id);

  return res.status(200).json({ reminders });
});

module.exports = router;
