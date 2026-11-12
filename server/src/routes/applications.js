const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// POST /api/applications
// Submit an application for an open job.
router.post('/', (req, res) => {
  if (req.user.role !== 'job_seeker') {
    return res.status(403).json({
      error: 'Only job seekers can apply for jobs.',
    });
  }

  const { jobId, resumeId } = req.body || {};

  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    return res.status(400).json({
      error: 'A valid job ID is required.',
    });
  }

  if (
    resumeId !== undefined &&
    resumeId !== null &&
    (!Number.isSafeInteger(resumeId) || resumeId <= 0)
  ) {
    return res.status(400).json({
      error: 'Invalid resume ID.',
    });
  }

  const db = getDb();

  const job = db.prepare(
    'SELECT id, status FROM jobs WHERE id = ?'
  ).get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (job.status !== 'open') {
    return res.status(400).json({
      error: 'This job is no longer accepting applications.',
    });
  }

  if (resumeId != null) {
    const resume = db.prepare(
      'SELECT id FROM resumes WHERE id = ? AND user_id = ?'
    ).get(resumeId, req.user.id);

    if (!resume) {
      return res.status(400).json({
        error: 'Resume not found in your account.',
      });
    }
  }

  try {
    const result = db.prepare(`
      INSERT INTO applications (job_id, user_id, resume_id)
      VALUES (?, ?, ?)
    `).run(jobId, req.user.id, resumeId ?? null);

    return res.status(201).json({
      message: 'Application submitted successfully.',
      application: {
        id: Number(result.lastInsertRowid),
        jobId,
        status: 'Applied',
      },
    });
  } catch (error) {
    if (
      error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY'
    ) {
      return res.status(409).json({
        error: 'You have already applied for this job.',
      });
    }

    throw error;
  }
});

// GET /api/applications
// View applications submitted by the logged-in job seeker.
router.get('/', (req, res) => {
  if (req.user.role !== 'job_seeker') {
    return res.status(403).json({
      error: 'Only job seekers can view their applications.',
    });
  }

  const applications = getDb().prepare(`
    SELECT
      a.id,
      a.job_id AS jobId,
      a.resume_id AS resumeId,
      a.status,
      a.applied_at AS appliedAt,
      j.title,
      j.company,
      j.location,
      j.type,
      j.category
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.user_id = ?
    ORDER BY a.applied_at DESC, a.id DESC
  `).all(req.user.id);

  return res.json({ applications });
});

const APPLICATION_STATUSES = [
  'Applied',
  'Under Review',
  'Interview',
  'Offered',
  'Rejected',
];

// GET /api/applications/stats
router.get('/stats', (req, res) => {
  if (req.user.role !== 'job_seeker') {
    return res.status(403).json({
      error: 'Only job seekers can view application statistics.',
    });
  }

  const rows = getDb().prepare(`
    SELECT status, COUNT(*) AS count
    FROM applications
    WHERE user_id = ?
    GROUP BY status
  `).all(req.user.id);

  const byStatus = Object.fromEntries(
    APPLICATION_STATUSES.map(status => [status, 0])
  );

  for (const row of rows) {
    if (Object.hasOwn(byStatus, row.status)) {
      byStatus[row.status] = row.count;
    }
  }

  const total = Object.values(byStatus)
    .reduce((sum, count) => sum + count, 0);

  return res.json({
    total,
    byStatus,
  });


});

/**
 * GET /api/applications/stats/timeline
 * Number of applications submitted per week
 * during the last 8 calendar weeks.
 */
router.get('/stats/timeline', requireAuth, (req, res) => {
  if (req.user.role !== 'job_seeker') {
    return res.status(403).json({
      error: 'Only job seekers can view application statistics.',
    });
  }

  try {
    const now = new Date();

    // Start of the current week (Monday, UTC).
    const currentWeek = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      )
    );

    const dayOfWeek = currentWeek.getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;

    currentWeek.setUTCDate(
      currentWeek.getUTCDate() - daysSinceMonday
    );

    // First day of the eight-week reporting period.
    const firstWeek = new Date(currentWeek);
    firstWeek.setUTCDate(firstWeek.getUTCDate() - 7 * 7);

    const rows = getDb()
      .prepare(`
        SELECT applied_at
    FROM applications
    WHERE user_id = ?
      AND applied_at IS NOT NULL
      AND datetime(applied_at) >= datetime(?)
      AND datetime(applied_at) <= datetime('now')
    ORDER BY applied_at ASC
      `)
      .all(
        req.user.id,
        firstWeek.toISOString().slice(0, 19).replace('T', ' ')
      );

    const weeks = [];

    for (let i = 0; i < 8; i++) {
      const weekDate = new Date(firstWeek);
      weekDate.setUTCDate(weekDate.getUTCDate() + i * 7);

      weeks.push({
        weekStart: weekDate.toISOString().slice(0, 10),
        count: 0,
      });
    }

    const counts = new Map(
      weeks.map((week) => [week.weekStart, week])
    );

    for (const row of rows) {
      // SQLite CURRENT_TIMESTAMP uses UTC.
      const submitted = new Date(
        row.applied_at.replace(' ', 'T') + 'Z'
      );

      if (Number.isNaN(submitted.getTime())) continue;

      const monday = new Date(
        Date.UTC(
          submitted.getUTCFullYear(),
          submitted.getUTCMonth(),
          submitted.getUTCDate()
        )
      );

      const offset = (monday.getUTCDay() + 6) % 7;
      monday.setUTCDate(monday.getUTCDate() - offset);

      const key = monday.toISOString().slice(0, 10);
      const week = counts.get(key);

      if (week) week.count++;
    }

    return res.json({ weeks });
  } catch (error) {
    console.error('Failed to retrieve application timeline:', error);

    return res.status(500).json({
      error: 'Unable to load application timeline.',
    });
  }
});



module.exports = router;