const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-uploads-'));

const { createApp } = require('../src/app');
const { closeDb } = require('../src/db');

const app = createApp();

let counter = 0;
async function registerUser(overrides = {}) {
  counter += 1;
  const body = {
    email: `user${counter}@example.com`,
    password: 'Passw0rd!',
    role: 'job_seeker',
    fullName: 'Test User',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(body);
  return { res, body, token: res.body.token };
}

module.exports = { app, request, registerUser, closeDb };
