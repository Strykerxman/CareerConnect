const { app, request, registerUser, closeDb } = require('./helpers');
const { getDb } = require('../src/db');

// US-16 - Notifications (Tasks 16.1 to 16.3, tests for Task 16.5)

let recruiter, otherRecruiter, seeker, otherSeeker;
const auth = user => ({ Authorization: `Bearer ${user.token}` });
const userId = user => user.res.body.user.id;

function dateAfter(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function createJob(user = recruiter, overrides = {}) {
  const res = await request(app).post('/api/recruiter/jobs').set(auth(user))
    .send({ title: 'Backend Developer', company: 'Acme', description: 'Build APIs.', ...overrides });
  expect(res.status).toBe(201);
  return res.body.job.id;
}

async function apply(user, jobId) {
  const res = await request(app).post('/api/applications').set(auth(user)).send({ jobId });
  expect(res.status).toBe(201);
  return res.body.application.id;
}

function setStatus(jobId, applicationId, status, user = recruiter) {
  return request(app).patch(`/api/recruiter/jobs/${jobId}/applications/${applicationId}`)
    .set(auth(user)).send({ status });
}

function list(user) {
  return request(app).get('/api/notifications').set(auth(user));
}

function insertNotification(user, overrides = {}) {
  const result = getDb().prepare(`
    INSERT INTO notifications (user_id, type, title, message, link, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userId(user),
    overrides.type || 'application_status',
    overrides.title || 'Application update',
    overrides.message || 'Something changed.',
    overrides.link || '/applications',
    overrides.createdAt || '2026-01-01 10:00:00'
  );
  return Number(result.lastInsertRowid);
}

beforeAll(async () => {
  recruiter = await registerUser({ role: 'recruiter', fullName: 'Rita Recruiter' });
  otherRecruiter = await registerUser({ role: 'recruiter' });
  seeker = await registerUser({ fullName: 'Ada Candidate' });
  otherSeeker = await registerUser({ fullName: 'Grace Candidate' });
});

beforeEach(() => {
  const db = getDb();
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM jobs').run();
});

afterAll(() => closeDb());

describe('Task 16.1 - notifications table', () => {
  test('rejects unknown notification types', () => {
    expect(() => insertNotification(seeker, { type: 'spam' })).toThrow(/CHECK constraint/);
  });

  test('deletes a user’s notifications when the user is deleted', async () => {
    const temp = await registerUser();
    insertNotification(temp);
    getDb().prepare('DELETE FROM users WHERE id = ?').run(userId(temp));
    const left = getDb().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?').get(userId(temp));
    expect(left.n).toBe(0);
  });
});

describe('Task 16.3 - notifications created by events', () => {
  test('AT-US16-02: the recruiter is notified of a new application, naming the candidate and posting', async () => {
    const jobId = await createJob();
    await apply(seeker, jobId);

    const res = await list(recruiter);
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.notifications).toEqual([{
      id: expect.any(Number),
      type: 'new_application',
      title: 'New application',
      message: 'Ada Candidate applied to Backend Developer.',
      link: `/recruiter/jobs/${jobId}/applications`,
      isRead: false,
      createdAt: expect.any(String),
    }]);

    // Nobody else hears about it.
    expect((await list(otherRecruiter)).body.notifications).toEqual([]);
    expect((await list(seeker)).body.notifications).toEqual([]);
  });

  test('AT-US16-01: the job seeker is notified of a status change with the job title and new status', async () => {
    const jobId = await createJob();
    const applicationId = await apply(seeker, jobId);
    await apply(otherSeeker, jobId);

    expect((await setStatus(jobId, applicationId, 'Under Review')).status).toBe(200);

    const res = await list(seeker);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({
      type: 'application_status',
      message: 'Your application for Backend Developer at Acme is now Under Review.',
      link: '/applications',
      isRead: false,
    });
    expect((await list(otherSeeker)).body.notifications).toEqual([]);
  });

  test('a change to Interview is sent as an interview invitation', async () => {
    const jobId = await createJob();
    const applicationId = await apply(seeker, jobId);
    await setStatus(jobId, applicationId, 'Interview');

    const [notification] = (await list(seeker)).body.notifications;
    expect(notification).toMatchObject({
      type: 'interview_invitation',
      title: 'Interview invitation',
      message: 'You have been invited to interview for Backend Developer at Acme.',
    });
  });

  test('saving the same status again does not create a notification', async () => {
    const jobId = await createJob();
    const applicationId = await apply(seeker, jobId);

    expect((await setStatus(jobId, applicationId, 'Applied')).status).toBe(200);
    expect((await list(seeker)).body.notifications).toHaveLength(0);

    await setStatus(jobId, applicationId, 'Offered');
    await setStatus(jobId, applicationId, 'Offered');
    expect((await list(seeker)).body.notifications).toHaveLength(1);
  });

  test('a rejected status update creates no notification', async () => {
    const jobId = await createJob();
    const applicationId = await apply(seeker, jobId);

    expect((await setStatus(jobId, applicationId, 'Hired')).status).toBe(400);
    expect((await setStatus(jobId, applicationId, 'Interview', otherRecruiter)).status).toBe(404);
    expect((await list(seeker)).body.notifications).toEqual([]);
  });

  test('a duplicate application does not notify the recruiter twice', async () => {
    const jobId = await createJob();
    await apply(seeker, jobId);
    const again = await request(app).post('/api/applications').set(auth(seeker)).send({ jobId });
    expect(again.status).toBe(409);
    expect((await list(recruiter)).body.notifications).toHaveLength(1);
  });

  describe('deadline reminders', () => {
    async function saveJobWithDeadline(days) {
      const jobId = await createJob();
      getDb().prepare('UPDATE jobs SET application_deadline = ? WHERE id = ?').run(dateAfter(days), jobId);
      const res = await request(app).post(`/api/saved-jobs/${jobId}`).set(auth(seeker));
      expect(res.status).toBe(201);
      return jobId;
    }

    afterEach(() => getDb().prepare('DELETE FROM saved_jobs').run());

    test('reminds the job seeker once about a saved job closing within 3 days', async () => {
      const soon = await saveJobWithDeadline(2);
      await saveJobWithDeadline(5);
      await saveJobWithDeadline(-1);

      const first = await list(seeker);
      expect(first.body.notifications).toHaveLength(1);
      expect(first.body.notifications[0]).toMatchObject({
        type: 'deadline_reminder',
        message: `Applications for Backend Developer at Acme close on ${dateAfter(2)}.`,
        link: `/jobs/${soon}`,
      });

      // Checking again (list or badge) does not repeat the reminder.
      await request(app).get('/api/notifications/unread-count').set(auth(seeker));
      expect((await list(seeker)).body.notifications).toHaveLength(1);
    });

    test('does not remind again after the reminder is dismissed', async () => {
      await saveJobWithDeadline(1);
      const [reminder] = (await list(seeker)).body.notifications;
      await request(app).delete(`/api/notifications/${reminder.id}`).set(auth(seeker));
      expect((await list(seeker)).body.notifications).toHaveLength(1);
    });
  });
});

describe('Task 16.2 - notifications API', () => {
  test('lists newest first with the unread count', async () => {
    const older = insertNotification(seeker, { createdAt: '2026-01-01 09:00:00' });
    const newer = insertNotification(seeker, { createdAt: '2026-01-02 09:00:00' });
    insertNotification(otherSeeker);

    const res = await list(seeker);
    expect(res.body.notifications.map(n => n.id)).toEqual([newer, older]);
    expect(res.body.unreadCount).toBe(2);

    const count = await request(app).get('/api/notifications/unread-count').set(auth(seeker));
    expect(count.status).toBe(200);
    expect(count.body).toEqual({ unreadCount: 2 });
  });

  test('marks one notification as read', async () => {
    const id = insertNotification(seeker);
    insertNotification(seeker);

    const res = await request(app).patch(`/api/notifications/${id}/read`).set(auth(seeker));
    expect(res.status).toBe(200);
    expect(res.body.notification).toMatchObject({ id, isRead: true });
    expect(res.body.unreadCount).toBe(1);

    // Marking it again is harmless.
    expect((await request(app).patch(`/api/notifications/${id}/read`).set(auth(seeker))).status).toBe(200);
  });

  test('marks all of the user’s notifications as read, and only theirs', async () => {
    insertNotification(seeker);
    insertNotification(seeker);
    insertNotification(otherSeeker);

    const res = await request(app).post('/api/notifications/read-all').set(auth(seeker));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ updated: 2, unreadCount: 0 });
    expect((await list(otherSeeker)).body.unreadCount).toBe(1);
  });

  test('dismisses a notification', async () => {
    const id = insertNotification(seeker);
    const res = await request(app).delete(`/api/notifications/${id}`).set(auth(seeker));
    expect(res.status).toBe(204);
    expect((await list(seeker)).body.notifications).toEqual([]);
    expect((await request(app).delete(`/api/notifications/${id}`).set(auth(seeker))).status).toBe(404);
  });

  test('returns 404 for another user’s notification and leaves it untouched', async () => {
    const id = insertNotification(otherSeeker);

    const read = await request(app).patch(`/api/notifications/${id}/read`).set(auth(seeker));
    expect(read.status).toBe(404);
    expect(read.body).toEqual({ error: 'Notification not found.' });
    expect((await request(app).delete(`/api/notifications/${id}`).set(auth(seeker))).status).toBe(404);

    const [mine] = (await list(otherSeeker)).body.notifications;
    expect(mine).toMatchObject({ id, isRead: false });
  });

  test('returns 404 for a notification that does not exist', async () => {
    expect((await request(app).patch('/api/notifications/999999/read').set(auth(seeker))).status).toBe(404);
  });

  test.each(['abc', '0', '-1', '1.5', '99999999999999999999'])('returns 400 for malformed ID %s', async id => {
    const res = await request(app).patch(`/api/notifications/${id}/read`).set(auth(seeker));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid notification ID.' });
    expect((await request(app).delete(`/api/notifications/${id}`).set(auth(seeker))).status).toBe(400);
  });

  test.each([
    ['get', '/api/notifications'],
    ['get', '/api/notifications/unread-count'],
    ['post', '/api/notifications/read-all'],
    ['patch', '/api/notifications/1/read'],
    ['delete', '/api/notifications/1'],
  ])('%s %s returns 401 without a token', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });
});
