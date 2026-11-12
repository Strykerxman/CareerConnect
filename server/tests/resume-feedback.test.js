// Task 15.5 (#111)
// AI Resume Feedback Tests

const fs = require('fs');
const path = require('path');
const { ApiError } = require('@google/genai');

const {
  app,
  request,
  registerUser,
  closeDb
} = require('./helpers');

const { getDb } = require('../src/db');
const { extractResumeText, ResumeTextError, PDF_TYPE, DOCX_TYPE } = require('../src/resumeText');
const resumeFeedback = require('../src/resumeFeedback');

const { analyzeResume, redactContactInfo, FeedbackError } = resumeFeedback;

const FIXTURES = path.join(__dirname, 'fixtures');
const UPLOADS = path.join(__dirname, '..', 'uploads', 'resumes');

const SAMPLE_FEEDBACK = {
  summary: 'A clear junior developer resume.',
  strengths: ['Relevant web development skills'],
  suggestions: [
    { category: 'content', title: 'Add results', detail: 'Quantify the impact of your projects.' },
    { category: 'skills', title: 'Group skills', detail: 'Separate languages from frameworks.' },
    { category: 'formatting', title: 'Use bullets', detail: 'List experience as bullet points.' },
  ],
};

const RESUME_TEXT = 'Jordan Tester\nSoftware Developer\nBuilt React and Node.js web applications.';

let seeker;
let otherSeeker;
const storedFiles = [];

// Create temporary test accounts before running tests
beforeAll(async () => {
  seeker = await registerUser({ role: 'job_seeker' });
  otherSeeker = await registerUser({ role: 'job_seeker' });

  for (const account of [seeker, otherSeeker]) {
    expect(account.res.status).toBe(201);
  }
});

// Clear test data before every test
beforeEach(() => {
  getDb().prepare('DELETE FROM resumes').run();
});

afterEach(() => jest.restoreAllMocks());

// Remove copied resume files and close the test database when finished
afterAll(() => {
  for (const file of storedFiles) fs.rmSync(file, { force: true });
  closeDb();
});


// --------------------------------------------
// Helper: Store a fixture as an uploaded resume
// --------------------------------------------

function storeResume(account, fixture, fileType) {
  const storedName = `test-feedback-${Date.now()}-${storedFiles.length}${path.extname(fixture)}`;
  const filePath = path.join(UPLOADS, storedName);

  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, fixture), filePath);
  storedFiles.push(filePath);

  const result = getDb().prepare(`
    INSERT INTO resumes (user_id, original_name, stored_name, file_type, file_size)
    VALUES (?, ?, ?, ?, ?)
  `).run(account.res.body.user.id, fixture, storedName, fileType, fs.statSync(filePath).size);

  return { id: Number(result.lastInsertRowid), filePath };
}

function requestFeedback(token, resumeId) {
  return request(app)
    .post(`/api/resume/${resumeId}/feedback`)
    .set('Authorization', `Bearer ${token}`);
}

// A stand-in for the Gemini client that records the request it receives.
// `result` is the reply text, or an error to throw.
function fakeClient(result) {
  const generateContent = jest.fn(async () => {
    if (result instanceof Error) throw result;
    return { text: result };
  });
  return { client: { models: { generateContent } }, generateContent };
}

const REPLY = JSON.stringify(SAMPLE_FEEDBACK);


// ============================================
// TASK 15.1 — RESUME TEXT EXTRACTION
// ============================================

