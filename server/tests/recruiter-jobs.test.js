const { app, request, registerUser, closeDb } = require('./helpers');
const { getDb } = require('../src/db');

let recruiter, other, seeker;
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const valid = {
  title: 'Backend Developer',
  company: 'Acme',
  location: 'Montreal',
  type: 'Full-time',
  category: 'Engineering',
  description: 'Build APIs.',
  requirements: 'Node.js',
};

beforeAll(async () => {
  recruiter = await registerUser({ role: 'recruiter' });
  other = await registerUser({ role: 'recruiter' });
  seeker = await registerUser({ role: 'job_seeker' });
});
beforeEach(() => getDb().prepare('DELETE FROM jobs').run());
afterAll(() => closeDb());

const create = (u = recruiter, body = valid) =>
  request(app).post('/api/recruiter/jobs').set(auth(u)).send(body);

describe('access control', () => {
  test('401 without a token', async () => {
    expect((await request(app).get('/api/recruiter/jobs')).status).toBe(401);
    expect((await request(app).post('/api/recruiter/jobs').send(valid)).status).toBe(401);
  });

  test('403 for job seekers on every route', async () => {
    const id = (await create()).body.job.id;
    const h = auth(seeker);
    const calls = [
      request(app).get('/api/recruiter/jobs').set(h),
      request(app).post('/api/recruiter/jobs').set(h).send(valid),
      request(app).get(`/api/recruiter/jobs/${id}`).set(h),
      request(app).patch(`/api/recruiter/jobs/${id}`).set(h).send({ title: 'x' }),
      request(app).post(`/api/recruiter/jobs/${id}/close`).set(h),
      request(app).delete(`/api/recruiter/jobs/${id}`).set(h),
    ];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(403);
  });
});

describe('create', () => {
  test('creates an open posting owned by the recruiter', async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.job).toMatchObject({ ...valid, status: 'open', applicationCount: 0 });
    const row = getDb().prepare('SELECT recruiter_id FROM jobs WHERE id = ?').get(res.body.job.id);
    expect(row.recruiter_id).toBe(recruiter.res.body.user.id);
  });

  test('appears in the public listing', async () => {
    await create();
    const res = await request(app).get('/api/jobs');
    expect(res.body.jobs).toHaveLength(1);
  });

  test('trims whitespace and ignores client-supplied recruiter_id', async () => {
    const res = await create(recruiter, {
      ...valid, title: '  Padded  ', recruiter_id: 999,
    });
    expect(res.status).toBe(201);
    expect(res.body.job.title).toBe('Padded');
    expect(res.body.job.status).toBe('open');
    const row = getDb().prepare('SELECT recruiter_id FROM jobs WHERE id = ?').get(res.body.job.id);
    expect(row.recruiter_id).toBe(recruiter.res.body.user.id);
  });

  test('can be saved as closed, which keeps it hidden from job seekers', async () => {
    const res = await create(recruiter, { ...valid, status: 'closed' });
    expect(res.status).toBe(201);
    expect(res.body.job.status).toBe('closed');
    const id = res.body.job.id;
    expect((await request(app).get('/api/jobs')).body.jobs).toHaveLength(0);
    expect((await request(app).get(`/api/jobs/${id}`)).status).toBe(404);
    expect((await request(app).get(`/api/recruiter/jobs/${id}`).set(auth(recruiter))).status).toBe(200);
  });

  test('400 for an invalid status on create', async () => {
    for (const status of ['draft', 'OPEN', '', null, 1]) {
      const res = await create(recruiter, { ...valid, status });
      expect(res.status).toBe(400);
      expect(res.body.errors.status).toBeDefined();
    }
    expect((await request(app).get('/api/recruiter/jobs').set(auth(recruiter))).body.jobs).toHaveLength(0);
  });

  test('falls back to the profile company name', async () => {
    const r = await registerUser({ role: 'recruiter' });
    getDb().prepare('UPDATE profiles SET company_name = ? WHERE user_id = ?')
      .run('Profile Co', r.res.body.user.id);
    const { company, ...noCompany } = valid;
    const res = await create(r, noCompany);
    expect(res.status).toBe(201);
    expect(res.body.job.company).toBe('Profile Co');
  });

  test('400 when company is missing and the profile has none', async () => {
    const { company, ...noCompany } = valid;
    const res = await create(recruiter, noCompany);
    expect(res.status).toBe(400);
    expect(res.body.errors.company).toBeDefined();
  });

  test.each([
    [{ ...valid, title: '' }, 'title'],
    [{ ...valid, title: '   ' }, 'title'],
    [{ ...valid, description: undefined }, 'description'],
    [{ ...valid, title: 'x'.repeat(151) }, 'title'],
    [{ ...valid, location: 42 }, 'location'],
    [{ ...valid, requirements: ['a'] }, 'requirements'],
  ])('400 for invalid body %#', async (body, field) => {
    const res = await create(recruiter, body);
    expect(res.status).toBe(400);
    expect(res.body.errors[field]).toBeDefined();
  });
});

