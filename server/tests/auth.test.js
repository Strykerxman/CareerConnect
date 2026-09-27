const { registerUser, closeDb } = require('./helpers');

afterAll(() => closeDb());

describe('US-01 registration', () => {
  test('creates an account and returns a token', async () => {
    const { res } = await registerUser({ email: 'amina@example.com', fullName: 'Amina K' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'amina@example.com', role: 'job_seeker', fullName: 'Amina K' });
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('rejects a duplicate email regardless of case', async () => {
    await registerUser({ email: 'dup@example.com' });
    const { res } = await registerUser({ email: 'DUP@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.errors.email).toMatch(/already exists/);
  });

  test('rejects invalid input with field-level errors', async () => {
    const { res } = await registerUser({ email: 'not-an-email', password: 'short', role: 'admin', fullName: ' ' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['email', 'fullName', 'password', 'role']);
  });

  test('rejects a password with no digits', async () => {
    const { res } = await registerUser({ password: 'onlyletters' });
    expect(res.status).toBe(400);
    expect(res.body.errors.password).toMatch(/letter and one number/);
  });
});
