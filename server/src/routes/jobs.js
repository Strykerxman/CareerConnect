const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// US-06 / Task 6.1 — Public listing of available job postings.
router.get('/', (req, res) => {
  const { q } = req.query;
  if (q !== undefined && typeof q !== 'string') {
    return res.status(400).json({ error: 'Search keyword must be a single string.' });
  }
  const keyword = (q || '').trim().toLowerCase();

  const jobs = getDb().prepare(`
    SELECT id, title, company, location, type, category, description,
           requirements, created_at
    FROM jobs
    WHERE status = 'open'
    ORDER BY created_at DESC, id DESC
  `).all();

  // Literal substring matching also handles accented case pairs with JS lowercase.
  // Filtering preserves the database's open-only, newest-first ordering.
  const results = keyword
    ? jobs.filter(job => [job.title, job.company, job.description]
      .some(value => value.toLowerCase().includes(keyword)))
    : jobs;

  return res.json({ jobs: results });
});

// Task 6.7 — Get details for a specific job
router.get('/:id', (req, res) => {
  const id = req.params.id;
  const jobId = Number(id);

  // Check whether the job ID is valid
  if (
    !/^[1-9]\d*$/.test(id) ||
    !Number.isSafeInteger(jobId)
  ) {
    return res.status(400).json({
      error: 'Invalid job ID.'
    });
  }

  // Find an open job with the requested ID
  const job = getDb().prepare(`
    SELECT id, title, company, location, type,
           category, description, requirements,
           created_at
    FROM jobs
    WHERE id = ? AND status = 'open'
  `).get(jobId);

  // Job doesn't exist or isn't available
  if (!job) {
    return res.status(404).json({
      error: 'Job not found.'
    });
  }

  // Return the job information
  return res.status(200).json({ job });
});

module.exports = router;
