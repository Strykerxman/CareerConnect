
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const tempDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'careerconnect-filters-')
);

process.env.DB_PATH = path.join(tempDir, 'test.db');

const { getDb, closeDb } = require('../src/db');
const { createApp } = require('../src/app');

const app = createApp();

beforeAll(() => {
  const db = getDb();

  const recruiterId = Number(
    db.prepare(`
      INSERT INTO users (email, password_hash, role)
      VALUES (?, ?, 'recruiter')
    `).run('filter-test@example.com', 'test-hash')
      .lastInsertRowid
  );

  const insertJob = db.prepare(`
    INSERT INTO jobs
      (recruiter_id, title, company, location,
       type, category, description, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const jobs = [
    [
      recruiterId, 'Software Developer Intern',
      'Tech Solutions', 'Montréal', 'Internship',
      'Software', 'Develop web applications', 'open'
    ],
    [
      recruiterId, 'Electrical Engineering Intern',
      'Engineering Corp', 'Toronto', 'Internship',
      'Engineering', 'Design electrical systems', 'open'
    ],
    [
      recruiterId, 'Data Analyst',
      'DataWorks', 'Montréal', 'Full-time',
      'Data Science', 'Analyze datasets', 'open'
    ],
    [
      recruiterId, 'Closed Developer',
      'Old Company', 'Montréal', 'Internship',
      'Software', 'Old position', 'closed'
    ]
  ];

  jobs.forEach(job => insertJob.run(...job));
});

afterAll(() => {
  closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('US-08 Job Filtering API', () => {

  test('returns all open jobs without filters', async () => {
    const res = await request(app).get('/api/jobs');

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(3);
  });

  test('filters jobs by location', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .query({ location: 'Montréal' });

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(2);
    expect(res.body.jobs.every(
      job => job.location === 'Montréal'
    )).toBe(true);
  });

  test('filters jobs by job type', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .query({ type: 'Internship' });

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(2);
    expect(res.body.jobs.every(
      job => job.type === 'Internship'
    )).toBe(true);
  });

  test('filters jobs by category', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .query({ category: 'Engineering' });

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].title)
      .toBe('Electrical Engineering Intern');
  });

  test('combines multiple filters', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .query({
        location: 'Montréal',
        type: 'Internship',
        category: 'Software'
      });

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].title)
      .toBe('Software Developer Intern');
  });

  test('returns no jobs for unmatched filters', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .query({ location: 'Vancouver' });

    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
  });

  test('excludes closed jobs', async () => {
    const res = await request(app).get('/api/jobs');

    expect(res.status).toBe(200);
    expect(res.body.jobs.some(
      job => job.title === 'Closed Developer'
    )).toBe(false);
  });

});
