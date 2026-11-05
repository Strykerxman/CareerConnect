
const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// GET /api/jobs
// Retrieve open jobs with optional keyword, location,
// employment type and category filters.
router.get('/', (req, res) => {
  const { q, location, type, category } = req.query;

  const filters = { q, location, type, category };

  // Reject invalid query parameter types.
  for (const value of Object.values(filters)) {
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

module.exports = router;
