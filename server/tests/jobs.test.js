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

describe('US-07 / Task 7.4 — job keyword search', () => {
  test.each(['title', 'company', 'description'])('matches a substring in %s independently', async field => {
    const id = addJob({ [field]: 'A needle in this field' });
    addJob();

    const res = await request(app).get('/api/jobs').query({ q: 'needle' });
    expect(res.status).toBe(200);
    expect(res.body.jobs.map(job => job.id)).toEqual([id]);
  });

  test.each(['developer', 'DEVELOPER', '  DeVeLoPeR\t'])('ignores case and surrounding whitespace in %j', async q => {
    const id = addJob();
    addJob({ title: 'Product Designer' });

    const res = await request(app).get('/api/jobs').query({ q });
    expect(res.status).toBe(200);
    expect(res.body.jobs.map(job => job.id)).toEqual([id]);
  });

  test.each(['', ' \t\n '])('returns the unfiltered open list for blank query %j', async q => {
    addJob();
    addJob({ title: 'Product Designer' });
    addJob({ status: 'closed' });

    const unfiltered = await request(app).get('/api/jobs');
    const res = await request(app).get('/api/jobs').query({ q });
    expect(unfiltered.status).toBe(200);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(unfiltered.body);
    expect(res.body.jobs).toHaveLength(2);
  });

  test('returns an empty list with 200 when no postings match', async () => {
    addJob();
    const res = await request(app).get('/api/jobs').query({ q: 'zzzz' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ jobs: [] });
  });

  test('does not search location, category, or requirements', async () => {
    addJob({ location: 'needle', category: 'needle', requirements: 'needle' });
    const res = await request(app).get('/api/jobs').query({ q: 'needle' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ jobs: [] });
  });

  test('excludes matching closed postings', async () => {
    addJob({ status: 'closed' });
    const id = addJob();
    const res = await request(app).get('/api/jobs').query({ q: 'developer' });
    expect(res.status).toBe(200);
    expect(res.body.jobs.map(job => job.id)).toEqual([id]);
  });

  test('preserves public response fields and newest-first ordering with timestamp ties', async () => {
    const oldest = addJob({ created_at: '2026-10-20 12:00:00' });
    const newest = addJob();
    const sameTime = addJob();
    const nonMatch = addJob({ title: 'Product Designer' });

    const unfiltered = await request(app).get('/api/jobs');
    const res = await request(app).get('/api/jobs').query({ q: 'developer' });
    expect(unfiltered.status).toBe(200);
    expect(res.status).toBe(200);
    expect(res.body.jobs.map(job => job.id)).toEqual([sameTime, newest, oldest]);
    expect(res.body).toEqual({ jobs: unfiltered.body.jobs.filter(job => job.id !== nonMatch) });
    for (const job of res.body.jobs) {
      expect(Object.keys(job).sort()).toEqual([
        'id', 'title', 'company', 'location', 'type', 'category',
        'description', 'requirements', 'created_at',
      ].sort());
    }
  });

  test('matches accented case pairs', async () => {
    const id = addJob({ title: 'Développeur logiciel' });
    addJob();
    const res = await request(app).get('/api/jobs').query({ q: 'DÉVELOPPEUR' });
    expect(res.status).toBe(200);
    expect(res.body.jobs.map(job => job.id)).toEqual([id]);
  });

  test.each(['%', '_', "' OR 1=1 --"])('treats %j as literal search text', async q => {
    const id = addJob({ title: `Position containing ${q}` });
    addJob();
    const res = await request(app).get('/api/jobs').query({ q });
    expect(res.status).toBe(200);
    expect(res.body.jobs.map(job => job.id)).toEqual([id]);
  });

  test('rejects repeated q parameters with a clear 400 response', async () => {
    addJob();
    const res = await request(app).get('/api/jobs?q=developer&q=designer');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Search keyword must be a single string.' });
  });
});
