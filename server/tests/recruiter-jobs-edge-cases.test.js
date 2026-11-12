const jwt = require('jsonwebtoken');
const { app, request, registerUser, closeDb } = require('./helpers');
const { getDb } = require('../src/db');

let recruiter, other, seeker, seeker2;
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
const row = (id) => getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id);
const create = (u = recruiter, body = valid) =>
  request(app).post('/api/recruiter/jobs').set(auth(u)).send(body);
const createId = async (u = recruiter, body = valid) => (await create(u, body)).body.job.id;
const patch = (id, body, u = recruiter) =>
  request(app).patch(`/api/recruiter/jobs/${id}`).set(auth(u)).send(body);

beforeAll(async () => {
  recruiter = await registerUser({ role: 'recruiter' });
  other = await registerUser({ role: 'recruiter' });
  seeker = await registerUser({ role: 'job_seeker' });
  seeker2 = await registerUser({ role: 'job_seeker' });
});
beforeEach(() => getDb().prepare('DELETE FROM jobs').run());
afterAll(() => closeDb());

// Every recruiter route, as [method, path builder, body].
const ROUTES = [
  ['get', () => '/api/recruiter/jobs'],
  ['post', () => '/api/recruiter/jobs', valid],
  ['get', id => `/api/recruiter/jobs/${id}`],
  ['patch', id => `/api/recruiter/jobs/${id}`, { title: 'Changed' }],
  ['post', id => `/api/recruiter/jobs/${id}/close`],
  ['post', id => `/api/recruiter/jobs/${id}/reopen`],
  ['delete', id => `/api/recruiter/jobs/${id}`],
];
const call = (method, url, headers = {}, body) => {
  const req = request(app)[method](url).set(headers);
  return body ? req.send(body) : req;
};

describe('authentication', () => {
  const signed = (claims, secret = 'test-secret', options = {}) =>
    jwt.sign(claims, secret, { expiresIn: '1h', ...options });
  const badHeaders = {
    'no header': {},
    'empty bearer': { Authorization: 'Bearer ' },
    'wrong scheme': { Authorization: 'Basic abc123' },
    'garbage token': { Authorization: 'Bearer not.a.jwt' },
    'expired token': () => ({
      Authorization: `Bearer ${signed({ sub: 1, role: 'recruiter' }, 'test-secret', { expiresIn: -60 })}`,
    }),
    'token signed with another secret': () => ({
      Authorization: `Bearer ${signed({ sub: 1, role: 'recruiter' }, 'some-other-secret')}`,
    }),
    'unsigned (alg none) token': () => {
      const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
      return { Authorization: `Bearer ${enc({ alg: 'none', typ: 'JWT' })}.${enc({ sub: 1, role: 'recruiter' })}.` };
    },
  };

  test.each(Object.keys(badHeaders))('401 on every route with %s, and nothing changes', async (name) => {
    const id = await createId();
    const before = row(id);
    const headers = typeof badHeaders[name] === 'function' ? badHeaders[name]() : badHeaders[name];
    for (const [method, path, body] of ROUTES) {
      const res = await call(method, path(id), headers, body);
      expect([method, path(id), res.status]).toEqual([method, path(id), 401]);
    }
    expect(row(id)).toEqual(before);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n).toBe(1);
  });

  test('a token whose account no longer exists gets 401 on every route, not a server error', async () => {
    const ghost = { Authorization: `Bearer ${signed({ sub: 987654, role: 'recruiter' })}` };
    for (const [method, path, body] of ROUTES) {
      const res = await call(method, path(1), ghost, body);
      expect([method, path(1), res.status]).toEqual([method, path(1), 401]);
    }
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n).toBe(0);
  });

  test('the stored role wins over an old token: a user demoted to job seeker loses access', async () => {
    const demoted = await registerUser({ role: 'recruiter' });
    expect((await create(demoted)).status).toBe(201);
    getDb().prepare("UPDATE users SET role = 'job_seeker' WHERE id = ?").run(demoted.res.body.user.id);
    const res = await create(demoted);
    expect(res.status).toBe(403);
    expect((await request(app).get('/api/recruiter/jobs').set(auth(demoted))).status).toBe(403);
  });
});