describe('list and read', () => {
  test('lists only own postings, including closed, with status filter', async () => {
    const a = (await create()).body.job.id;
    await create();
    await create(other);
    await request(app).post(`/api/recruiter/jobs/${a}/close`).set(auth(recruiter));

    const all = await request(app).get('/api/recruiter/jobs').set(auth(recruiter));
    expect(all.body.jobs).toHaveLength(2);

    const closed = await request(app).get('/api/recruiter/jobs?status=closed').set(auth(recruiter));
    expect(closed.body.jobs.map(j => j.id)).toEqual([a]);

    const bad = await request(app).get('/api/recruiter/jobs?status=nope').set(auth(recruiter));
    expect(bad.status).toBe(400);
  });

  test('returns a closed own posting; 404 for another recruiter’s', async () => {
    const id = (await create()).body.job.id;
    await request(app).post(`/api/recruiter/jobs/${id}/close`).set(auth(recruiter));
    expect((await request(app).get(`/api/recruiter/jobs/${id}`).set(auth(recruiter))).status).toBe(200);
    expect((await request(app).get(`/api/recruiter/jobs/${id}`).set(auth(other))).status).toBe(404);
  });

  test.each(['abc', '0', '-1', '1.5'])('400 for invalid id %s', async (id) => {
    const res = await request(app).get(`/api/recruiter/jobs/${id}`).set(auth(recruiter));
    expect(res.status).toBe(400);
  });

  test('404 for a nonexistent id', async () => {
    expect((await request(app).get('/api/recruiter/jobs/999999').set(auth(recruiter))).status).toBe(404);
  });
});

describe('update', () => {
  test('partially updates and keeps untouched fields', async () => {
    const id = (await create()).body.job.id;
    const res = await request(app).patch(`/api/recruiter/jobs/${id}`).set(auth(recruiter))
      .send({ title: 'Senior Backend Developer', location: '' });
    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject({ ...valid, title: 'Senior Backend Developer', location: '' });
  });

  test('400 for empty body, empty required field, or only unknown fields', async () => {
    const id = (await create()).body.job.id;
    const patch = (b) => request(app).patch(`/api/recruiter/jobs/${id}`).set(auth(recruiter)).send(b);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ recruiter_id: 999 })).status).toBe(400);
    expect((await patch({ title: ' ' })).status).toBe(400);
    expect((await patch({ company: '' })).status).toBe(400);
  });

  test('cannot update another recruiter’s posting', async () => {
    const id = (await create()).body.job.id;
    const res = await request(app).patch(`/api/recruiter/jobs/${id}`).set(auth(other)).send({ title: 'Hijack' });
    expect(res.status).toBe(404);
    const row = getDb().prepare('SELECT title FROM jobs WHERE id = ?').get(id);
    expect(row.title).toBe(valid.title);
  });
});

