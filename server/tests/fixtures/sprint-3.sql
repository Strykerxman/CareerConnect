-- Sprint 3 schema from commit 07f050f, before application history and interviews.
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

CREATE TABLE IF NOT EXISTS resumes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  file_type     TEXT NOT NULL,
  file_size     INTEGER NOT NULL,
  uploaded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recruiter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  company      TEXT NOT NULL,
  location     TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL,
  requirements TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  application_deadline TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id       INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id    INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'Applied'
               CHECK (status IN (
                 'Applied',
                 'Under Review',
                 'Interview',
                 'Offered',
                 'Rejected'
               )),
  applied_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id, user_id)
);

CREATE TABLE IF NOT EXISTS saved_jobs (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id   INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  saved_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, job_id)
);

-- Task 16.1 - In-app notifications. user_id is the recipient.
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL
             CHECK (type IN (
               'application_status',
               'interview_invitation',
               'new_application',
               'deadline_reminder'
             )),
  title      TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  link       TEXT    NOT NULL DEFAULT '',
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, is_read, created_at);

-- A deadline reminder is sent only once per user and job (the link names the job).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_deadline_once
  ON notifications (user_id, link)
  WHERE type = 'deadline_reminder';

-- Synthetic records representing activity before the upgrade.
INSERT INTO users (id, email, password_hash, role) VALUES
  (1, 'seeker@example.test', 'fixture-only', 'job_seeker'),
  (2, 'recruiter@example.test', 'fixture-only', 'recruiter');
INSERT INTO profiles (user_id, full_name) VALUES (1, 'Test Seeker'), (2, 'Test Recruiter');
INSERT INTO jobs (id, recruiter_id, title, company, description)
  VALUES (11, 2, 'Developer', 'Test Company', 'Build software.');
INSERT INTO applications (id, job_id, user_id, status, applied_at)
  VALUES (21, 11, 1, 'Applied', '2026-11-18 12:00:00');