describe('authorization', () => {
  test('job seekers get 403 on every route, including reopen, and nothing changes', async () => {
    const id = await createId();
    const before = row(id);
    for (const [method, path, body] of ROUTES) {
      const res = await call(method, path(id), auth(seeker), body);
      expect([method, path(id), res.status]).toEqual([method, path(id), 403]);
    }
    expect(row(id)).toEqual(before);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n).toBe(1);
  });

  test('a recruiter cannot read, edit, close, reopen or delete another recruiter’s posting', async () => {
    const id = await createId();
    await request(app).post(`/api/recruiter/jobs/${id}/close`).set(auth(recruiter));
    const before = row(id);

    const attempts = [
      ['get', `/api/recruiter/jobs/${id}`],
      ['patch', `/api/recruiter/jobs/${id}`, { title: 'Hijacked', status: 'open' }],
      ['post', `/api/recruiter/jobs/${id}/close`],
      ['post', `/api/recruiter/jobs/${id}/reopen`],
      ['delete', `/api/recruiter/jobs/${id}`],
    ];
    for (const [method, path, body] of attempts) {
      const res = await call(method, path, auth(other), body);
      expect([method, path, res.status]).toEqual([method, path, 404]);
      expect(res.body.error).toBe('Job not found.');
    }
    expect(row(id)).toEqual(before);
  });

  test('another recruiter’s postings never appear in a list, with or without a filter', async () => {
    const mine = await createId(recruiter);
    const theirs = await createId(other, { ...valid, title: 'Their Job' });
    await request(app).post(`/api/recruiter/jobs/${theirs}/close`).set(auth(other));

    for (const query of ['', '?status=open', '?status=closed']) {
      const res = await request(app).get(`/api/recruiter/jobs${query}`).set(auth(recruiter));
      const ids = res.body.jobs.map(j => j.id);
      expect(ids).not.toContain(theirs);
      if (query !== '?status=closed') expect(ids).toContain(mine);
    }
  });

  test('a 404 for someone else’s posting is identical to a 404 for a missing one', async () => {
    const id = await createId();
    const theirs = await request(app).get(`/api/recruiter/jobs/${id}`).set(auth(other));
    const missing = await request(app).get('/api/recruiter/jobs/999999').set(auth(other));
    expect(theirs.status).toBe(missing.status);
    expect(theirs.body).toEqual(missing.body);
  });

  test('the owner can still manage the posting after another recruiter’s failed attempts', async () => {
    const id = await createId();
    await patch(id, { title: 'Hijacked' }, other);
    const res = await patch(id, { title: 'Mine' });
    expect(res.status).toBe(200);
    expect(res.body.job.title).toBe('Mine');
  });

  test('ownership cannot be reassigned through the request body', async () => {
    const owner = recruiter.res.body.user.id;
    const created = await create(recruiter, { ...valid, recruiter_id: other.res.body.user.id });
    expect(row(created.body.job.id).recruiter_id).toBe(owner);

    const id = created.body.job.id;
    const res = await patch(id, { title: 'Still mine', recruiter_id: other.res.body.user.id });
    expect(res.status).toBe(200);
    expect(row(id).recruiter_id).toBe(owner);
    expect((await request(app).get(`/api/recruiter/jobs/${id}`).set(auth(other))).status).toBe(404);
  });
});

