const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();


// --------------------------------------------------
// Resume upload directory
// --------------------------------------------------

const uploadDirectory = path.join(__dirname, '..', '..', 'uploads', 'resumes');

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

  const filePath = path.join(uploadDirectory, resume.stored_name);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'Resume file not found.'
    });
  }

  return res.download(filePath, resume.original_name);
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