describe('availability via update', () => {
  test('PATCH status hides and re-shows a posting, alone or with other edits', async () => {
    const id = (await create()).body.job.id;
    const patch = (b) => request(app).patch(`/api/recruiter/jobs/${id}`).set(auth(recruiter)).send(b);

    const hidden = await patch({ status: 'closed' });
    expect(hidden.status).toBe(200);
    expect(hidden.body.job.status).toBe('closed');
    expect((await request(app).get(`/api/jobs/${id}`)).status).toBe(404);

    const shown = await patch({ status: 'open', title: 'Edited and visible' });
    expect(shown.body.job).toMatchObject({ status: 'open', title: 'Edited and visible' });
    expect((await request(app).get(`/api/jobs/${id}`)).status).toBe(200);
  });

  test('400 for an invalid status and the posting is left unchanged', async () => {
    const id = (await create()).body.job.id;
    const res = await request(app).patch(`/api/recruiter/jobs/${id}`).set(auth(recruiter))
      .send({ status: 'archived', title: 'Should not apply' });
    expect(res.status).toBe(400);
    expect(res.body.errors.status).toBeDefined();
    const row = getDb().prepare('SELECT title, status FROM jobs WHERE id = ?').get(id);
    expect(row).toEqual({ title: valid.title, status: 'open' });
  });

  test('cannot change the status of another recruiter’s posting', async () => {
    const id = (await create()).body.job.id;
    const res = await request(app).patch(`/api/recruiter/jobs/${id}`).set(auth(other)).send({ status: 'closed' });
    expect(res.status).toBe(404);
    expect(getDb().prepare('SELECT status FROM jobs WHERE id = ?').get(id).status).toBe('open');
  });

  test('a closed posting rejects new applications until it is reopened', async () => {
    const id = (await create()).body.job.id;
    await request(app).patch(`/api/recruiter/jobs/${id}`).set(auth(recruiter)).send({ status: 'closed' });
    const blocked = await request(app).post('/api/applications').set(auth(seeker)).send({ jobId: id });
    expect(blocked.status).toBe(400);
    await request(app).patch(`/api/recruiter/jobs/${id}`).set(auth(recruiter)).send({ status: 'open' });
    const ok = await request(app).post('/api/applications').set(auth(seeker)).send({ jobId: id });
    expect(ok.status).toBe(201);
  });
});

describe('close / reopen', () => {
  test('closing hides from the public; reopening restores it', async () => {
    const id = (await create()).body.job.id;
    const closed = await request(app).post(`/api/recruiter/jobs/${id}/close`).set(auth(recruiter));
    expect(closed.status).toBe(200);
    expect(closed.body.job.status).toBe('closed');
    expect((await request(app).get('/api/jobs')).body.jobs).toHaveLength(0);
    expect((await request(app).get(`/api/jobs/${id}`)).status).toBe(404);

    const reopened = await request(app).post(`/api/recruiter/jobs/${id}/reopen`).set(auth(recruiter));
    expect(reopened.body.job.status).toBe('open');
    expect((await request(app).get('/api/jobs')).body.jobs).toHaveLength(1);
  });

  test('cannot close another recruiter’s posting', async () => {
    const id = (await create()).body.job.id;
    expect((await request(app).post(`/api/recruiter/jobs/${id}/close`).set(auth(other))).status).toBe(404);
    expect(getDb().prepare('SELECT status FROM jobs WHERE id = ?').get(id).status).toBe('open');
  });
});

describe('delete', () => {
  test('deletes an own posting with no applications', async () => {
    const id = (await create()).body.job.id;
    const res = await request(app).delete(`/api/recruiter/jobs/${id}`).set(auth(recruiter));
    expect(res.status).toBe(204);
    expect(getDb().prepare('SELECT 1 FROM jobs WHERE id = ?').get(id)).toBeUndefined();
  });

  test('409 when applications exist; the posting survives', async () => {
    const id = (await create()).body.job.id;
    await request(app).post('/api/applications').set(auth(seeker)).send({ jobId: id });
    const res = await request(app).delete(`/api/recruiter/jobs/${id}`).set(auth(recruiter));
    expect(res.status).toBe(409);
    expect(getDb().prepare('SELECT 1 FROM jobs WHERE id = ?').get(id)).toBeDefined();
    const detail = await request(app).get(`/api/recruiter/jobs/${id}`).set(auth(recruiter));
    expect(detail.body.job.applicationCount).toBe(1);
  });

  test('cannot delete another recruiter’s posting', async () => {
    const id = (await create()).body.job.id;
    expect((await request(app).delete(`/api/recruiter/jobs/${id}`).set(auth(other))).status).toBe(404);
    expect(getDb().prepare('SELECT 1 FROM jobs WHERE id = ?').get(id)).toBeDefined();
  });
});