describe('creation', () => {
  test('returns exactly the documented job fields and does not leak the owner', async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(Object.keys(res.body.job).sort()).toEqual([
      'applicationCount', 'category', 'company', 'createdAt', 'description', 'id',
      'location', 'requirements', 'status', 'title', 'type',
    ]);
    expect(res.body.job.createdAt).toBeTruthy();
    expect(res.body.message).toBe('Job posting created.');
  });

  test('a posting created as closed reports that in the message', async () => {
    const res = await create(recruiter, { ...valid, status: 'closed' });
    expect(res.body.message).toMatch(/closed/i);
  });

  test('optional fields default to empty strings', async () => {
    const res = await create(recruiter, { title: 'T', company: 'C', description: 'D' });
    expect(res.status).toBe(201);
    expect(res.body.job).toMatchObject({ location: '', type: '', category: '', requirements: '' });
  });

  test('client-supplied id, createdAt and applicationCount are ignored', async () => {
    const res = await create(recruiter, {
      ...valid, id: 1, created_at: '2000-01-01 00:00:00', createdAt: '2000-01-01', applicationCount: 50,
    });
    expect(res.status).toBe(201);
    expect(res.body.job.applicationCount).toBe(0);
    expect(res.body.job.createdAt).not.toMatch(/^2000/);
    expect(row(res.body.job.id).created_at).not.toMatch(/^2000/);
  });

  const LIMITS = { title: 150, company: 150, location: 150, type: 50, category: 100, description: 10000, requirements: 5000 };
  test.each(Object.entries(LIMITS))('%s accepts exactly %i characters and rejects one more', async (field, max) => {
    const ok = await create(recruiter, { ...valid, [field]: 'a'.repeat(max) });
    expect(ok.status).toBe(201);
    expect(ok.body.job[field]).toHaveLength(max);

    const tooLong = await create(recruiter, { ...valid, [field]: 'a'.repeat(max + 1) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.errors[field]).toMatch(new RegExp(String(max)));
  });

  test('padding does not count against the limit because values are trimmed first', async () => {
    const res = await create(recruiter, { ...valid, title: `  ${'a'.repeat(150)}  ` });
    expect(res.status).toBe(201);
    expect(res.body.job.title).toHaveLength(150);
  });

  test.each(Object.keys(LIMITS))('%s must be text', async (field) => {
    for (const bad of [null, 5, true, {}, ['x']]) {
      const res = await create(recruiter, { ...valid, [field]: bad });
      expect([field, bad, res.status]).toEqual([field, bad, 400]);
      expect(res.body.errors[field]).toBeDefined();
    }
  });

  test('reports every invalid field at once', async () => {
    const res = await create(recruiter, { title: '', description: '', location: 5, status: 'nope' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['description', 'location', 'status', 'title']);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n).toBe(0);
  });

  test('rejects malformed JSON, non-object bodies, and oversized bodies without a server error', async () => {
    const send = (body, type = 'application/json') =>
      request(app).post('/api/recruiter/jobs').set(auth(recruiter)).set('Content-Type', type).send(body);

    expect((await send('{"title": ')).status).toBe(400);
    expect((await send('"just a string"')).status).toBe(400);
    expect((await send('null')).status).toBe(400);
    expect((await send('[]')).status).toBe(400);
    expect((await send('title=Hello', 'text/plain')).status).toBe(400);
    const huge = await send(JSON.stringify({ ...valid, description: 'x'.repeat(200000) }));
    expect(huge.status).toBe(413);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n).toBe(0);
  });

  test('stores hostile and unicode text literally', async () => {
    const title = `Robert'); DROP TABLE jobs;-- <script>alert(1)</script> 😀 café`;
    const description = 'Line one\nLine two\n\n  indented';
    const res = await create(recruiter, { ...valid, title, description });
    expect(res.status).toBe(201);
    expect(res.body.job.title).toBe(title);
    expect(res.body.job.description).toBe(description);
    const fetched = await request(app).get(`/api/recruiter/jobs/${res.body.job.id}`).set(auth(recruiter));
    expect(fetched.body.job.title).toBe(title);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n).toBe(1);
  });

  test('a profile company name is only a fallback; an explicit company wins', async () => {
    const r = await registerUser({ role: 'recruiter' });
    getDb().prepare('UPDATE profiles SET company_name = ? WHERE user_id = ?').run('Profile Co', r.res.body.user.id);
    const res = await create(r, { ...valid, company: 'Explicit Co' });
    expect(res.body.job.company).toBe('Explicit Co');
  });

  test('a whitespace-only company falls back to the profile and fails if there is none', async () => {
    const res = await create(recruiter, { ...valid, company: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.errors.company).toBeDefined();
  });

  test('lists newest first', async () => {
    const a = await createId(recruiter, { ...valid, title: 'A' });
    const b = await createId(recruiter, { ...valid, title: 'B' });
    const c = await createId(recruiter, { ...valid, title: 'C' });
    const res = await request(app).get('/api/recruiter/jobs').set(auth(recruiter));
    expect(res.body.jobs.map(j => j.id)).toEqual([c, b, a]);
  });
});

