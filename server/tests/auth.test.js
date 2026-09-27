const { app, request, registerUser, closeDb } = require('./helpers');

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

describe('US-02 login', () => {
  test('logs in with correct credentials', async () => {
    await registerUser({ email: 'login@example.com' });
    const res = await request(app).post('/api/auth/login').send({ email: 'login@example.com', password: 'Passw0rd!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  test('uses the same error for wrong password and unknown email', async () => {
    await registerUser({ email: 'login2@example.com' });
    const wrong = await request(app).post('/api/auth/login').send({ email: 'login2@example.com', password: 'Wrong1234' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Wrong1234' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
  });

  test('GET /me requires a valid token', async () => {
    const { token } = await registerUser();
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
    const ok = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
  });
});

describe('US-02 login edge cases', () => {
  test('logs in when the email is typed with different capital letters', async () => {
    await registerUser({ email: 'Mixed.Case@Example.com' });
    const res = await request(app).post('/api/auth/login').send({ email: 'mixed.case@EXAMPLE.com', password: 'Passw0rd!' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('Mixed.Case@Example.com');
  });
});
