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

module.exports = router;
