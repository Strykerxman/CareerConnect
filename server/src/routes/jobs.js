
const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// GET /api/jobs
// Retrieve open jobs with optional keyword, location,
// employment type and category filters.
router.get('/', (req, res) => {
  const { q, location, type, category } = req.query;

  const filters = { q, location, type, category };

 // Validate keyword search separately (US-07).
if (q !== undefined && typeof q !== 'string') {
  return res.status(400).json({
    error: 'Search keyword must be a single string.',
  });
}

// Validate dropdown filters (US-08).
for (const value of [location, type, category]) {
  if (value !== undefined && typeof value !== 'string') {
    return res.status(400).json({
      error: 'Search filters must be single strings.',
    });
  }
}

  const keyword = (q || '').trim().toLowerCase();
  const selectedLocation = (location || '').trim().toLowerCase();
  const selectedType = (type || '').trim().toLowerCase();
  const selectedCategory = (category || '').trim().toLowerCase();

  const jobs = getDb().prepare(`
    SELECT
      id,
      title,
      company,
      location,
      type,
      category,
      description,
      requirements,
      created_at
    FROM jobs
    WHERE status = 'open'
    ORDER BY created_at DESC, id DESC
  `).all();

  const filteredJobs = jobs.filter(job => {
    const matchesKeyword =
      !keyword ||
      [
        job.title,
        job.company,
        job.description,
      ].some(value =>
        String(value || '').toLowerCase().includes(keyword)
      );

    const matchesLocation =
      !selectedLocation ||
      job.location.toLowerCase() === selectedLocation;

    const matchesType =
      !selectedType ||
      job.type.toLowerCase() === selectedType;

    const matchesCategory =
      !selectedCategory ||
      job.category.toLowerCase() === selectedCategory;

    return (
      matchesKeyword &&
      matchesLocation &&
      matchesType &&
      matchesCategory
    );
  });

  return res.json({ jobs: filteredJobs });
});

/**
 * GET /api/jobs/:id
 * Retrieve the details of a single open job.
 */
router.get('/:id', (req, res) => {
  const rawId = req.params.id;

  if (!/^[1-9]\d*$/.test(rawId)) {
    return res.status(400).json({
      error: 'Invalid job ID.',
    });
  }

  const id = Number(rawId);

  if (!Number.isSafeInteger(id)) {
    return res.status(400).json({
      error: 'Invalid job ID.',
    });
  }

  const job = getDb().prepare(`
    SELECT
      id,
      title,
      company,
      location,
      type,
      category,
      description,
      requirements,
      status,
      created_at
    FROM jobs
    WHERE id = ? AND status = 'open'
  `).get(id);

  if (!job) {
    return res.status(404).json({
      error: 'Job not found.',
    });
  }

  return res.json({ job });
});


module.exports = router;
