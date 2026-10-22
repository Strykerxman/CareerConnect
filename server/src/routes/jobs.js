const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// US-06 / Task 6.1 — Public listing of available job postings.
router.get('/', (req, res) => {
  const jobs = getDb().prepare(`
    SELECT id, title, company, location, type, category, description,
           requirements, created_at
    FROM jobs
    WHERE status = 'open'
    ORDER BY created_at DESC, id DESC
  `).all();

  return res.json({ jobs });
});

module.exports = router;
