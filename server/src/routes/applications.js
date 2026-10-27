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

module.exports = router;