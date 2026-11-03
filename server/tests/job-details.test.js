
const {
  app, request, registerUser, closeDb
} = require('./helpers');

const { getDb } = require('../src/db');

let recruiterId;

beforeAll(async () => {
  const { res } = await registerUser({
    role: 'recruiter'
  });
  expect(res.status).toBe(201);
  recruiterId = res.body.user.id;
});

beforeEach(() => {
  getDb().prepare('DELETE FROM jobs').run();
});

afterAll(() => closeDb());

function createJob(status = 'open') {
  const result = getDb().prepare(`
    INSERT INTO jobs (
      recruiter_id, title, company, location,
      type, category, description, requirements, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recruiterId,
    'Software Developer',
    'Example Company',
    'Montreal',
    'Full-time',
    'Engineering',
    'Build web applications.',
    'Experience with JavaScript.',
    status
  );

  return Number(result.lastInsertRowid);
}

describe('Task 6.7 - Single Job Details API', () => {

  test('returns an open job with its details', async () => {
    const id = createJob();

    const res = await request(app)
      .get(`/api/jobs/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.job).toMatchObject({
      id,
      title: 'Software Developer',
      company: 'Example Company',
      description: 'Build web applications.',
      requirements: 'Experience with JavaScript.'
    });
  });

  test('returns 404 for a nonexistent job', async () => {
    const res = await request(app)
      .get('/api/jobs/999999');

    expect(res.status).toBe(404);
  });

  test('returns 404 for a closed job', async () => {
    const id = createJob('closed');

    const res = await request(app)
      .get(`/api/jobs/${id}`);

    expect(res.status).toBe(404);
  });

  test.each(['abc', '0', '-1', '1.5'])(
    'returns 400 for invalid ID %s',
    async (id) => {
      const res = await request(app)
        .get(`/api/jobs/${id}`);

      expect(res.status).toBe(400);
    }
  );

});
