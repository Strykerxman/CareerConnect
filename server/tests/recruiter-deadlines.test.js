const { app, request, registerUser, closeDb } = require('./helpers');
const { getDb } = require('../src/db');

let recruiter, other, seeker;
const auth = user => ({ Authorization: `Bearer ${user.token}` });
const posting = { title: 'Developer', company: 'Acme', description: 'Build our app.' };
const create = deadline => request(app).post('/api/recruiter/jobs').set(auth(recruiter))
  .send({ ...posting, ...(deadline === undefined ? {} : { application_deadline: deadline }) });
const edit = (id, body, user = recruiter) => request(app).patch(`/api/recruiter/jobs/${id}`)
  .set(auth(user)).send(body);

beforeAll(async () => {
  recruiter = await registerUser({ role: 'recruiter' });
  other = await registerUser({ role: 'recruiter' });
  seeker = await registerUser();
});
beforeEach(() => getDb().prepare('DELETE FROM jobs').run());
afterAll(closeDb);

test('saves a deadline and returns it in recruiter and public job responses', async () => {
  const res = await create('2028-02-29');
  expect(res.status).toBe(201);
  const id = res.body.job.id;
  expect(res.body.job.application_deadline).toBe('2028-02-29');
  for (const path of [`/api/recruiter/jobs/${id}`, `/api/jobs/${id}`]) {
    const result = await request(app).get(path).set(auth(recruiter));
    expect(result.status).toBe(200);
    expect(result.body.job.application_deadline).toBe('2028-02-29');
  }
  const list = await request(app).get('/api/recruiter/jobs').set(auth(recruiter));
  expect(list.body.jobs[0].application_deadline).toBe('2028-02-29');
});

test.each([undefined, '', null, '   '])('allows an optional deadline: %p', async value => {
  const res = await create(value);
  expect(res.status).toBe(201);
  expect(res.body.job.application_deadline).toBeNull();
});

test('changes a deadline, preserves it on unrelated edits, and clears it', async () => {
  const id = (await create('2028-02-29')).body.job.id;
  let res = await edit(id, { application_deadline: '2028-03-05' });
  expect(res.status).toBe(200);
  expect(res.body.job.application_deadline).toBe('2028-03-05');
  res = await edit(id, { title: 'Senior developer' });
  expect(res.body.job.application_deadline).toBe('2028-03-05');
  for (const value of ['', null]) {
    res = await edit(id, { application_deadline: value });
    expect(res.status).toBe(200);
    expect(res.body.job.application_deadline).toBeNull();
  }
});

test.each(['2027-02-29', '2028-02-30', '2028-04-31', '2028-13-01', '0000-01-01',
  '2028-2-01', 'tomorrow', '2028-03-01T00:00:00Z', 20280301, false, [], {}].map(value => [value]))(
  'rejects invalid deadlines on create and update: %p', async deadline => {
    expect((await create(deadline)).status).toBe(400);
    const id = (await create('2028-02-29')).body.job.id;
    const res = await edit(id, { application_deadline: deadline });
    expect(res.status).toBe(400);
    expect(res.body.errors.application_deadline).toBeTruthy();
    expect(getDb().prepare('SELECT application_deadline FROM jobs WHERE id = ?').get(id)
      .application_deadline).toBe('2028-02-29');
  }
);

test('only the posting owner can change its deadline', async () => {
  const id = (await create('2028-02-29')).body.job.id;
  expect((await edit(id, { application_deadline: null }, other)).status).toBe(404);
  expect((await edit(id, { application_deadline: null }, seeker)).status).toBe(403);
  expect((await request(app).patch(`/api/recruiter/jobs/${id}`)
    .send({ application_deadline: null })).status).toBe(401);
  expect(getDb().prepare('SELECT application_deadline FROM jobs WHERE id = ?').get(id)
    .application_deadline).toBe('2028-02-29');
});

test('a recruiter-entered deadline feeds saved-job reminders and notifications', async () => {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const deadline = tomorrow.toISOString().slice(0, 10);
  const created = await create(deadline);
  expect(created.status).toBe(201);
  const id = created.body.job.id;
  expect((await request(app).post(`/api/saved-jobs/${id}`).set(auth(seeker))).status).toBe(201);
  const reminders = await request(app).get('/api/reminders').set(auth(seeker));
  expect(reminders.body.reminders).toEqual([
    expect.objectContaining({ jobId: id, application_deadline: deadline }),
  ]);
  const notices = await request(app).get('/api/notifications').set(auth(seeker));
  expect(notices.body.notifications).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'deadline_reminder', link: `/jobs/${id}` }),
  ]));
  expect((await edit(id, { application_deadline: '' })).status).toBe(200);
  expect((await request(app).get('/api/reminders').set(auth(seeker))).body.reminders).toEqual([]);
});
