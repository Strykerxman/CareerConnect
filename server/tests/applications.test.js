 // Task 10.6 (#74)
 // Application API Security and Regression Tests

const {
  app,
  request,
  registerUser,
  closeDb
} = require('./helpers');

const { getDb } = require('../src/db');

let recruiter;
let seeker;
let otherSeeker;

// Create temporary test accounts before running tests
beforeAll(async () => {
  recruiter = await registerUser({
    role: 'recruiter'
  });

  seeker = await registerUser({
    role: 'job_seeker'
  });

  otherSeeker = await registerUser({
    role: 'job_seeker'
  });

  for (const account of [recruiter, seeker, otherSeeker]) {
    expect(account.res.status).toBe(201);
    expect(account.token).toBeTruthy();
  }
});

// Clear test data before every test
beforeEach(() => {
  const db = getDb();

  db.prepare('DELETE FROM applications').run();
  db.prepare('DELETE FROM resumes').run();
  db.prepare('DELETE FROM jobs').run();
});

// Close the test database when finished
afterAll(() => closeDb());


// --------------------------------------------
// Helper: Create a sample job
// --------------------------------------------

function createJob(status = 'open') {
  const result = getDb().prepare(`
    INSERT INTO jobs (
      recruiter_id,
      title,
      company,
      description,
      status
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    recruiter.res.body.user.id,
    'Software Developer',
    'Example Company',
    'Build web applications.',
    status
  );

  return Number(result.lastInsertRowid);
}


// --------------------------------------------
// Helper: Create a sample resume
// --------------------------------------------

function createResume(userId) {
  const result = getDb().prepare(`
    INSERT INTO resumes (
      user_id,
      original_name,
      stored_name,
      file_type,
      file_size
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    userId,
    'resume.pdf',
    'test-resume.pdf',
    'application/pdf',
    1024
  );

  return Number(result.lastInsertRowid);
}


// --------------------------------------------
// Helper: Submit an application
// --------------------------------------------

function applyAs(token, body) {
  return request(app)
    .post('/api/applications')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}


// --------------------------------------------
// Helper: Count stored applications
// --------------------------------------------

function applicationCount() {
  const result = getDb()
    .prepare('SELECT COUNT(*) AS total FROM applications')
    .get();

  return result.total;
}


// ============================================
// TASK 10.6 — APPLICATION API TESTS
// ============================================

describe('Task 10.6 - Application API Security Tests', () => {

  // TEST 1: Successful application submission

  test('returns 201 for successful application', async () => {
    const jobId = createJob();

    const resumeId = createResume(
      seeker.res.body.user.id
    );

    const res = await applyAs(seeker.token, {
      jobId,
      resumeId
    });

    expect(res.status).toBe(201);

    expect(res.body.application).toMatchObject({
      jobId,
      status: 'Applied'
    });

    // Verify application was actually saved
    const saved = getDb().prepare(`
      SELECT * FROM applications WHERE id = ?
    `).get(res.body.application.id);

    expect(saved).toMatchObject({
      job_id: jobId,
      user_id: seeker.res.body.user.id,
      resume_id: resumeId,
      status: 'Applied'
    });

    expect(applicationCount()).toBe(1);
  });


  // TEST 2: Duplicate application prevention

  test('returns 409 for duplicate applications', async () => {
    const jobId = createJob();

    const resumeId = createResume(
      seeker.res.body.user.id
    );

    const first = await applyAs(seeker.token, {
      jobId,
      resumeId
    });

    expect(first.status).toBe(201);

    const duplicate = await applyAs(seeker.token, {
      jobId,
      resumeId
    });

    expect(duplicate.status).toBe(409);

    expect(duplicate.body.error).toMatch(
      /already applied/i
    );

    // Verify only one application exists
    expect(applicationCount()).toBe(1);
  });


  // TEST 3: Missing authentication

  test('returns 401 when user is not logged in', async () => {
    const jobId = createJob();

    const res = await request(app)
      .post('/api/applications')
      .send({ jobId });

    expect(res.status).toBe(401);
    expect(applicationCount()).toBe(0);
  });


  // TEST 4: Invalid authentication token

  test('returns 401 for invalid token', async () => {
    const jobId = createJob();

    const res = await applyAs('invalid-token', {
      jobId
    });

    expect(res.status).toBe(401);
    expect(applicationCount()).toBe(0);
  });


  // TEST 5: Recruiter authorization

  test('returns 403 when recruiter applies', async () => {
    const jobId = createJob();

    const res = await applyAs(recruiter.token, {
      jobId
    });

    expect(res.status).toBe(403);
    expect(applicationCount()).toBe(0);
  });


  // TESTS 6-11: Invalid job IDs

  test.each([
    undefined,
    null,
    0,
    -1,
    1.5,
    '1'
  ])('returns 400 for invalid jobId %j', async (jobId) => {
    const res = await applyAs(seeker.token, {
      jobId
    });

    expect(res.status).toBe(400);
    expect(applicationCount()).toBe(0);
  });


  // TEST 12: Nonexistent job

  test('returns 404 for nonexistent job', async () => {
    const res = await applyAs(seeker.token, {
      jobId: 999999
    });

    expect(res.status).toBe(404);
    expect(applicationCount()).toBe(0);
  });


  // TEST 13: Closed job

  test('returns 400 when applying to closed job', async () => {
    const jobId = createJob('closed');

    const res = await applyAs(seeker.token, {
      jobId
    });

    expect(res.status).toBe(400);

    expect(res.body.error).toMatch(
      /no longer accepting/i
    );

    expect(applicationCount()).toBe(0);
  });


  // TEST 14: Resume ownership protection

  test('rejects resume belonging to another user', async () => {
    const jobId = createJob();

    // Resume belongs to otherSeeker
    const otherResumeId = createResume(
      otherSeeker.res.body.user.id
    );

    // First seeker attempts to use it
    const res = await applyAs(seeker.token, {
      jobId,
      resumeId: otherResumeId
    });

    expect(res.status).toBe(400);

    expect(res.body.error).toMatch(
      /resume not found/i
    );

    expect(applicationCount()).toBe(0);
  });


  // TEST 15: Invalid resume ID

  test('returns 400 for invalid resume ID', async () => {
    const jobId = createJob();

    const res = await applyAs(seeker.token, {
      jobId,
      resumeId: 'not-a-number'
    });

    expect(res.status).toBe(400);
    expect(applicationCount()).toBe(0);
  });


  // TEST 16: Different users can apply to same job

  test('allows different users to apply to same job', async () => {
    const jobId = createJob();

    const resume1 = createResume(
      seeker.res.body.user.id
    );

    const resume2 = createResume(
      otherSeeker.res.body.user.id
    );

    const first = await applyAs(seeker.token, {
      jobId,
      resumeId: resume1
    });

    const second = await applyAs(otherSeeker.token, {
      jobId,
      resumeId: resume2
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    expect(applicationCount()).toBe(2);
  });


  // TEST 17: Users cannot view others' applications

  test('keeps application lists private per user', async () => {
    const jobId = createJob();

    const resumeId = createResume(
      seeker.res.body.user.id
    );

    const submitted = await applyAs(seeker.token, {
      jobId,
      resumeId
    });

    expect(submitted.status).toBe(201);

    // Another user tries to view applications
    const res = await request(app)
      .get('/api/applications')
      .set(
        'Authorization',
        `Bearer ${otherSeeker.token}`
      );

    expect(res.status).toBe(200);

    // Must not see first user's application
    expect(res.body).toEqual({
      applications: []
    });
  });

});
