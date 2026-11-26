const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const request = require('supertest');
const { getDb, closeDb } = require('../src/db');
const { createApp } = require('../src/app');
const { signToken } = require('../src/middleware/auth');

test('upgrades a Sprint 3 database and persists history and interviews for an existing application', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-db-upgrade-'));
  const { DB_PATH: originalDbPath, UPLOAD_DIR: originalUploadDir } = process.env;
  const databasePath = path.join(directory, 'careerconnect.db');

  try {
    process.env.DB_PATH = databasePath;
    process.env.UPLOAD_DIR = path.join(directory, 'uploads');

    // Build the old database before the current app can initialize it.
    const legacyDb = new Database(databasePath);
    try {
      const fixturePath = path.join(__dirname, 'fixtures', 'sprint-3.sql');
      legacyDb.exec(fs.readFileSync(fixturePath, 'utf8'));
    } finally {
      legacyDb.close();
    }

    getDb(); // The same schema initialization used by server startup.
    const api = request(createApp());
    const seeker = `Bearer ${signToken({ id: 1, role: 'job_seeker' })}`;
    const recruiter = `Bearer ${signToken({ id: 2, role: 'recruiter' })}`;
    const historyUrl = '/api/applications/21/history';

    const originalHistory = await api.get(historyUrl)
      .set('Authorization', seeker).expect(200);
    expect(originalHistory.body).toMatchObject({
      applicationId: 21,
      currentStatus: 'Applied',
      appliedAt: '2026-11-18 12:00:00',
    });
    expect(originalHistory.body.history).toEqual([]);

    await api.patch('/api/recruiter/jobs/11/applications/21')
      .set('Authorization', recruiter)
      .send({ status: 'Under Review' })
      .expect(200);

    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const interview = await api.post('/api/interviews')
      .set('Authorization', recruiter)
      .send({ applicationId: 21, scheduledAt, durationMinutes: 30, location: 'Video call' })
      .expect(201);

    // Reopen the same SQLite file so these checks prove on-disk persistence.
    closeDb();
    getDb();

    const applications = await api.get('/api/applications')
      .set('Authorization', seeker).expect(200);
    expect(applications.body.applications).toMatchObject([
      { id: 21, jobId: 11, title: 'Developer', status: 'Under Review' },
    ]);

    const history = await api.get(historyUrl).set('Authorization', seeker).expect(200);
    expect(history.body.currentStatus).toBe('Under Review');
    expect(history.body.history.map(({ status }) => status)).toEqual(['Under Review']);

    const interviews = await api.get('/api/interviews')
      .set('Authorization', seeker).expect(200);
    expect(interviews.body.interviews).toMatchObject([
      { id: interview.body.interview.id, applicationId: 21, scheduledAt, status: 'scheduled' },
    ]);
  } finally {
    closeDb();
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = originalUploadDir;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
