const fs = require('fs');
const path = require('path');
const { app, request, registerUser, closeDb } = require('./helpers');
const { getDb } = require('../src/db');
const { uploadDirectory } = require('../src/resumeFiles');
const { PDF_TYPE } = require('../src/resumeText');
const service = require('../src/resumeMatch');
const { FeedbackError } = require('../src/resumeFeedback');
const text = 'Built React dashboards. Studied SQL in a class.';
const job = { title: 'Developer', description: 'Build React dashboards.', requirements: 'SQL expertise. Docker experience.' };
const result = {
  summary: 'React is supported; SQL and Docker need evidence.',
  requirements: [
    { requirement: 'React dashboards', status: 'matched', evidence: 'Built React dashboards.', explanation: 'Direct project evidence.', suggestion: '' },
    { requirement: 'SQL expertise', status: 'partial', evidence: 'Studied SQL in a class.', explanation: 'Study is shown, expertise is unclear.', suggestion: 'Describe a SQL project if you have one.' },
    { requirement: 'Docker experience', status: 'missing', evidence: '', explanation: 'Docker is not mentioned.', suggestion: 'Build a containerized project.' },
  ], missingKeywords: ['Docker', 'Docker', 'React', 'Kubernetes'],
};
const fake = data => ({ models: { generateContent: jest.fn().mockResolvedValue({ text: JSON.stringify(data) }) } });

describe('job matching analysis', () => {
  test('calculates a score from evidence and keeps only grounded missing keywords', async () => {
    const report = await service.analyzeJobMatch(text, job, { ai: fake(result) });
    expect(report.score).toBe(50);
    expect(report.counts).toEqual({ matched: 1, partial: 1, missing: 1 });
    expect(report.missingKeywords).toEqual(['docker']);
  });
  test('redacts contact data in both input documents', async () => {
    const ai = fake(result);
    await service.analyzeJobMatch(`${text} a@example.com 514-555-0199`, { ...job, description: `${job.description} hr@example.com` }, { ai });
    const sent = ai.models.generateContent.mock.calls[0][0];
    expect(sent.contents).not.toMatch(/a@example|hr@example|555-0199/);
    expect(JSON.parse(sent.contents).resume).toContain('[email]');
    expect(sent.config.responseMimeType).toBe('application/json');
  });
  test.each([
    [], [{ ...result.requirements[0], evidence: 'Invented experience' }],
    [{ ...result.requirements[0], requirement: 'Kubernetes' }],
    [result.requirements[0], result.requirements[0]],
    [{ ...result.requirements[2], evidence: 'Built React dashboards.' }],
    [{ ...result.requirements[2], suggestion: '' }],
  ])('rejects ungrounded reports %#', async (...requirements) => {
    await expect(service.analyzeJobMatch(text, job, { ai: fake({ ...result, requirements }) })).rejects.toMatchObject({ status: 502 });
  });
  test('rejects excessive input and postings without details before calling AI', async () => {
    const ai = fake(result);
    await expect(service.analyzeJobMatch('x'.repeat(30001), job, { ai })).rejects.toMatchObject({ status: 422 });
    await expect(service.analyzeJobMatch(text, { ...job, description: 'x'.repeat(30001) }, { ai })).rejects.toMatchObject({ status: 422 });
    await expect(service.analyzeJobMatch(text, { title: 'Developer' }, { ai })).rejects.toMatchObject({ status: 422 });
    expect(ai.models.generateContent).not.toHaveBeenCalled();
  });
  test('scores fully supported and unsupported resumes at 100 and 0', async () => {
    for (const [index, score] of [[0, 100], [2, 0]]) {
      expect((await service.analyzeJobMatch(text, job, { ai: fake({ ...result, requirements: [result.requirements[index]] }) })).score).toBe(score);
    }
  });
});

let seeker, other, recruiter, resumeId, jobId, storedPath;
const auth = user => ({ Authorization: `Bearer ${user.token}` });
beforeAll(async () => {
  seeker = await registerUser(); other = await registerUser(); recruiter = await registerUser({ role: 'recruiter' });
  const posting = await request(app).post('/api/recruiter/jobs').set(auth(recruiter)).send({ ...job, company: 'Acme' });
  jobId = posting.body.job.id;
  const name = `test-match-${process.pid}.pdf`;
  storedPath = path.join(uploadDirectory, name);
  fs.mkdirSync(uploadDirectory, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'fixtures/resume.pdf'), storedPath);
  resumeId = Number(getDb().prepare('INSERT INTO resumes (user_id, original_name, stored_name, file_type, file_size) VALUES (?, ?, ?, ?, ?)')
    .run(seeker.res.body.user.id, 'resume.pdf', name, PDF_TYPE, fs.statSync(storedPath).size).lastInsertRowid);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { fs.rmSync(storedPath, { force: true }); closeDb(); });
const compare = (user = seeker, id = resumeId, body = { jobId }) => request(app).post(`/api/resume/${id}/match`).set(user ? auth(user) : {}).send(body);
test('returns a private report without changing the resume or applying', async () => {
  const analyze = jest.spyOn(service, 'analyzeJobMatch').mockResolvedValue(result);
  const before = fs.readFileSync(storedPath);
  const res = await compare();
  expect(res.status).toBe(200);
  expect(res.body.match).toEqual(result);
  expect(res.headers['cache-control']).toContain('no-store');
  expect(analyze.mock.calls[0][0]).toContain('Jordan Tester');
  expect(analyze.mock.calls[0][1]).toMatchObject({ id: jobId, requirements: job.requirements });
  expect(fs.readFileSync(storedPath).equals(before)).toBe(true);
  expect(getDb().prepare('SELECT COUNT(*) AS n FROM applications').get().n).toBe(0);
});
test('checks authentication, role and resume ownership before analysis', async () => {
  const analyze = jest.spyOn(service, 'analyzeJobMatch');
  expect((await compare(null)).status).toBe(401);
  expect((await compare(recruiter)).status).toBe(403);
  expect((await compare(other)).status).toBe(404);
  expect(analyze).not.toHaveBeenCalled();
});
test.each([{ jobId: '1' }, { jobId: -1 }, {}, { jobId: 1.5 }])('rejects invalid IDs: %j', async body => {
  expect((await compare(seeker, resumeId, body)).status).toBe(400);
});
test('rejects malformed resume IDs', async () => { expect((await compare(seeker, '01')).status).toBe(400); });
test('returns a safe provider failure', async () => {
  jest.spyOn(service, 'analyzeJobMatch').mockRejectedValue(new FeedbackError(503, 'AI feedback is not available right now.'));
  expect((await compare()).status).toBe(503);
});
test('rejects closed or missing postings without analysis', async () => {
  const analyze = jest.spyOn(service, 'analyzeJobMatch');
  expect((await compare(seeker, resumeId, { jobId: 999999 })).status).toBe(404);
  getDb().prepare("UPDATE jobs SET status = 'closed' WHERE id = ?").run(jobId);
  expect((await compare()).status).toBe(404);
  getDb().prepare("UPDATE jobs SET status = 'open' WHERE id = ?").run(jobId);
  expect(analyze).not.toHaveBeenCalled();
});
test('handles unreadable and missing resume files', async () => {
  const analyze = jest.spyOn(service, 'analyzeJobMatch');
  fs.copyFileSync(path.join(__dirname, 'fixtures/blank.pdf'), storedPath);
  expect((await compare()).status).toBe(422);
  fs.rmSync(storedPath);
  expect((await compare()).status).toBe(404);
  expect(analyze).not.toHaveBeenCalled();
});