describe('updates', () => {
  test('changes only the supplied fields and leaves status and createdAt alone', async () => {
    const id = await createId();
    await request(app).post(`/api/recruiter/jobs/${id}/close`).set(auth(recruiter));
    const before = row(id);
    const res = await patch(id, { title: 'Renamed', requirements: '' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Job posting updated.');
    expect(row(id)).toEqual({ ...before, title: 'Renamed', requirements: '' });
    expect(res.body.job.status).toBe('closed');
  });

  test.each(['location', 'type', 'category', 'requirements'])('%s can be cleared with an empty string', async (field) => {
    const id = await createId();
    const res = await patch(id, { [field]: '' });
    expect(res.status).toBe(200);
    expect(res.body.job[field]).toBe('');
  });

  test.each(['title', 'company', 'description'])('%s cannot be cleared', async (field) => {
    const id = await createId();
    for (const empty of ['', '   ']) {
      const res = await patch(id, { [field]: empty });
      expect(res.status).toBe(400);
      expect(res.body.errors[field]).toBeDefined();
    }
    expect(row(id)[field]).toBe(valid[field]);
  });

  test('trims values and enforces the same limits as creation', async () => {
    const id = await createId();
    expect((await patch(id, { title: '  Trimmed  ' })).body.job.title).toBe('Trimmed');
    const ok = await patch(id, { description: 'd'.repeat(10000) });
    expect(ok.status).toBe(200);
    const tooLong = await patch(id, { description: 'd'.repeat(10001) });
    expect(tooLong.status).toBe(400);
    expect(row(id).description).toHaveLength(10000);
  });

  test('one invalid field rejects the whole update, valid fields included', async () => {
    const id = await createId();
    const before = row(id);
    const res = await patch(id, { title: 'Valid new title', location: 99, description: '' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['description', 'location']);
    expect(row(id)).toEqual(before);
  });

  test('unknown fields are ignored when a valid field is also sent', async () => {
    const id = await createId();
    const res = await patch(id, { title: 'Valid', id: 999, created_at: '2000-01-01', hacked: true });
    expect(res.status).toBe(200);
    expect(res.body.job.id).toBe(id);
    expect(row(id).created_at).not.toMatch(/^2000/);
    expect(row(id)).not.toHaveProperty('hacked');
  });

  test('re-saving identical values succeeds', async () => {
    const id = await createId();
    const res = await patch(id, valid);
    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject(valid);
  });

  test('rejects an array body and malformed JSON', async () => {
    const id = await createId();
    expect((await patch(id, [])).status).toBe(400);
    const bad = await request(app).patch(`/api/recruiter/jobs/${id}`).set(auth(recruiter))
      .set('Content-Type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
  });

  test('edits show up in the public listing for open postings', async () => {
    const id = await createId();
    await patch(id, { title: 'Publicly Visible Rename' });
    const res = await request(app).get(`/api/jobs/${id}`);
    expect(res.body.job.title).toBe('Publicly Visible Rename');
  });

  test('edits to a closed posting are saved but it stays hidden', async () => {
    const id = await createId(recruiter, { ...valid, status: 'closed' });
    await patch(id, { title: 'Quiet edit' });
    expect((await request(app).get(`/api/jobs/${id}`)).status).toBe(404);
    expect(row(id).title).toBe('Quiet edit');
  });
});

describe('ids on every posting route', () => {
  const BAD_IDS = ['abc', '0', '-1', '1.5', '01', '1e3', '99999999999999999999'];
  test.each(BAD_IDS)('400 for id %s on get, patch, close, reopen and delete', async (badId) => {
    const routes = [
      ['get', `/api/recruiter/jobs/${badId}`],
      ['patch', `/api/recruiter/jobs/${badId}`, { title: 'x' }],
      ['post', `/api/recruiter/jobs/${badId}/close`],
      ['post', `/api/recruiter/jobs/${badId}/reopen`],
      ['delete', `/api/recruiter/jobs/${badId}`],
    ];
    for (const [method, path, body] of routes) {
      const res = await call(method, path, auth(recruiter), body);
      expect([method, path, res.status]).toEqual([method, path, 400]);
    }
  });

  test('404 for a well-formed id that does not exist on every route', async () => {
    const routes = [
      ['get', '/api/recruiter/jobs/424242'],
      ['patch', '/api/recruiter/jobs/424242', { title: 'x' }],
      ['post', '/api/recruiter/jobs/424242/close'],
      ['post', '/api/recruiter/jobs/424242/reopen'],
      ['delete', '/api/recruiter/jobs/424242'],
    ];
    for (const [method, path, body] of routes) {
      const res = await call(method, path, auth(recruiter), body);
      expect([method, path, res.status]).toEqual([method, path, 404]);
    }
  });
});

describe('status management', () => {
  const publicIds = async () => (await request(app).get('/api/jobs')).body.jobs.map(j => j.id);

  test('closing and reopening are idempotent and change nothing else', async () => {
    const id = await createId();
    const original = row(id);
    for (let i = 0; i < 2; i += 1) {
      const res = await request(app).post(`/api/recruiter/jobs/${id}/close`).set(auth(recruiter));
      expect(res.status).toBe(200);
      expect(res.body.job.status).toBe('closed');
    }
    expect(row(id)).toEqual({ ...original, status: 'closed' });
    for (let i = 0; i < 2; i += 1) {
      const res = await request(app).post(`/api/recruiter/jobs/${id}/reopen`).set(auth(recruiter));
      expect(res.status).toBe(200);
      expect(res.body.job.status).toBe('open');
    }
    expect(row(id)).toEqual(original);
  });

  test('close/reopen and PATCH status stay consistent with each other', async () => {
    const id = await createId();
    await patch(id, { status: 'closed' });
    expect((await request(app).post(`/api/recruiter/jobs/${id}/reopen`).set(auth(recruiter))).body.job.status).toBe('open');
    await request(app).post(`/api/recruiter/jobs/${id}/close`).set(auth(recruiter));
    expect((await patch(id, { status: 'open' })).body.job.status).toBe('open');
  });

  test('only the targeted posting changes status', async () => {
    const a = await createId();
    const b = await createId();
    await request(app).post(`/api/recruiter/jobs/${a}/close`).set(auth(recruiter));
    expect(row(a).status).toBe('closed');
    expect(row(b).status).toBe('open');
    expect(await publicIds()).toEqual([b]);
  });

  test('the recruiter list and its status filter follow every change', async () => {
    const a = await createId();
    const b = await createId();
    const ids = async (query) =>
      (await request(app).get(`/api/recruiter/jobs${query}`).set(auth(recruiter))).body.jobs.map(j => j.id).sort();

    expect(await ids('?status=open')).toEqual([a, b].sort());
    await request(app).post(`/api/recruiter/jobs/${a}/close`).set(auth(recruiter));
    expect(await ids('?status=open')).toEqual([b]);
    expect(await ids('?status=closed')).toEqual([a]);
    expect(await ids('')).toEqual([a, b].sort());
    await request(app).post(`/api/recruiter/jobs/${a}/reopen`).set(auth(recruiter));
    expect(await ids('?status=closed')).toEqual([]);
  });

  test('a closed posting disappears from public search and filters, and returns when reopened', async () => {
    const id = await createId();
    const search = '/api/jobs?location=Montreal&type=Full-time&category=Engineering';
    expect((await request(app).get(search)).body.jobs.map(j => j.id)).toEqual([id]);

    await patch(id, { status: 'closed' });
    expect((await request(app).get(search)).body.jobs).toEqual([]);
    expect((await request(app).get(`/api/jobs/${id}`)).status).toBe(404);

    await patch(id, { status: 'open' });
    expect((await request(app).get(search)).body.jobs.map(j => j.id)).toEqual([id]);
  });

  test('applications are kept when a posting is closed, and new ones are blocked until it reopens', async () => {
    const id = await createId();
    expect((await request(app).post('/api/applications').set(auth(seeker)).send({ jobId: id })).status).toBe(201);

    await request(app).post(`/api/recruiter/jobs/${id}/close`).set(auth(recruiter));
    const detail = await request(app).get(`/api/recruiter/jobs/${id}`).set(auth(recruiter));
    expect(detail.body.job.applicationCount).toBe(1);

    const mine = await request(app).get('/api/applications').set(auth(seeker));
    expect(mine.body.applications.map(a => a.jobId)).toEqual([id]);

    const blocked = await request(app).post('/api/applications').set(auth(seeker2)).send({ jobId: id });
    expect(blocked.status).toBe(400);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM applications WHERE job_id = ?').get(id).n).toBe(1);

    await request(app).post(`/api/recruiter/jobs/${id}/reopen`).set(auth(recruiter));
    expect((await request(app).post('/api/applications').set(auth(seeker2)).send({ jobId: id })).status).toBe(201);
    const again = await request(app).get(`/api/recruiter/jobs/${id}`).set(auth(recruiter));
    expect(again.body.job.applicationCount).toBe(2);
  });

  test('saved jobs are hidden while a posting is closed, can’t be added, and return on reopen', async () => {
    const id = await createId();
    await request(app).post(`/api/saved-jobs/${id}`).set(auth(seeker));
    const saved = async (u) => (await request(app).get('/api/saved-jobs').set(auth(u))).body.savedJobs.map(j => j.id);
    expect(await saved(seeker)).toEqual([id]);

    await request(app).post(`/api/recruiter/jobs/${id}/close`).set(auth(recruiter));
    expect(await saved(seeker)).toEqual([]);
    expect((await request(app).post(`/api/saved-jobs/${id}`).set(auth(seeker2))).status).toBe(404);

    await request(app).post(`/api/recruiter/jobs/${id}/reopen`).set(auth(recruiter));
    expect(await saved(seeker)).toEqual([id]);
  });

  test('a recruiter’s own closed posting stays fully visible to them', async () => {
    const id = await createId(recruiter, { ...valid, status: 'closed' });
    const res = await request(app).get(`/api/recruiter/jobs/${id}`).set(auth(recruiter));
    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject({ id, status: 'closed', title: valid.title });
  });
});

describe('deletion', () => {
  test('removes the posting everywhere, including job seekers’ saved bookmarks', async () => {
    const id = await createId();
    await request(app).post(`/api/saved-jobs/${id}`).set(auth(seeker));
    const res = await request(app).delete(`/api/recruiter/jobs/${id}`).set(auth(recruiter));
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    expect((await request(app).get(`/api/recruiter/jobs/${id}`).set(auth(recruiter))).status).toBe(404);
    expect((await request(app).get(`/api/jobs/${id}`)).status).toBe(404);
    expect((await request(app).get('/api/recruiter/jobs').set(auth(recruiter))).body.jobs).toEqual([]);
    expect((await request(app).get('/api/saved-jobs').set(auth(seeker))).body.savedJobs).toEqual([]);
  });

  test('a closed posting without applications can be deleted', async () => {
    const id = await createId(recruiter, { ...valid, status: 'closed' });
    expect((await request(app).delete(`/api/recruiter/jobs/${id}`).set(auth(recruiter))).status).toBe(204);
  });

  test('a posting with applications is refused even when it is closed, with a helpful message', async () => {
    const id = await createId();
    await request(app).post('/api/applications').set(auth(seeker)).send({ jobId: id });
    await request(app).post(`/api/recruiter/jobs/${id}/close`).set(auth(recruiter));
    const res = await request(app).delete(`/api/recruiter/jobs/${id}`).set(auth(recruiter));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/close it instead/i);
    expect(row(id)).toBeDefined();
  });

  test('deleting twice gives 404 the second time and other postings are untouched', async () => {
    const id = await createId();
    const keep = await createId();
    expect((await request(app).delete(`/api/recruiter/jobs/${id}`).set(auth(recruiter))).status).toBe(204);
    expect((await request(app).delete(`/api/recruiter/jobs/${id}`).set(auth(recruiter))).status).toBe(404);
    expect(row(keep)).toBeDefined();
  });
});
