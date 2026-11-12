// Task 05-01 (#114)
// View Resume Without Downloading Tests

const fs = require('fs');
const path = require('path');

const {
  app,
  request,
  registerUser,
  closeDb
} = require('./helpers');

const { getDb } = require('../src/db');
const { PDF_TYPE, DOCX_TYPE } = require('../src/resumeText');

const FIXTURES = path.join(__dirname, 'fixtures');
const UPLOADS = path.join(__dirname, '..', 'uploads', 'resumes');

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

// Remove copied resume files and close the test database when finished
afterAll(() => {
  for (const file of storedFiles) fs.rmSync(file, { force: true });
  closeDb();
});


// --------------------------------------------
// Helper: Store a fixture as an uploaded resume
// --------------------------------------------

function storeResume(account, fixture, fileType, originalName = fixture) {
  const storedName = `test-view-${Date.now()}-${storedFiles.length}${path.extname(fixture)}`;
  const filePath = path.join(UPLOADS, storedName);

  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, fixture), filePath);
  storedFiles.push(filePath);

  const result = getDb().prepare(`
    INSERT INTO resumes (user_id, original_name, stored_name, file_type, file_size)
    VALUES (?, ?, ?, ?, ?)
  `).run(account.res.body.user.id, originalName, storedName, fileType, fs.statSync(filePath).size);

  return { id: Number(result.lastInsertRowid), filePath };
}

function viewResume(token, resumeId) {
  return request(app)
    .get(`/api/resume/${resumeId}/view`)
    .set('Authorization', `Bearer ${token}`)
    .buffer(true);
}


// ============================================
// TASK 05-01 — VIEW RESUME
// ============================================

describe('GET /api/resume/:id/view', () => {

  test('shows a PDF resume in the browser instead of downloading it', async () => {
    const resume = storeResume(seeker, 'resume.pdf', PDF_TYPE);

    const res = await viewResume(seeker.token, resume.id);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/^inline/);
    expect(Buffer.from(res.body).equals(fs.readFileSync(resume.filePath))).toBe(true);
  });

  test('shows a DOCX resume as a web page', async () => {
    const resume = storeResume(seeker, 'resume.docx', DOCX_TYPE);

    const res = await viewResume(seeker.token, resume.id);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Jordan Tester');
  });

  test('blocks scripts and outside requests in the DOCX preview', async () => {
    const resume = storeResume(seeker, 'resume.docx', DOCX_TYPE);

    const res = await viewResume(seeker.token, resume.id);

    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('does not change the resume file', async () => {
    const resume = storeResume(seeker, 'resume.docx', DOCX_TYPE);
    const before = fs.readFileSync(resume.filePath);

    await viewResume(seeker.token, resume.id);

    expect(fs.readFileSync(resume.filePath).equals(before)).toBe(true);
  });

  test('returns 422 when a DOCX resume cannot be read', async () => {
    const resume = storeResume(seeker, 'resume.pdf', DOCX_TYPE, 'broken.docx');

    const res = await viewResume(seeker.token, resume.id);

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/could not be displayed/);
  });

  test('returns 401 without a token', async () => {
    const resume = storeResume(seeker, 'resume.pdf', PDF_TYPE);

    const res = await request(app).get(`/api/resume/${resume.id}/view`);

    expect(res.status).toBe(401);
  });

  test('returns 404 for another user\'s resume', async () => {
    const resume = storeResume(seeker, 'resume.pdf', PDF_TYPE);

    const res = await viewResume(otherSeeker.token, resume.id);

    expect(res.status).toBe(404);
  });

  test('returns 404 when the resume file is missing', async () => {
    const resume = storeResume(seeker, 'resume.pdf', PDF_TYPE);
    fs.rmSync(resume.filePath);

    const res = await viewResume(seeker.token, resume.id);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Resume file not found.');
  });

});
