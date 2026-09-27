const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// US-03 — View Profile
router.get('/', requireAuth, (req, res) => {
  const profile = getDb()
    .prepare(`
      SELECT
        full_name,
        headline,
        location,
        phone,
        bio,
        skills,
        linkedin_url,
        company_name,
        updated_at
      FROM profiles
      WHERE user_id = ?
    `)
    .get(req.user.id);

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  // Convert skills from JSON text back into an array
  try {
    profile.skills = JSON.parse(profile.skills || '[]');
  } catch {
    profile.skills = [];
  }

  return res.json({ profile });
});


// US-03 — Update Profile
router.put('/', requireAuth, (req, res) => {
  const {
    fullName,
    headline,
    location,
    phone,
    bio,
    skills,
    linkedinUrl,
    companyName
  } = req.body || {};

  // Full name is required
  if (!fullName || !fullName.trim()) {
    return res.status(400).json({
      error: 'Full name is required.'
    });
  }

  // Skills must be an array
  if (skills !== undefined && !Array.isArray(skills)) {
    return res.status(400).json({
      error: 'Skills must be an array.'
    });
  }

  const db = getDb();

  const result = db
    .prepare(`
      UPDATE profiles
      SET
        full_name = ?,
        headline = ?,
        location = ?,
        phone = ?,
        bio = ?,
        skills = ?,
        linkedin_url = ?,
        company_name = ?,
        updated_at = datetime('now')
      WHERE user_id = ?
    `)
    .run(
      fullName.trim(),
      headline?.trim() || '',
      location?.trim() || '',
      phone?.trim() || '',
      bio?.trim() || '',
      JSON.stringify(skills || []),
      linkedinUrl?.trim() || '',
      companyName?.trim() || '',
      req.user.id
    );

  if (result.changes === 0) {
    return res.status(404).json({
      error: 'Profile not found.'
    });
  }

  // Retrieve updated profile
  const updatedProfile = db
    .prepare(`
      SELECT
        full_name,
        headline,
        location,
        phone,
        bio,
        skills,
        linkedin_url,
        company_name,
        updated_at
      FROM profiles
      WHERE user_id = ?
    `)
    .get(req.user.id);

  try {
    updatedProfile.skills = JSON.parse(updatedProfile.skills || '[]');
  } catch {
    updatedProfile.skills = [];
  }

  return res.json({
    message: 'Profile updated successfully.',
    profile: updatedProfile
  });
});


module.exports = router;