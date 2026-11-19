const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const { PDF_TYPE, DOCX_TYPE } = require('./resumeText');

const uploadDirectory = path.join(__dirname, '..', 'uploads', 'resumes');
const DOCX_PREVIEW_POLICY = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

// Call only after the route has checked access to this resume.
async function sendResume(res, resume, { download = false } = {}) {
  const filePath = path.join(uploadDirectory, resume.stored_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Resume file not found.' });
  }
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'private, no-store');
  if (download) return res.download(filePath, resume.original_name);

  if (resume.file_type === PDF_TYPE) {
    res.type('application/pdf');
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(resume.original_name)}"`);
    return res.sendFile(filePath);
  }
  if (resume.file_type === DOCX_TYPE) {
    try {
      const { value: html } = await mammoth.convertToHtml({ path: filePath });
      res.set('Content-Security-Policy', DOCX_PREVIEW_POLICY);
      return res.type('html').send(html);
    } catch {
      return res.status(422).json({ error: 'This resume could not be displayed. Try downloading it instead.' });
    }
  }
  return res.status(415).json({ error: 'This file type cannot be displayed.' });
}

module.exports = { uploadDirectory, sendResume };
