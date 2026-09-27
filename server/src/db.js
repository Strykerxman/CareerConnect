const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('job_seeker', 'recruiter')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  headline     TEXT DEFAULT '',
  location     TEXT DEFAULT '',
  phone        TEXT DEFAULT '',
  bio          TEXT DEFAULT '',
  skills       TEXT DEFAULT '[]',
  linkedin_url TEXT DEFAULT '',
  company_name TEXT DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let db;

function getDb() {
  if (!db) {
    const file = process.env.DB_PATH || path.join(__dirname, '..', 'careerconnect.db');
    db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
  }
  return db;
}

function closeDb() {
  if (db) { db.close(); db = undefined; }
}

module.exports = { getDb, closeDb };