describe('Task 15.1 - Resume text extraction', () => {

  test('extracts text from a PDF resume', async () => {
    const text = await extractResumeText(path.join(FIXTURES, 'resume.pdf'), PDF_TYPE);

    expect(text).toContain('Jordan Tester');
    expect(text).toContain('Skills: JavaScript, React, Node.js, SQL');
    expect(text).not.toMatch(/-- 1 of 1 --/);
  });

  test('extracts text from a DOCX resume', async () => {
    const text = await extractResumeText(path.join(FIXTURES, 'resume.docx'), DOCX_TYPE);

    expect(text).toContain('Jordan Tester');
    expect(text).toContain('Built React and Node.js web applications');
  });

  test('rejects a resume with no readable text', async () => {
    await expect(extractResumeText(path.join(FIXTURES, 'blank.pdf'), PDF_TYPE))
      .rejects.toThrow(/No readable text/);
  });

  test('rejects unsupported or unreadable files', async () => {
    await expect(extractResumeText(path.join(FIXTURES, 'resume.pdf'), 'text/plain'))
      .rejects.toBeInstanceOf(ResumeTextError);
    await expect(extractResumeText(path.join(FIXTURES, 'resume.docx'), PDF_TYPE))
      .rejects.toBeInstanceOf(ResumeTextError);
  });

});


// ============================================
// TASKS 15.2 / 15.4 — AI ANALYSIS AND PRIVACY
// ============================================

describe('Tasks 15.2 / 15.4 - AI analysis', () => {

  test('returns structured feedback from Gemini', async () => {
    const { client, generateContent } = fakeClient(REPLY);

    const feedback = await analyzeResume(RESUME_TEXT, { ai: client });

    expect(feedback).toEqual(SAMPLE_FEEDBACK);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: expect.objectContaining({ type: 'object' }),
    });
  });

  test('removes contact details before sending the resume', async () => {
    const { client, generateContent } = fakeClient(REPLY);

    await analyzeResume(
      `${RESUME_TEXT}\njordan@example.com | (514) 555-0199 | https://github.com/jordan`,
      { ai: client }
    );

    const sent = generateContent.mock.calls[0][0].contents;
    expect(sent).not.toContain('jordan@example.com');
    expect(sent).not.toContain('555-0199');
    expect(sent).not.toContain('github.com/jordan');
    expect(sent).toContain('[email]');
  });

  test('redactContactInfo keeps the rest of the text', () => {
    expect(redactContactInfo('Email: a.b@c.ca Phone: 514-555-0199 Skills: SQL'))
      .toBe('Email: [email] Phone: [phone] Skills: SQL');
  });

  test.each([
    ['rate limited', new ApiError({ status: 429, message: 'quota exceeded' }), 503],
    ['overloaded', new ApiError({ status: 503, message: 'model overloaded' }), 503],
    ['unreachable', new TypeError('fetch failed'), 503],
    ['too slow', Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' }), 504],
    ['bad API key', new ApiError({ status: 400, message: 'API key not valid' }), 502],
  ])('returns a safe %s error', async (label, error, status) => {
    const { client } = fakeClient(error);

    const failure = await analyzeResume(RESUME_TEXT, { ai: client }).catch(err => err);

    expect(failure).toBeInstanceOf(FeedbackError);
    expect(failure.status).toBe(status);
    expect(failure.message).not.toMatch(/key|quota|overloaded|fetch|operation/i);
  });

  test('retries once when Gemini is temporarily overloaded', async () => {
    const generateContent = jest.fn()
      .mockRejectedValueOnce(new ApiError({ status: 503, message: 'high demand' }))
      .mockResolvedValueOnce({ text: REPLY });

    const feedback = await analyzeResume(RESUME_TEXT, { ai: { models: { generateContent } } });

    expect(feedback).toEqual(SAMPLE_FEEDBACK);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  test('fails safely when the reply is blocked, empty or malformed', async () => {
    for (const result of [undefined, '', 'not json', JSON.stringify({ summary: 'missing fields' })]) {
      const { client } = fakeClient(result);
      const failure = await analyzeResume(RESUME_TEXT, { ai: client }).catch(err => err);

      expect(failure).toBeInstanceOf(FeedbackError);
      expect(failure.status).toBe(502);
    }
  });

  test('rejects very long resumes without calling the AI service', async () => {
    const { client, generateContent } = fakeClient(REPLY);

    const failure = await analyzeResume('a'.repeat(30001), { ai: client }).catch(err => err);

    expect(failure.status).toBe(422);
    expect(generateContent).not.toHaveBeenCalled();
  });

  test('reports the service as unavailable when no API key is set', async () => {
    const saved = { gemini: process.env.GEMINI_API_KEY, google: process.env.GOOGLE_API_KEY };
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const failure = await analyzeResume(RESUME_TEXT).catch(err => err);

      expect(failure).toBeInstanceOf(FeedbackError);
      expect(failure.status).toBe(503);
      expect(failure.message).toBe('AI feedback is not available right now.');
    } finally {
      if (saved.gemini !== undefined) process.env.GEMINI_API_KEY = saved.gemini;
      if (saved.google !== undefined) process.env.GOOGLE_API_KEY = saved.google;
    }
  });

});


