const { app, request, registerUser, closeDb } = require('./helpers');
const { getDb } = require('../src/db');

let recruiter, otherRecruiter, seeker, otherSeeker, applicationId;
const auth = user => ({ Authorization: `Bearer ${user.token}` });
const future = days => new Date(Date.now() + days * 86400000).toISOString();
const payload = () => ({ applicationId, scheduledAt: future(3), durationMinutes: 45, location: 'Video call', notes: 'Bring your portfolio' });
const create = (user = recruiter, data = payload()) => request(app).post('/api/interviews').set(auth(user)).send(data);
const list = user => request(app).get('/api/interviews').set(auth(user));

beforeAll(async () => {
  recruiter = await registerUser({ role: 'recruiter', fullName: 'Recruiter' });
  otherRecruiter = await registerUser({ role: 'recruiter' });
  seeker = await registerUser({ fullName: 'Ada Candidate' });
  otherSeeker = await registerUser();
});

beforeEach(async () => {
  const db = getDb();
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM jobs').run();
  const job = await request(app).post('/api/recruiter/jobs').set(auth(recruiter))
    .send({ title: 'Developer', company: 'Acme', description: 'Build things.' });
  const application = await request(app).post('/api/applications').set(auth(seeker)).send({ jobId: job.body.job.id });
  applicationId = application.body.application.id;
  db.prepare('DELETE FROM notifications').run();
});

afterAll(() => closeDb());

test('creates and lists interviews only for the participants', async () => {
  const input = payload();
  const result = await create(recruiter, input);
  expect(result.status).toBe(201);
  expect(result.body.interview).toMatchObject({ ...input, jobTitle: 'Developer', company: 'Acme', candidateName: 'Ada Candidate', status: 'scheduled' });
  expect((await list(recruiter)).body.interviews).toHaveLength(1);
  expect((await list(seeker)).body.interviews).toHaveLength(1);
  expect((await list(otherSeeker)).body.interviews).toEqual([]);
  expect((await list(otherRecruiter)).body.interviews).toEqual([]);
  expect((await request(app).get('/api/interviews')).status).toBe(401);
});

test('validates scheduling details, timezone, calendar date and ownership', async () => {
  expect((await create(seeker)).status).toBe(403);
  expect((await create(otherRecruiter)).status).toBe(404);
  for (const scheduledAt of ['2030-02-30T12:00:00Z', '2030-01-01T12:00', '2020-01-01T12:00:00Z']) {
    expect((await create(recruiter, { ...payload(), scheduledAt })).status).toBe(400);
  }
  for (const change of [{ durationMinutes: 0 }, { location: ' ' }, { notes: 'a'.repeat(2001) }, { applicationId: -1 }]) {
    expect((await create(recruiter, { ...payload(), ...change })).status).toBe(400);
  }
  expect((await list(seeker)).body.interviews).toEqual([]);
});

test('reschedules and cancels with notifications; repeated and unauthorized changes do not notify', async () => {
  const created = await create();
  const id = created.body.interview.id;
  const scheduledAt = future(5);
  const url = `/api/interviews/${id}`;
  expect((await request(app).patch(url).set(auth(otherRecruiter)).send({ scheduledAt })).status).toBe(404);
  expect((await request(app).patch(url).set(auth(seeker)).send({ scheduledAt })).status).toBe(403);
  const changed = await request(app).patch(url).set(auth(recruiter)).send({ scheduledAt, location: 'Office' });
  expect(changed.status).toBe(200);
  expect(changed.body.interview).toMatchObject({ scheduledAt, location: 'Office' });
  expect((await request(app).patch(url).set(auth(recruiter)).send({ scheduledAt, location: 'Office' })).status).toBe(200);
  expect((await request(app).post(`${url}/cancel`).set(auth(otherRecruiter))).status).toBe(404);
  const cancelled = await request(app).post(`${url}/cancel`).set(auth(recruiter));
  expect(cancelled.body.interview.status).toBe('cancelled');
  expect((await request(app).post(`${url}/cancel`).set(auth(recruiter))).status).toBe(409);
  expect((await request(app).patch(url).set(auth(recruiter)).send({ scheduledAt: future(6) })).status).toBe(409);
  const notifications = (await request(app).get('/api/notifications').set(auth(seeker))).body.notifications;
  expect(notifications).toHaveLength(3);
  expect(notifications.map(n => n.type)).toEqual(Array(3).fill('interview_invitation'));
  expect(notifications.every(n => n.link === '/interviews')).toBe(true);
  expect((await request(app).get('/api/notifications').set(auth(otherSeeker))).body.notifications).toEqual([]);
});

test('past interviews cannot be changed or cancelled', async () => {
  const { body } = await create();
  const id = body.interview.id;
  getDb().prepare('UPDATE interviews SET scheduled_at = ? WHERE id = ?').run('2020-01-01T12:00:00.000Z', id);
  expect((await request(app).patch(`/api/interviews/${id}`).set(auth(recruiter)).send({ scheduledAt: future(4) })).status).toBe(409);
  expect((await request(app).post(`/api/interviews/${id}/cancel`).set(auth(recruiter))).status).toBe(409);
});

test('updating interview details without changing the time sends an update', async () => {
  const { body } = await create();
  const response = await request(app).patch(`/api/interviews/${body.interview.id}`)
    .set(auth(recruiter)).send({ location: 'Room 2' });
  expect(response.status).toBe(200);
  const notifications = (await request(app).get('/api/notifications').set(auth(seeker))).body.notifications;
  expect(notifications).toHaveLength(2);
  expect(notifications.some(notification => notification.title === 'Interview updated')).toBe(true);
});

test('rolls back interview creation if notification delivery fails', async () => {
  const db = getDb();
  db.exec("CREATE TRIGGER fail_interview_notification BEFORE INSERT ON notifications WHEN NEW.type = 'interview_invitation' BEGIN SELECT RAISE(ABORT, 'notification failed'); END");
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect((await create()).status).toBe(500);
    expect(db.prepare('SELECT COUNT(*) AS count FROM interviews').get().count).toBe(0);
  } finally {
    db.exec('DROP TRIGGER fail_interview_notification');
    spy.mockRestore();
  }
});
