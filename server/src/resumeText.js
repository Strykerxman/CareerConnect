const fs = require('fs');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');

const PDF_TYPE = 'application/pdf';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// A resume with less text than this is almost certainly a scanned image.
const MIN_TEXT_LENGTH = 50;

// Raised when a resume file cannot be turned into readable text.
class ResumeTextError extends Error {}

// Collapse the extra spaces and blank lines that PDF/DOCX extraction leaves behind.
function cleanText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^-- \d+ of \d+ --$/gm, '') // pdf-parse page markers
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function readDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// Task 15.1 — Extract readable text from an uploaded PDF or DOCX resume.
// The file is only read, never modified.
async function extractResumeText(filePath, fileType) {
  if (fileType !== PDF_TYPE && fileType !== DOCX_TYPE) {
    throw new ResumeTextError('Only PDF and DOCX resumes can be analyzed.');
  }

  let raw;
  try {
    const buffer = await fs.promises.readFile(filePath);
    raw = fileType === PDF_TYPE ? await readPdf(buffer) : await readDocx(buffer);
  } catch {
    throw new ResumeTextError('This resume file could not be read.');
  }

  const text = cleanText(raw || '');
  if (text.length < MIN_TEXT_LENGTH) {
    throw new ResumeTextError(
      'No readable text was found in this resume. Scanned or image-only files cannot be analyzed.'
    );
  }

  return text;
}

module.exports = { extractResumeText, ResumeTextError, PDF_TYPE, DOCX_TYPE };
