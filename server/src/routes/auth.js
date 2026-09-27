const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { signToken } = require('../middleware/auth');
const { validateRegistration } = require('../validation');

const router = express.Router();

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

module.exports = router;
