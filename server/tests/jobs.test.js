const { app, request, registerUser, closeDb } = require('./helpers');
const { getDb } = require('../src/db');

let recruiterId;

beforeAll(async () => {
  const { res } = await registerUser({ role: 'recruiter' });
  recruiterId = res.body.user.id;
});
beforeEach(() => getDb().prepare('DELETE FROM jobs').run());
afterAll(() => closeDb());

function addJob(overrides = {}) {
  const job = {
    recruiter_id: recruiterId,
    title: 'Software Developer',
    company: 'Example Company',
    location: 'Montreal',
    type: 'Full-time',
    category: 'Engineering',
    description: 'Build web applications.',
    requirements: 'Experience with JavaScript.',
    status: 'open',
    created_at: '2026-10-22 12:00:00',
    ...overrides,
  };
  const result = getDb().prepare(`
    INSERT INTO jobs (recruiter_id, title, company, location, type, category,
                      description, requirements, status, created_at)
    VALUES (@recruiter_id, @title, @company, @location, @type, @category,
            @description, @requirements, @status, @created_at)
  `).run(job);
  return Number(result.lastInsertRowid);
}

describe('US-06 / Task 6.1 — browse available jobs', () => {
  test('returns an empty list when there are no postings', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ jobs: [] });
  });

  test('allows browsing without login and returns fields needed by job cards and details', async () => {
    const id = addJob();
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ jobs: [{
      id,
      title: 'Software Developer',
      company: 'Example Company',
      location: 'Montreal',
      type: 'Full-time',
      category: 'Engineering',
      description: 'Build web applications.',
      requirements: 'Experience with JavaScript.',
      created_at: '2026-10-22 12:00:00',
    }] });
  });

  test('excludes closed postings, including when every posting is closed', async () => {
    addJob({ status: 'closed' });
    const openId = addJob({ title: 'Open position' });
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body.jobs.map(job => job.id)).toEqual([openId]);

    getDb().prepare("UPDATE jobs SET status = 'closed'").run();
    const closed = await request(app).get('/api/jobs');
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual({ jobs: [] });
  });

  test('lists jobs from different recruiters newest first with a stable order for ties', async () => {
    const { res: recruiter } = await registerUser({ role: 'recruiter' });
    const oldest = addJob({ created_at: '2026-10-20 12:00:00' });
    const newest = addJob({ recruiter_id: recruiter.body.user.id });
    const sameTime = addJob();
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body.jobs.map(job => job.id)).toEqual([sameTime, newest, oldest]);
  });
});
