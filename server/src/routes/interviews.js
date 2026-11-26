const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notifyInterviewEvent } = require('../notifications');

const router = express.Router();
router.use(requireAuth);

const INTERVIEW_SELECT = `
  SELECT i.id, i.application_id AS applicationId, j.id AS jobId,
    j.title AS jobTitle, j.company,
    COALESCE(NULLIF(TRIM(p.full_name), ''), 'Candidate') AS candidateName,
    i.scheduled_at AS scheduledAt, i.duration_minutes AS durationMinutes,
    i.location, i.notes, i.status, i.created_at AS createdAt, i.updated_at AS updatedAt
  FROM interviews i
  JOIN applications a ON a.id = i.application_id
  JOIN jobs j ON j.id = a.job_id
  LEFT JOIN profiles p ON p.user_id = a.user_id
`;

function recruiterOnly(req, res, next) {
  if (req.user.role !== 'recruiter') {
    return res.status(403).json({ error: 'Only recruiters can manage interviews.' });
  }
  return next();
}

function parseId(raw) {
  const id = Number(raw);
  return /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(id) ? id : null;
}

// Require an explicit offset so a date entered in one time zone means the same
// instant to both participants. Reject calendar dates JS would normalize.
function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0', zone] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate() ||
      Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function validateFields(body, partial = false) {
  const errors = {};
  const values = {};
  const has = name => Object.hasOwn(body, name);
  if (!partial || has('scheduledAt')) {
    const value = parseTimestamp(body.scheduledAt);
    if (!value || Date.parse(value) <= Date.now()) errors.scheduledAt = 'Choose a valid future date and time with a time zone.';
    else values.scheduledAt = value;
  }
  if (!partial || has('durationMinutes')) {
    if (!Number.isInteger(body.durationMinutes) || body.durationMinutes < 1 || body.durationMinutes > 1440) {
      errors.durationMinutes = 'Duration must be between 1 and 1440 minutes.';
    } else values.durationMinutes = body.durationMinutes;
  }
  if (!partial || has('location')) {
    if (typeof body.location !== 'string' || !body.location.trim() || body.location.trim().length > 500) {
      errors.location = 'Enter a location or meeting link (up to 500 characters).';
    } else values.location = body.location.trim();
  }
  if (has('notes')) {
    if (typeof body.notes !== 'string' || body.notes.trim().length > 2000) {
      errors.notes = 'Notes must be text of at most 2000 characters.';
    } else values.notes = body.notes.trim();
  } else if (!partial) values.notes = '';
  return { errors, values };
}

function ownedInterview(id, recruiterId) {
  return getDb().prepare(`${INTERVIEW_SELECT} WHERE i.id = ? AND j.recruiter_id = ?`).get(id, recruiterId);
}

router.get('/', (req, res) => {
  const owner = req.user.role === 'recruiter' ? 'j.recruiter_id' : 'a.user_id';
  const interviews = getDb().prepare(`${INTERVIEW_SELECT} WHERE ${owner} = ? ORDER BY i.scheduled_at ASC, i.id ASC`).all(req.user.id);
  res.set('Cache-Control', 'private, no-store');
  return res.json({ interviews });
});

router.post('/', recruiterOnly, (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  if (!Number.isSafeInteger(body.applicationId) || body.applicationId <= 0) {
    return res.status(400).json({ error: 'A valid application ID is required.' });
  }
  const { errors, values } = validateFields(body);
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  const db = getDb();
  const application = db.prepare(`
    SELECT a.id FROM applications a JOIN jobs j ON j.id = a.job_id
    WHERE a.id = ? AND j.recruiter_id = ?
  `).get(body.applicationId, req.user.id);
  if (!application) return res.status(404).json({ error: 'Application not found.' });
  const id = db.transaction(() => {
    const result = db.prepare(`INSERT INTO interviews
      (application_id, scheduled_at, duration_minutes, location, notes) VALUES (?, ?, ?, ?, ?)`)
      .run(application.id, values.scheduledAt, values.durationMinutes, values.location, values.notes);
    const interviewId = Number(result.lastInsertRowid);
    notifyInterviewEvent(interviewId, 'scheduled');
    return interviewId;
  })();
  return res.status(201).json({ interview: ownedInterview(id, req.user.id) });
});

router.patch('/:id', recruiterOnly, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid interview ID.' });
  const current = ownedInterview(id, req.user.id);
  if (!current) return res.status(404).json({ error: 'Interview not found.' });
  if (current.status !== 'scheduled') return res.status(409).json({ error: 'Cancelled interviews cannot be changed.' });
  if (Date.parse(current.scheduledAt) <= Date.now()) return res.status(409).json({ error: 'Past interviews cannot be changed.' });
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const { errors, values } = validateFields(body, true);
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  const columns = { scheduledAt: 'scheduled_at', durationMinutes: 'duration_minutes', location: 'location', notes: 'notes' };
  const changed = Object.keys(values).filter(key => values[key] !== current[key]);
  if (!Object.keys(values).length) return res.status(400).json({ error: 'Provide at least one field to update.' });
  if (changed.length) {
    const db = getDb();
    db.transaction(() => {
      db.prepare(`UPDATE interviews SET ${changed.map(key => `${columns[key]} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
        .run(...changed.map(key => values[key]), id);
      notifyInterviewEvent(id, changed.includes('scheduledAt') ? 'rescheduled' : 'updated');
    })();
  }
  return res.json({ interview: ownedInterview(id, req.user.id) });
});

router.post('/:id/cancel', recruiterOnly, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid interview ID.' });
  const current = ownedInterview(id, req.user.id);
  if (!current) return res.status(404).json({ error: 'Interview not found.' });
  if (current.status !== 'scheduled') return res.status(409).json({ error: 'Interview is already cancelled.' });
  if (Date.parse(current.scheduledAt) <= Date.now()) return res.status(409).json({ error: 'Past interviews cannot be cancelled.' });
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE interviews SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(id);
    notifyInterviewEvent(id, 'cancelled');
  })();
  return res.json({ interview: ownedInterview(id, req.user.id) });
});

module.exports = router;
