const { app, request, registerUser, closeDb } = require('./helpers');
const { getDb } = require('../src/db');

let recruiter, other, seeker, secondSeeker, jobId, applicationId;
const auth = user => ({ Authorization: `Bearer ${user.token}` });
const jobInput = { title: 'Demo developer', company: 'Acme', description: 'Build APIs.' };
const path = (id = jobId) => `/api/recruiter/jobs/${id}/applications`;
const patch = (status, user = recruiter, job = jobId, application = applicationId) =>
  request(app).patch(`${path(job)}/${application}`).set(auth(user)).send({ status });

async function createJob(user = recruiter) {
  const res = await request(app).post('/api/recruiter/jobs').set(auth(user)).send(jobInput);
  expect(res.status).toBe(201);
  return res.body.job.id;
}

beforeAll(async () => {
  recruiter = await registerUser({ role: 'recruiter' });
  other = await registerUser({ role: 'recruiter' });
  seeker = await registerUser({ fullName: 'Ada Candidate' });
  secondSeeker = await registerUser({ fullName: 'Grace Candidate' });
});
beforeEach(async () => {
  getDb().prepare('DELETE FROM jobs').run();
  jobId = await createJob();
  const res = await request(app).post('/api/applications').set(auth(seeker)).send({ jobId });
  expect(res.status).toBe(201);
  applicationId = res.body.application.id;
});
afterAll(() => closeDb());

test('lists only the selected posting’s applicants with names, dates and statuses, including closed postings', async () => {
  await request(app).post('/api/applications').set(auth(secondSeeker)).send({ jobId });
  const anotherJob = await createJob();
  await request(app).post('/api/applications').set(auth(seeker)).send({ jobId: anotherJob });
  await request(app).post(`/api/recruiter/jobs/${jobId}/close`).set(auth(recruiter));
  const res = await request(app).get(path()).set(auth(recruiter));
  expect(res.status).toBe(200);
  expect(res.body.job).toMatchObject({ id: jobId, title: jobInput.title, status: 'closed' });
  expect(res.body.applications).toHaveLength(2);
  expect(res.body.applications.map(a => a.candidateName)).toEqual(['Grace Candidate', 'Ada Candidate']);
  expect(res.body.applications[1]).toEqual({
    id: applicationId, candidateName: 'Ada Candidate', appliedAt: expect.any(String), status: 'Applied',
  });
});

test('returns an empty list for an owned posting without applications', async () => {
  const res = await request(app).get(path(await createJob())).set(auth(recruiter));
  expect(res.status).toBe(200);
  expect(res.body.applications).toEqual([]);
});

test.each(['Applied', 'Under Review', 'Interview', 'Offered', 'Rejected'])('persists %s and returns the updated application', async status => {
  // Existing applications can be managed after closing the posting.
  await request(app).post(`/api/recruiter/jobs/${jobId}/close`).set(auth(recruiter));
  const res = await patch(status);
  expect(res.status).toBe(200);
  expect(res.body.application).toMatchObject({ id: applicationId, candidateName: 'Ada Candidate', status });
  expect(getDb().prepare('SELECT status FROM applications WHERE id = ?').get(applicationId).status).toBe(status);
  const listed = await request(app).get(path()).set(auth(recruiter));
  expect(listed.body.applications[0].status).toBe(status);
  const mine = await request(app).get('/api/applications').set(auth(seeker));
  expect(mine.body.applications[0].status).toBe(status);
  const stats = await request(app).get('/api/applications/stats').set(auth(seeker));
  expect(stats.body.total).toBe(1);
  expect(stats.body.byStatus[status]).toBe(1);
  if (status !== 'Applied') expect(stats.body.byStatus.Applied).toBe(0);
});

test.each(['interview', 'Hired', '', null, 1, {}, ['Interview'], undefined])('rejects invalid status %# without changing the application', async status => {
  expect((await patch(status)).status).toBe(400);
  expect(getDb().prepare('SELECT status FROM applications WHERE id = ?').get(applicationId).status).toBe('Applied');
});

test('requires authentication and recruiter role on both endpoints', async () => {
  for (const token of [undefined, 'invalid-token']) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    expect((await request(app).get(path()).set(headers)).status).toBe(401);
    expect((await request(app).patch(`${path()}/${applicationId}`).set(headers).send({ status: 'Interview' })).status).toBe(401);
  }
  expect((await request(app).get(path()).set(auth(seeker))).status).toBe(403);
  expect((await patch('Interview', seeker)).status).toBe(403);
});

