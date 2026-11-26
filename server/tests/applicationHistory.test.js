
const express = require('express');
const request = require('supertest');
const { getDb, closeDb } = require('../src/db');
const { signToken } = require('../src/middleware/auth');

const applicationsRouter = require('../src/routes/applications');
const recruiterJobsRouter = require('../src/routes/recruiterJobs');

const app = express();

app.use(express.json());
app.use('/api/applications', applicationsRouter);
app.use('/api/recruiter/jobs', recruiterJobsRouter);

let db;
let seekerToken;
let recruiterToken;
let otherSeekerToken;
let otherRecruiterToken;
let jobId;

const originalDbPath = process.env.DB_PATH;

function createUser(email, role, name) {
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, role)
    VALUES (?, ?, ?)
  `).run(email, 'test-password-hash', role);

  const id = Number(result.lastInsertRowid);

  db.prepare(`
    INSERT INTO profiles (user_id, full_name)
    VALUES (?, ?)
  `).run(id, name);

  return { id, role };
}

beforeEach(() => {
  closeDb();

  // Use a temporary database to protect real application data.
  process.env.DB_PATH = ':memory:';
  db = getDb();

  const seeker = createUser(
    'seeker@example.com', 'job_seeker', 'Test Seeker'
  );

  const recruiter = createUser(
    'recruiter@example.com', 'recruiter', 'Test Recruiter'
  );

  const otherSeeker = createUser(
    'other@example.com', 'job_seeker', 'Other Seeker'
  );

  const otherRecruiter = createUser(
    'other-recruiter@example.com',
    'recruiter',
    'Other Recruiter'
  );

  seekerToken = signToken(seeker);
  recruiterToken = signToken(recruiter);
  otherSeekerToken = signToken(otherSeeker);
  otherRecruiterToken = signToken(otherRecruiter);

  const job = db.prepare(`
    INSERT INTO jobs (
      recruiter_id, title, company, description
    )
    VALUES (?, ?, ?, ?)
  `).run(
    recruiter.id,
    'Software Developer Intern',
    'Test Company',
    'Test job description'
  );

  jobId = Number(job.lastInsertRowid);
});

afterEach(() => {
  closeDb();
});

afterAll(() => {
  if (originalDbPath === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = originalDbPath;
  }
});

async function submitApplication() {
  const response = await request(app)
    .post('/api/applications')
    .set('Authorization', `Bearer ${seekerToken}`)
    .send({ jobId });

  expect(response.status).toBe(201);

  return response.body.application.id;
}

function updateStatus(applicationId, status, token = recruiterToken) {
  return request(app)
    .patch(`/api/recruiter/jobs/${jobId}/applications/${applicationId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status });
}

function getHistory(applicationId, token = seekerToken) {
  return request(app)
    .get(`/api/applications/${applicationId}/history`)
    .set('Authorization', `Bearer ${token}`);
}

describe('US-19 - Application Status History', () => {
  test('records the initial Applied status', async () => {
    const applicationId = await submitApplication();

    const response = await getHistory(applicationId);

    expect(response.status).toBe(200);
    expect(response.body.history).toHaveLength(1);
    expect(response.body.history[0].status).toBe('Applied');
    expect(response.body.history[0].changedAt)
      .toBe(response.body.appliedAt);
  });

  test('records recruiter status changes chronologically', async () => {
    const applicationId = await submitApplication();

    expect((await updateStatus(
      applicationId, 'Under Review'
    )).status).toBe(200);

    expect((await updateStatus(
      applicationId, 'Interview'
    )).status).toBe(200);

    const response = await getHistory(applicationId);

    expect(response.status).toBe(200);
    expect(response.body.currentStatus).toBe('Interview');

    expect(response.body.history.map(item => item.status))
      .toEqual(['Applied', 'Under Review', 'Interview']);
  });

  test('does not duplicate unchanged statuses', async () => {
    const applicationId = await submitApplication();

    await updateStatus(applicationId, 'Interview');
    await updateStatus(applicationId, 'Interview');

    const response = await getHistory(applicationId);

    expect(response.status).toBe(200);
    expect(response.body.history.map(item => item.status))
      .toEqual(['Applied', 'Interview']);
  });

  test('rejects invalid application statuses', async () => {
    const applicationId = await submitApplication();

    const response = await updateStatus(
      applicationId, 'Invalid Status'
    );

    expect(response.status).toBe(400);

    const history = await getHistory(applicationId);

    expect(history.body.currentStatus).toBe('Applied');
    expect(history.body.history).toHaveLength(1);
  });

  test('prevents access to another job seeker history', async () => {
    const applicationId = await submitApplication();

    const response = await getHistory(
      applicationId, otherSeekerToken
    );

    expect(response.status).toBe(404);
    expect(response.body.history).toBeUndefined();
  });

  test('prevents unauthorized recruiter status changes', async () => {
    const applicationId = await submitApplication();

    const response = await updateStatus(
      applicationId, 'Rejected', otherRecruiterToken
    );

    expect(response.status).toBe(404);

    const history = await getHistory(applicationId);

    expect(history.body.currentStatus).toBe('Applied');
    expect(history.body.history).toHaveLength(1);
  });

  test('rejects recruiter requests to job seeker history API', async () => {
    const applicationId = await submitApplication();

    const response = await getHistory(
      applicationId, recruiterToken
    );

    expect(response.status).toBe(403);
  });

  test('rejects unauthenticated history requests', async () => {
    const applicationId = await submitApplication();

    const response = await request(app)
      .get(`/api/applications/${applicationId}/history`);

    expect(response.status).toBe(401);
  });

  test('rejects invalid application IDs', async () => {
    const response = await getHistory('invalid');

    expect(response.status).toBe(400);
  });

  test('returns 404 for nonexistent applications', async () => {
    const response = await getHistory(99999);

    expect(response.status).toBe(404);
  });

  test('handles older applications without recorded history', async () => {
    const applicationId = await submitApplication();

    // Simulate an application created before US-19.
    db.prepare(`
      DELETE FROM application_status_history
      WHERE application_id = ?
    `).run(applicationId);

    const response = await getHistory(applicationId);

    expect(response.status).toBe(200);
    expect(response.body.currentStatus).toBe('Applied');
    expect(response.body.history).toEqual([]);
  });

  test('preserves history when a duplicate application is rejected', async () => {
    const applicationId = await submitApplication();

    const response = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${seekerToken}`)
      .send({ jobId });

    expect(response.status).toBe(409);

    const history = await getHistory(applicationId);

    expect(history.body.history).toHaveLength(1);
  });
});
