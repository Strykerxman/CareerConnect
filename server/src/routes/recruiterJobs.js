const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validateJobInput } = require('../validation');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('recruiter', 'Only recruiters can manage job postings.'));

const JOB_COLUMNS = `
  j.id, j.title, j.company, j.location, j.type, j.category,
  j.description, j.requirements, j.status, j.created_at AS createdAt,
  (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS applicationCount
`;

function parseId(req, res) {
  const raw = req.params.id;
  const id = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) {
    res.status(400).json({ error: 'Invalid job ID.' });
    return null;
  }
  return id;
}

// Returns the job only if it belongs to the signed-in recruiter. Other
// recruiters' postings get the same 404 as missing ones so IDs can't be probed.
function findOwnedJob(id, recruiterId) {
  return getDb()
    .prepare(`SELECT ${JOB_COLUMNS} FROM jobs j WHERE j.id = ? AND j.recruiter_id = ?`)
    .get(id, recruiterId);
}

function notFound(res) {
  return res.status(404).json({ error: 'Job not found.' });
}

// GET /api/recruiter/jobs?status=open|closed — the recruiter's own postings.
router.get('/', (req, res) => {
  const { status } = req.query;
  if (status !== undefined && !['open', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Status must be "open" or "closed".' });
  }
  const params = [req.user.id];
  let where = 'j.recruiter_id = ?';
  if (status) { where += ' AND j.status = ?'; params.push(status); }

  const jobs = getDb().prepare(`
    SELECT ${JOB_COLUMNS} FROM jobs j
    WHERE ${where}
    ORDER BY j.created_at DESC, j.id DESC
  `).all(...params);
  return res.json({ jobs });
});

// POST /api/recruiter/jobs — create a posting. It is open (visible to job seekers) unless
// the body sets status to "closed", which saves it hidden until the recruiter opens it.
router.post('/', (req, res) => {
  const { errors, values } = validateJobInput(req.body, { partial: false });
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const db = getDb();
  // Fall back to the recruiter's profile company when none is supplied.
  if (!values.company) {
    const profile = db.prepare('SELECT company_name FROM profiles WHERE user_id = ?').get(req.user.id);
    values.company = (profile && profile.company_name || '').trim();
    if (!values.company) {
      return res.status(400).json({ errors: { company: 'Enter the company name.' } });
    }
  }

  const result = db.prepare(`
    INSERT INTO jobs (recruiter_id, title, company, location, type, category, description, requirements, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, values.title, values.company, values.location ?? '', values.type ?? '',
    values.category ?? '', values.description, values.requirements ?? '', values.status ?? 'open'
  );

  const job = findOwnedJob(Number(result.lastInsertRowid), req.user.id);
  return res.status(201).json({
    message: job.status === 'open' ? 'Job posting created.' : 'Job posting saved as closed.',
    job,
  });
});

// GET /api/recruiter/jobs/:id — one of the recruiter's postings (open or closed).
router.get('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return undefined;
  const job = findOwnedJob(id, req.user.id);
  if (!job) return notFound(res);
  return res.json({ job });
});

// PATCH /api/recruiter/jobs/:id — update any subset of the editable fields,
// including `status` to show or hide the posting.
router.patch('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return undefined;

  const { errors, values } = validateJobInput(req.body, { partial: true });
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  if (!Object.keys(values).length) {
    return res.status(400).json({ error: 'Provide at least one field to update.' });
  }

  const db = getDb();
  if (!findOwnedJob(id, req.user.id)) return notFound(res);

  // Column names come from validateJobInput's fixed whitelist, never from user input.
  const columns = Object.keys(values);
  db.prepare(`UPDATE jobs SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND recruiter_id = ?`)
    .run(...columns.map(c => values[c]), id, req.user.id);

  return res.json({ message: 'Job posting updated.', job: findOwnedJob(id, req.user.id) });
});

// POST /api/recruiter/jobs/:id/close and /reopen — toggle public visibility.
function setStatus(status, message) {
  return (req, res) => {
    const id = parseId(req, res);
    if (id === null) return undefined;
    const result = getDb()
      .prepare('UPDATE jobs SET status = ? WHERE id = ? AND recruiter_id = ?')
      .run(status, id, req.user.id);
    if (result.changes === 0) return notFound(res);
    return res.json({ message, job: findOwnedJob(id, req.user.id) });
  };
}
router.post('/:id/close', setStatus('closed', 'Job posting closed.'));
router.post('/:id/reopen', setStatus('open', 'Job posting reopened.'));

// DELETE /api/recruiter/jobs/:id — only for postings nobody has applied to,
// because deleting a job would cascade-delete candidates' applications.
router.delete('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return undefined;
  const job = findOwnedJob(id, req.user.id);
  if (!job) return notFound(res);
  if (job.applicationCount > 0) {
    return res.status(409).json({
      error: 'This posting has applications and cannot be deleted. Close it instead.',
    });
  }
  getDb().prepare('DELETE FROM jobs WHERE id = ? AND recruiter_id = ?').run(id, req.user.id);
  return res.status(204).end();
});

module.exports = router;
