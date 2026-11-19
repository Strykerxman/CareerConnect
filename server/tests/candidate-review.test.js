const fs = require('fs');
const path = require('path');
const { app, request, registerUser, closeDb } = require('./helpers');
const { getDb } = require('../src/db');
const { uploadDirectory } = require('../src/resumeFiles');
const { PDF_TYPE, DOCX_TYPE } = require('../src/resumeText');

let recruiter, other, seeker, secondSeeker, jobId, applicationId, resumeId;
const storedFiles = [];
const auth = user => ({ Authorization: `Bearer ${user.token}` });
const base = (job = jobId, application = applicationId) => `/api/recruiter/jobs/${job}/applications/${application}`;
const routes = ['candidate', 'resume/view', 'resume/download'];
const read = (suffix = 'candidate', user = recruiter, job, application) =>
  request(app).get(`${base(job, application)}/${suffix}`).set(auth(user)).buffer(true);

function storeResume(user = seeker, fixture = 'resume.pdf', fileType = PDF_TYPE) {
  const storedName = `test-candidate-${process.pid}-${storedFiles.length}${path.extname(fixture)}`;
  const filePath = path.join(uploadDirectory, storedName);
  fs.mkdirSync(uploadDirectory, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'fixtures', fixture), filePath);
  storedFiles.push(filePath);
  return Number(getDb().prepare(`INSERT INTO resumes (user_id, original_name, stored_name, file_type, file_size)
    VALUES (?, ?, ?, ?, ?)`).run(user.res.body.user.id, fixture, storedName, fileType, fs.statSync(filePath).size).lastInsertRowid);
}
async function createJob(user = recruiter) {
  const res = await request(app).post('/api/recruiter/jobs').set(auth(user))
    .send({ title: 'Developer', company: 'Acme', description: 'Build APIs.' });
  expect(res.status).toBe(201);
  return res.body.job.id;
}

beforeAll(async () => {
  recruiter = await registerUser({ role: 'recruiter' });
  other = await registerUser({ role: 'recruiter' });
  seeker = await registerUser({ fullName: 'Ada Candidate' });
  secondSeeker = await registerUser();
  const res = await request(app).put('/api/profile').set(auth(seeker)).send({
    fullName: 'Ada Candidate', headline: 'Software student', location: 'Montreal',
    bio: 'I build web apps.', skills: ['React', 'Node.js'], linkedinUrl: 'https://www.linkedin.com/in/ada',
    phone: '555-555-1234',
  });
  expect(res.status).toBe(200);
});
beforeEach(async () => {
  getDb().prepare('DELETE FROM jobs').run();
  getDb().prepare('DELETE FROM resumes').run();
  getDb().prepare('UPDATE profiles SET skills = ? WHERE user_id = ?').run(JSON.stringify(['React', 'Node.js']), seeker.res.body.user.id);
  jobId = await createJob();
  resumeId = storeResume();
  const res = await request(app).post('/api/applications').set(auth(seeker)).send({ jobId, resumeId });
  expect(res.status).toBe(201);
  applicationId = res.body.application.id;
});
afterAll(() => {
  storedFiles.forEach(file => fs.rmSync(file, { force: true }));
  closeDb();
});

test('returns the candidate profile and submitted resume without account data or stored file paths', async () => {
  const res = await read();
  expect(res.status).toBe(200);
  expect(res.headers['cache-control']).toBe('private, no-store');
  expect(res.body.candidate).toEqual({ fullName: 'Ada Candidate', headline: 'Software student', location: 'Montreal',
    bio: 'I build web apps.', skills: ['React', 'Node.js'], linkedinUrl: 'https://www.linkedin.com/in/ada' });
  expect(res.body.resume).toEqual({ id: resumeId, originalName: 'resume.pdf', fileType: PDF_TYPE, uploadedAt: expect.any(String) });
});

test('previews the attached PDF and downloads the original file', async () => {
  const expected = fs.readFileSync(path.join(__dirname, 'fixtures/resume.pdf'));
  for (const action of ['view', 'download']) {
    const res = await read(`resume/${action}`);
    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).equals(expected)).toBe(true);
    expect(res.headers['content-disposition']).toMatch(action === 'view' ? /^inline/ : /^attachment/);
    expect(res.headers['cache-control']).toBe('private, no-store');
  }
});

test('previews DOCX in a restricted HTML document and downloads the original DOCX', async () => {
  const id = storeResume(seeker, 'resume.docx', DOCX_TYPE);
  getDb().prepare('UPDATE applications SET resume_id = ? WHERE id = ?').run(id, applicationId);
  const res = await read('resume/view');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Jordan Tester');
  expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  const download = await read('resume/download');
  expect(download.status).toBe(200);
  // DOCX is returned as a binary body by supertest's octet-stream parser.
  expect(download.headers['content-disposition']).toContain('resume.docx');
});

test('works on closed postings', async () => {
  await request(app).post(`/api/recruiter/jobs/${jobId}/close`).set(auth(recruiter));
  for (const route of routes) expect((await read(route)).status).toBe(200);
});

test('does not replace the submitted resume with a newer upload', async () => {
  storeResume(seeker, 'resume.docx', DOCX_TYPE);
  expect((await read()).body.resume.id).toBe(resumeId);
  expect((await read('resume/view')).headers['content-type']).toContain('application/pdf');
});

test.each(['none', 'deleted', 'wrong owner'])('does not expose another resume when attached resume is %s', async mode => {
  storeResume(seeker, 'resume.docx', DOCX_TYPE);
  if (mode === 'none') getDb().prepare('UPDATE applications SET resume_id = NULL WHERE id = ?').run(applicationId);
  if (mode === 'deleted') getDb().prepare('DELETE FROM resumes WHERE id = ?').run(resumeId);
  if (mode === 'wrong owner') getDb().prepare('UPDATE applications SET resume_id = ? WHERE id = ?')
    .run(storeResume(secondSeeker), applicationId);
  expect((await read()).body.resume).toBeNull();
  for (const route of ['resume/view', 'resume/download']) expect((await read(route)).status).toBe(404);
});

test('handles a missing physical file and malformed stored skills', async () => {
  const row = getDb().prepare('SELECT stored_name FROM resumes WHERE id = ?').get(resumeId);
  fs.rmSync(path.join(uploadDirectory, row.stored_name));
  expect((await read('resume/view')).status).toBe(404);
  expect((await read('resume/download')).status).toBe(404);
  getDb().prepare("UPDATE profiles SET skills = 'invalid' WHERE user_id = ?").run(seeker.res.body.user.id);
  expect((await read()).body.candidate.skills).toEqual([]);
});

test('requires authentication, recruiter role, and posting ownership on every review route', async () => {
  for (const route of routes) {
    expect((await request(app).get(`${base()}/${route}`)).status).toBe(401);
    expect((await read(route, seeker)).status).toBe(403);
    expect((await read(route, other)).status).toBe(404);
  }
});

test('rejects mismatched application/job pairs even for the same recruiter', async () => {
  for (const owner of [recruiter, other]) {
    const job = await createJob(owner);
    for (const route of routes) expect((await read(route, owner, job)).status).toBe(404);
  }
});

test.each(['abc', '0', '01', '-1', '9007199254740992'])('rejects invalid IDs on every review route: %s', async id => {
  for (const route of routes) {
    expect((await read(route, recruiter, id)).status).toBe(400);
    expect((await read(route, recruiter, jobId, id)).status).toBe(400);
  }
});

test('returns 404 for a missing application', async () => {
  for (const route of routes) expect((await read(route, recruiter, jobId, 999999)).status).toBe(404);
});