test('hides another recruiter’s applicants and prevents changes', async () => {
  const res = await request(app).get(path()).set(auth(other));
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Job not found.' });
  expect((await patch('Interview', other)).status).toBe(404);
  expect(getDb().prepare('SELECT status FROM applications WHERE id = ?').get(applicationId).status).toBe('Applied');
});

test('rejects an application belonging to a different posting, including one owned by the same recruiter', async () => {
  for (const owner of [recruiter, other]) {
    const anotherJob = await createJob(owner);
    const res = await patch('Interview', owner, anotherJob);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Application not found.' });
  }
  expect(getDb().prepare('SELECT status FROM applications WHERE id = ?').get(applicationId).status).toBe('Applied');
});

test.each(['abc', '0', '-1', '1.5', '01', '9007199254740992'])('rejects invalid job and application IDs: %s', async id => {
  expect((await request(app).get(path(id)).set(auth(recruiter))).status).toBe(400);
  expect((await patch('Interview', recruiter, id)).status).toBe(400);
  expect((await patch('Interview', recruiter, jobId, id)).status).toBe(400);
});

test('returns 404 for missing jobs or applications', async () => {
  expect((await request(app).get(path(999999)).set(auth(recruiter))).status).toBe(404);
  expect((await patch('Interview', recruiter, 999999)).status).toBe(404);
  expect((await patch('Interview', recruiter, jobId, 999999)).status).toBe(404);
});

describe('applicant filters', () => {
  let ids;
  beforeEach(async () => {
    // Mix SQLite's default timestamp format with ISO UTC timestamps.
    getDb().prepare('UPDATE applications SET applied_at = ?, status = ? WHERE id = ?')
      .run('2024-02-28 23:59:59', 'Applied', applicationId);
    ids = [applicationId];
    for (const [date, status] of [
      ['2024-02-29 00:00:00', 'Interview'],
      ['2024-02-29T23:59:59.999Z', 'Interview'],
      ['2024-03-01 00:00:00', 'Offered'],
      ['2024-03-02 12:00:00', 'Under Review'],
      ['2024-03-03 12:00:00', 'Rejected'],
    ]) {
      const candidate = await registerUser();
      const res = await request(app).post('/api/applications').set(auth(candidate)).send({ jobId });
      expect(res.status).toBe(201);
      ids.push(res.body.application.id);
      getDb().prepare('UPDATE applications SET applied_at = ?, status = ? WHERE id = ?')
        .run(date, status, res.body.application.id);
    }
  });

  const list = (query = {}, user = recruiter) => request(app).get(path()).query(query).set(auth(user));
  test.each([
    ['Applied', [0]], ['Under Review', [4]], ['Interview', [2, 1]], ['Offered', [3]], ['Rejected', [5]],
  ])('filters by %s', async (status, indexes) => {
    const res = await list({ status });
    expect(res.status).toBe(200);
    expect(res.body.applications.map(a => a.id)).toEqual(indexes.map(i => ids[i]));
  });

  test.each([
    [{ from: '2024-02-29' }, [5, 4, 3, 2, 1]],
    [{ to: '2024-02-29' }, [2, 1, 0]],
    [{ from: '2024-02-29', to: '2024-02-29' }, [2, 1]],
    [{ status: 'Interview', from: '2024-02-29', to: '2024-03-03' }, [2, 1]],
    [{ status: 'Offered', from: '2024-02-29', to: '2024-02-29' }, []],
    [{}, [5, 4, 3, 2, 1, 0]],
  ])('combines date/status filters with inclusive UTC boundaries: %j', async (query, indexes) => {
    const res = await list(query);
    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject({ id: jobId, title: jobInput.title, applicationCount: 6 });
    expect(res.body.applications.map(a => a.id)).toEqual(indexes.map(i => ids[i]));
  });

  test.each([
    { status: 'interview' }, { status: 'Hired' }, { status: '' }, { status: "Applied' OR 1=1 --" },
    { status: ['Applied', 'Interview'] }, { from: ['2024-02-29', '2024-03-01'] },
    ...['2023-02-29', '2024-02-30', '2024-04-31', '2024-13-01', '2024-00-01',
      '2024-01-00', '2024-2-01', 'nonsense', '', '2024-02-29T00:00:00Z'].flatMap(date => [{ from: date }, { to: date }]),
    { from: '2024-03-01', to: '2024-02-29' },
  ])('rejects invalid filters: %j', async query => {
    expect((await list(query)).status).toBe(400);
  });

  test('enforces ownership, authentication and role with active filters', async () => {
    const query = { status: 'Interview', from: '2024-02-29' };
    expect((await request(app).get(path()).query(query)).status).toBe(401);
    expect((await list(query, seeker)).status).toBe(403);
    expect((await list(query, other)).status).toBe(404);
  });
});