// ============================================
// TASKS 15.2 / 15.4 — FEEDBACK ROUTE
// ============================================

describe('POST /api/resume/:id/feedback', () => {

  // AT-US15-01
  test('returns feedback for the owner\'s resume', async () => {
    const resume = storeResume(seeker, 'resume.pdf', PDF_TYPE);
    const analyze = jest.spyOn(resumeFeedback, 'analyzeResume').mockResolvedValue(SAMPLE_FEEDBACK);

    const res = await requestFeedback(seeker.token, resume.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ feedback: SAMPLE_FEEDBACK });
    expect(analyze.mock.calls[0][0]).toContain('Jordan Tester');
  });

  test('works for DOCX resumes', async () => {
    const resume = storeResume(seeker, 'resume.docx', DOCX_TYPE);
    jest.spyOn(resumeFeedback, 'analyzeResume').mockResolvedValue(SAMPLE_FEEDBACK);

    const res = await requestFeedback(seeker.token, resume.id);

    expect(res.status).toBe(200);
  });

  // AT-US15-02
  test('shows an error and leaves the resume unchanged when the AI service is down', async () => {
    const resume = storeResume(seeker, 'resume.pdf', PDF_TYPE);
    const before = fs.readFileSync(resume.filePath);
    const rowBefore = getDb().prepare('SELECT * FROM resumes WHERE id = ?').get(resume.id);

    jest.spyOn(resumeFeedback, 'analyzeResume').mockRejectedValue(
      new FeedbackError(503, 'The AI feedback service is unavailable. Please try again later.')
    );

    const res = await requestFeedback(seeker.token, resume.id);

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/unavailable/i);
    expect(fs.readFileSync(resume.filePath).equals(before)).toBe(true);
    expect(getDb().prepare('SELECT * FROM resumes WHERE id = ?').get(resume.id)).toEqual(rowBefore);
  });

  // AT-US15-02
  test('returns 422 when the resume cannot be analyzed', async () => {
    const resume = storeResume(seeker, 'blank.pdf', PDF_TYPE);
    const analyze = jest.spyOn(resumeFeedback, 'analyzeResume');

    const res = await requestFeedback(seeker.token, resume.id);

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/No readable text/);
    expect(analyze).not.toHaveBeenCalled();
    expect(fs.existsSync(resume.filePath)).toBe(true);
  });

  test('returns 401 without a token', async () => {
    const resume = storeResume(seeker, 'resume.pdf', PDF_TYPE);

    const res = await request(app).post(`/api/resume/${resume.id}/feedback`);

    expect(res.status).toBe(401);
  });

  test('returns 404 for another user\'s resume', async () => {
    const resume = storeResume(seeker, 'resume.pdf', PDF_TYPE);
    const analyze = jest.spyOn(resumeFeedback, 'analyzeResume');

    const res = await requestFeedback(otherSeeker.token, resume.id);

    expect(res.status).toBe(404);
    expect(analyze).not.toHaveBeenCalled();
  });

  test('returns 404 when the resume file is missing', async () => {
    const resume = storeResume(seeker, 'resume.pdf', PDF_TYPE);
    fs.rmSync(resume.filePath);

    const res = await requestFeedback(seeker.token, resume.id);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Resume file not found.');
  });

});
