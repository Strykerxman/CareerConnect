const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// Saved jobs belong to job seekers only.
router.use((req, res, next) => {
  if (req.user.role !== 'job_seeker') {
    return res.status(403).json({
      error: 'Only job seekers can save jobs.',
    });
  }
  return next();
});

// Returns the job ID from the URL, or null when it is not a positive integer.
function parseJobId(id) {
  const jobId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(jobId)) {
    return null;
  }
  return jobId;
}

// Task 9.2 — GET /api/saved-jobs
// List the logged-in job seeker's saved jobs, newest first.
// Closed postings are left out because they can no longer be viewed.
router.get('/', (req, res) => {
  const savedJobs = getDb().prepare(`
  SELECT j.id, j.title, j.company, j.location, j.type, j.category,
         j.description, j.requirements, j.application_deadline,
         j.created_at, s.saved_at AS savedAt
  FROM saved_jobs s
  JOIN jobs j ON j.id = s.job_id
  WHERE s.user_id = ? AND j.status = 'open'
  ORDER BY s.saved_at DESC, s.rowid DESC
`).all(req.user.id);

  return res.json({ savedJobs });
});

// Task 9.2 — POST /api/saved-jobs/:jobId
// Save an open job. Saving it again keeps the original entry.
router.post('/:jobId', (req, res) => {
  const jobId = parseJobId(req.params.jobId);
  if (jobId === null) {
    return res.status(400).json({ error: 'Invalid job ID.' });
  }

  const db = getDb();

  const job = db.prepare(
    "SELECT id FROM jobs WHERE id = ? AND status = 'open'"
  ).get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  const result = db.prepare(`
    INSERT OR IGNORE INTO saved_jobs (user_id, job_id)
    VALUES (?, ?)
  `).run(req.user.id, jobId);

  if (result.changes === 0) {
    return res.status(200).json({ message: 'Job is already saved.', jobId });
  }

  return res.status(201).json({ message: 'Job saved.', jobId });
});

// Task 9.2 — DELETE /api/saved-jobs/:jobId
// Remove a job from the logged-in job seeker's saved jobs.
router.delete('/:jobId', (req, res) => {
  const jobId = parseJobId(req.params.jobId);
  if (jobId === null) {
    return res.status(400).json({ error: 'Invalid job ID.' });
  }

  const result = getDb().prepare(
    'DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?'
  ).run(req.user.id, jobId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'This job is not in your saved jobs.' });
  }

  return res.status(204).end();
});

module.exports = router;
