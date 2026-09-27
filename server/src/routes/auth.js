const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { validateRegistration } = require('../validation');

const router = express.Router();

function publicUser(row) {
  return { id: row.id, email: row.email, role: row.role, fullName: row.full_name };
}

// US-01 Register
router.post('/register', (req, res) => {
  const { email, password, role, fullName } = req.body || {};
  const errors = validateRegistration({ email, password, role, fullName });
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const db = getDb();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.trim())) {
    return res.status(409).json({ errors: { email: 'An account with this email already exists.' } });
  }

  const hash = bcrypt.hashSync(password, 10);
  const id = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
      .run(email.trim(), hash, role);
    db.prepare('INSERT INTO profiles (user_id, full_name) VALUES (?, ?)').run(lastInsertRowid, fullName.trim());
    return lastInsertRowid;
  })();
  const user = { id: Number(id), email: email.trim(), role, fullName: fullName.trim() };
  return res.status(201).json({ token: signToken(user), user });
});

// US-02 Login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });

  const row = getDb()
    .prepare('SELECT u.*, p.full_name FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.email = ?')
    .get(email.trim());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const user = publicUser(row);
  return res.json({ token: signToken(user), user });
});

// Current session
router.get('/me', requireAuth, (req, res) => {
  const row = getDb()
    .prepare('SELECT u.*, p.full_name FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = ?')
    .get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Account not found.' });
  return res.json({ user: publicUser(row) });
});

module.exports = router;
