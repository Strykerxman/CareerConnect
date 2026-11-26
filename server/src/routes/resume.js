const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadDirectory, sendResume } = require('../resumeFiles');

const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { extractResumeText, ResumeTextError } = require('../resumeText');
const resumeFeedback = require('../resumeFeedback');
const resumeMatch = require('../resumeMatch');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();


// --------------------------------------------------
// Resume upload directory
// --------------------------------------------------



// Create the directory if it does not exist
fs.mkdirSync(uploadDirectory, { recursive: true });


// --------------------------------------------------
// Multer configuration
// --------------------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);

    // Give each uploaded file a unique name
    const storedName = `${req.user.id}-${Date.now()}${extension}`;

    cb(null, storedName);
  }
});


// Only allow PDF and DOCX files
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    return cb(null, true);
  }

  return cb(new Error('Only PDF and DOCX files are allowed.'));
};


const upload = multer({
  storage,
  fileFilter,

  // Maximum file size: 5 MB
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});


// --------------------------------------------------
// US-04 — Upload Resume
// --------------------------------------------------

router.post(
  '/',
  requireAuth,
  upload.single('resume'),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: 'Please select a resume to upload.'
      });
    }

    const db = getDb();

    const result = db
      .prepare(`
        INSERT INTO resumes (
          user_id,
          original_name,
          stored_name,
          file_type,
          file_size
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        req.user.id,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size
      );

    return res.status(201).json({
      message: 'Resume uploaded successfully.',
      resume: {
        id: Number(result.lastInsertRowid),
        originalName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size
      }
    });
  }
);


// --------------------------------------------------
// US-05 — View Uploaded Resumes
// --------------------------------------------------

router.get('/', requireAuth, (req, res) => {

  const resumes = getDb()
    .prepare(`
      SELECT
        id,
        original_name,
        file_type,
        file_size,
        uploaded_at
      FROM resumes
      WHERE user_id = ?
      ORDER BY uploaded_at DESC
    `)
    .all(req.user.id);

  return res.json({ resumes });
});


// --------------------------------------------------
// US-05 — Download Resume
// --------------------------------------------------

router.get('/:id/download', requireAuth, (req, res) => {

  const resume = getDb()
    .prepare(`
      SELECT *
      FROM resumes
      WHERE id = ? AND user_id = ?
    `)
    .get(req.params.id, req.user.id);

  if (!resume) {
    return res.status(404).json({
      error: 'Resume not found.'
    });
  }

  return sendResume(res, resume, { download: true });
});


// --------------------------------------------------
// US-05 / Task 05-01 — View Resume Without Downloading
// --------------------------------------------------

router.get('/:id/view', requireAuth, async (req, res) => {

  const resume = getDb()
    .prepare(`
      SELECT *
      FROM resumes
      WHERE id = ? AND user_id = ?
    `)
    .get(req.params.id, req.user.id);

  if (!resume) {
    return res.status(404).json({
      error: 'Resume not found.'
    });
  }

  return sendResume(res, resume);
});


// --------------------------------------------------
// US-15 — AI Resume Feedback
// --------------------------------------------------

// Private, on-demand preparation report for an owned resume and an open job.
router.post('/:id/match', requireAuth, requireRole('job_seeker'), async (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  const resumeId = Number(req.params.id);
  const jobId = req.body?.jobId;
  if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(resumeId) ||
      !Number.isSafeInteger(jobId) || jobId < 1) {
    return res.status(400).json({ error: 'Choose a valid resume and job posting.' });
  }
  const db = getDb();
  const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(resumeId, req.user.id);
  if (!resume) return res.status(404).json({ error: 'Resume not found.' });
  const job = db.prepare("SELECT id, title, description, requirements FROM jobs WHERE id = ? AND status = 'open'").get(jobId);
  if (!job) return res.status(404).json({ error: 'Job posting is no longer available.' });
  const filePath = path.join(uploadDirectory, resume.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Resume file not found.' });
  try {
    const text = await extractResumeText(filePath, resume.file_type);
    const match = await resumeMatch.analyzeJobMatch(text, job);
    return res.json({ match });
  } catch (error) {
    if (error instanceof ResumeTextError) return res.status(422).json({ error: error.message });
    if (error instanceof resumeFeedback.FeedbackError) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
});

// Tasks 15.1, 15.2, 15.4 — Analyze one of the user's resumes.
// The resume file and record are only read, never changed, and the
// feedback is not stored.
router.post('/:id/feedback', requireAuth, async (req, res, next) => {

  const resume = getDb()
    .prepare(`
      SELECT *
      FROM resumes
      WHERE id = ? AND user_id = ?
    `)
    .get(req.params.id, req.user.id);

  if (!resume) {
    return res.status(404).json({
      error: 'Resume not found.'
    });
  }

  const filePath = path.join(uploadDirectory, resume.stored_name);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'Resume file not found.'
    });
  }

  try {
    const text = await extractResumeText(filePath, resume.file_type);
    const feedback = await resumeFeedback.analyzeResume(text);

    return res.json({ feedback });
  } catch (error) {
    if (error instanceof ResumeTextError) {
      return res.status(422).json({ error: error.message });
    }
    if (error instanceof resumeFeedback.FeedbackError) {
      return res.status(error.status).json({ error: error.message });
    }
    return next(error);
  }
});


// --------------------------------------------------
// US-05 — Delete Resume
// --------------------------------------------------

router.delete('/:id', requireAuth, (req, res) => {

  const db = getDb();

  const resume = db
    .prepare(`
      SELECT *
      FROM resumes
      WHERE id = ? AND user_id = ?
    `)
    .get(req.params.id, req.user.id);

  if (!resume) {
    return res.status(404).json({
      error: 'Resume not found.'
    });
  }

  const filePath = path.join(uploadDirectory, resume.stored_name);

  // Delete physical file
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Delete database record
  db.prepare(`
    DELETE FROM resumes
    WHERE id = ? AND user_id = ?
  `).run(req.params.id, req.user.id);

  return res.json({
    message: 'Resume deleted successfully.'
  });
});


module.exports = router;