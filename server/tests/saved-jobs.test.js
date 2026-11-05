// Task 9.5 (#49)
// Saved Jobs API Tests

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
  recruiter = await registerUser({ role: 'recruiter' });
  seeker = await registerUser({ role: 'job_seeker' });
  otherSeeker = await registerUser({ role: 'job_seeker' });

  for (const account of [recruiter, seeker, otherSeeker]) {
    expect(account.res.status).toBe(201);
    expect(account.token).toBeTruthy();
  }
});

// Clear test data before every test
beforeEach(() => {
  const db = getDb();

  db.prepare('DELETE FROM saved_jobs').run();
  db.prepare('DELETE FROM jobs').run();
});

// Close the test database when finished
afterAll(() => closeDb());


// --------------------------------------------
// Helper: Create a sample job
// --------------------------------------------

function createJob(title = 'Software Developer', status = 'open') {
  const result = getDb().prepare(`
    INSERT INTO jobs (recruiter_id, title, company, description, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    recruiter.res.body.user.id,
    title,
    'Example Company',
    'Build web applications.',
    status
  );

  return Number(result.lastInsertRowid);
}


// --------------------------------------------
// Helpers: Call the saved jobs routes
// --------------------------------------------

function saveAs(token, jobId) {
  return request(app)
    .post(`/api/saved-jobs/${jobId}`)
    .set('Authorization', `Bearer ${token}`);
}

function unsaveAs(token, jobId) {
  return request(app)
    .delete(`/api/saved-jobs/${jobId}`)
    .set('Authorization', `Bearer ${token}`);
}

function listAs(token) {
  return request(app)
    .get('/api/saved-jobs')
    .set('Authorization', `Bearer ${token}`);
}

function savedCount() {
  return getDb()
    .prepare('SELECT COUNT(*) AS total FROM saved_jobs')
    .get().total;
}


// ============================================
// TASK 9.5 — SAVED JOBS API TESTS
// ============================================

describe('Task 9.5 - Saved Jobs API', () => {

  // TEST 1: Save a job

  test('returns 201 when a job seeker saves a job', async () => {
    const jobId = createJob();

    const res = await saveAs(seeker.token, jobId);

    expect(res.status).toBe(201);
    expect(res.body.jobId).toBe(jobId);
    expect(savedCount()).toBe(1);
  });


  // TEST 2: List saved jobs, newest first

  test('lists saved jobs newest first', async () => {
    const firstJob = createJob('First Job');
    const secondJob = createJob('Second Job');

    expect((await saveAs(seeker.token, firstJob)).status).toBe(201);
    expect((await saveAs(seeker.token, secondJob)).status).toBe(201);

    const res = await listAs(seeker.token);

    expect(res.status).toBe(200);
    expect(res.body.savedJobs.map(job => job.id)).toEqual([secondJob, firstJob]);
    expect(res.body.savedJobs[0]).toMatchObject({
      title: 'Second Job',
      company: 'Example Company',
    });
    expect(res.body.savedJobs[0].savedAt).toBeTruthy();
  });


  // TEST 3: Unsave a job

  test('returns 204 when a saved job is removed', async () => {
    const jobId = createJob();
    await saveAs(seeker.token, jobId);

    const res = await unsaveAs(seeker.token, jobId);

    expect(res.status).toBe(204);
    expect(savedCount()).toBe(0);

    const list = await listAs(seeker.token);
    expect(list.body).toEqual({ savedJobs: [] });
  });


  // TEST 4: Unsave a job that was never saved

  test('returns 404 when removing a job that is not saved', async () => {
    const jobId = createJob();

    const res = await unsaveAs(seeker.token, jobId);

    expect(res.status).toBe(404);
  });


  // TEST 5: Duplicate save prevention

  test('saving the same job twice does not create a duplicate', async () => {
    const jobId = createJob();

    const first = await saveAs(seeker.token, jobId);
    const second = await saveAs(seeker.token, jobId);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(savedCount()).toBe(1);
  });


  // TEST 6: Missing authentication

  test.each([
    ['GET', '/api/saved-jobs'],
    ['POST', '/api/saved-jobs/1'],
    ['DELETE', '/api/saved-jobs/1'],
  ])('returns 401 for %s %s without a token', async (method, url) => {
    const res = await request(app)[method.toLowerCase()](url);

    expect(res.status).toBe(401);
  });


  // TEST 7: Invalid authentication token

  test('returns 401 for an invalid token', async () => {
    const jobId = createJob();

    const res = await saveAs('invalid-token', jobId);

    expect(res.status).toBe(401);
    expect(savedCount()).toBe(0);
  });


  // TEST 8: Recruiter authorization

  test('returns 403 for recruiters on every route', async () => {
    const jobId = createJob();

    const save = await saveAs(recruiter.token, jobId);
    const list = await listAs(recruiter.token);
    const unsave = await unsaveAs(recruiter.token, jobId);

    expect(save.status).toBe(403);
    expect(list.status).toBe(403);
    expect(unsave.status).toBe(403);
    expect(savedCount()).toBe(0);
  });


  // TESTS 9-12: Invalid job IDs

  test.each(['abc', '0', '-1', '1.5'])(
    'returns 400 for invalid job ID %j',
    async (jobId) => {
      const res = await saveAs(seeker.token, jobId);

      expect(res.status).toBe(400);
      expect(savedCount()).toBe(0);
    }
  );


  // TEST 13: Nonexistent or closed job

  test('returns 404 when saving a nonexistent or closed job', async () => {
    const closedJob = createJob('Closed Job', 'closed');

    const missing = await saveAs(seeker.token, 999999);
    const closed = await saveAs(seeker.token, closedJob);

    expect(missing.status).toBe(404);
    expect(closed.status).toBe(404);
    expect(savedCount()).toBe(0);
  });


  // TEST 14: Saved jobs are private per user

  test('keeps saved job lists private per user', async () => {
    const jobId = createJob();
    await saveAs(seeker.token, jobId);

    const res = await listAs(otherSeeker.token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ savedJobs: [] });
  });


  // TEST 15: Rows are removed with the job

  test('removes saved rows when the job is deleted', async () => {
    const jobId = createJob();
    await saveAs(seeker.token, jobId);

    getDb().prepare('DELETE FROM jobs WHERE id = ?').run(jobId);

    expect(savedCount()).toBe(0);
  });

  // TEST 16: Application deadlines are returned for saved jobs
  
  test('returns application deadlines for saved jobs', async () => {
    // Create a job
    const jobId = createJob();

    // Assign an application deadline
    getDb().prepare(`
      UPDATE jobs
      SET application_deadline = ?
      WHERE id = ?
  ` ).run('2026-11-08', jobId);

    // Save the job as a job seeker
    const save = await saveAs(seeker.token, jobId);
    expect(save.status).toBe(201);

    // Retrieve the user's saved jobs
    const res = await listAs(seeker.token);

    // Verify the deadline is included
    expect(res.status).toBe(200);
    expect(res.body.savedJobs).toHaveLength(1);
    expect(res.body.savedJobs[0].application_deadline)
      .toBe('2026-11-08');
  }); 

});
