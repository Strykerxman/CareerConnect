
const {
  app, request, registerUser, closeDb
} = require('./helpers');

const { getDb } = require('../src/db');

let recruiter;
let seeker;
let otherSeeker;

// Generate a date relative to today using UTC
function dateAfter(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

beforeAll(async () => {
  recruiter = await registerUser({ role: 'recruiter' });
  seeker = await registerUser({ role: 'job_seeker' });
  otherSeeker = await registerUser({ role: 'job_seeker' });
});

beforeEach(() => {
  const db = getDb();
  db.prepare('DELETE FROM saved_jobs').run();
  db.prepare('DELETE FROM jobs').run();
});

afterAll(() => closeDb());

// Create a sample job for testing
function createJob(title, deadline) {
  const result = getDb().prepare(`
    INSERT INTO jobs (
      recruiter_id, title, company,
      description, application_deadline
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    recruiter.res.body.user.id,
    title,
    'Example Company',
    'Example job description',
    deadline
  );

  return Number(result.lastInsertRowid);
}

// Save a job using the existing API
function saveJob(token, jobId) {
  return request(app)
    .post(`/api/saved-jobs/${jobId}`)
    .set('Authorization', `Bearer ${token}`);
}

// Get the user's upcoming reminders
function getReminders(token) {
  return request(app)
    .get('/api/reminders')
    .set('Authorization', `Bearer ${token}`);
}

describe('US-13 / Task 13.2 - Deadline Reminders API', () => {

  test('returns saved jobs due within 3 days', async () => {
    const today = createJob('Due Today', dateAfter(0));
    const soon = createJob('Due Soon', dateAfter(2));
    const boundary = createJob('Due in 3 Days', dateAfter(3));
    const expired = createJob('Expired', dateAfter(-1));
    const later = createJob('Due Later', dateAfter(4));
    const noDeadline = createJob('No Deadline', null);

    for (const id of [
      today, soon, boundary, expired, later, noDeadline
    ]) {
      const response = await saveJob(seeker.token, id);
      expect(response.status).toBe(201);
    }

    // This job is within 3 days, but was not saved.
    createJob('Unsaved Job', dateAfter(1));

    const res = await getReminders(seeker.token);

    expect(res.status).toBe(200);
    expect(res.body.reminders.map(job => job.jobId))
      .toEqual([today, soon, boundary]);

    expect(res.body.reminders[0]).toMatchObject({
      title: 'Due Today',
      company: 'Example Company',
      application_deadline: dateAfter(0)
    });
  });

  test('returns an empty list when there are no reminders', async () => {
    const res = await getReminders(seeker.token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reminders: [] });
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/reminders');

    expect(res.status).toBe(401);
  });

  test('rejects recruiter accounts', async () => {
    const res = await getReminders(recruiter.token);

    expect(res.status).toBe(403);
  });

  test('keeps reminders private to each job seeker', async () => {
    const jobId = createJob('Private Job', dateAfter(1));

    await saveJob(otherSeeker.token, jobId);

    const res = await getReminders(seeker.token);

    expect(res.status).toBe(200);
    expect(res.body.reminders).toEqual([]);
  });

  test('excludes saved jobs that have been closed', async () => {
    const jobId = createJob('Closed Job', dateAfter(1));

    await saveJob(seeker.token, jobId);

    getDb().prepare(`
      UPDATE jobs SET status = 'closed' WHERE id = ?
    `).run(jobId);

    const res = await getReminders(seeker.token);

    expect(res.status).toBe(200);
    expect(res.body.reminders).toEqual([]);
  });


  test('rejects invalid authentication tokens', async () => {
    const res = await getReminders('invalid-token');

    expect(res.status).toBe(401);
  });
      
  test('removes a reminder when the job is unsaved', async () => {
    // Create a job with a deadline tomorrow
    const jobId = createJob('Software Intern', dateAfter(1));

    // Save the job
    const save = await saveJob(seeker.token, jobId);
    expect(save.status).toBe(201);

    // Verify the reminder exists
    const before = await getReminders(seeker.token);

    expect(before.body.reminders.map(job => job.jobId))
      .toContain(jobId);

    // Unsave the job
    const unsave = await request(app)
      .delete(`/api/saved-jobs/${jobId}`)
      .set('Authorization', `Bearer ${seeker.token}`);

    expect(unsave.status).toBe(204);

    // The reminder should disappear
    const after = await getReminders(seeker.token);

    expect(after.status).toBe(200);
    expect(after.body.reminders).toEqual([]);
  });

});
