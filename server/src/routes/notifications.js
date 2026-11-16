const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createDeadlineReminders } = require('../notifications');

const router = express.Router();

// Task 16.2 - Every route needs a signed-in user and only ever touches that
// user's own notifications.
router.use(requireAuth);

const COLUMNS = `
  id, type, title, message, link,
  is_read AS isRead, created_at AS createdAt
`;

function toNotification(row) {
  return { ...row, isRead: row.isRead === 1 };
}

function unreadCount(userId) {
  return getDb()
    .prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(userId).count;
}

// Deadline reminders are created on demand, the first time the job seeker
// checks their notifications after a saved job enters the reminder window.
function refreshReminders(req) {
  if (req.user.role === 'job_seeker') createDeadlineReminders(req.user.id);
}

function parseId(req, res) {
  const raw = req.params.id;
  const id = Number(raw);
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(id)) {
    res.status(400).json({ error: 'Invalid notification ID.' });
    return null;
  }
  return id;
}

// Another user's notification gets the same 404 as a missing one, so IDs
// cannot be probed.
function findOwned(id, userId) {
  return getDb()
    .prepare(`SELECT ${COLUMNS} FROM notifications WHERE id = ? AND user_id = ?`)
    .get(id, userId);
}

function notFound(res) {
  return res.status(404).json({ error: 'Notification not found.' });
}

// GET /api/notifications - newest first, with the unread count.
router.get('/', (req, res) => {
  refreshReminders(req);
  const notifications = getDb().prepare(`
    SELECT ${COLUMNS} FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(req.user.id).map(toNotification);

  return res.json({ notifications, unreadCount: unreadCount(req.user.id) });
});

// GET /api/notifications/unread-count - used by the navigation badge.
router.get('/unread-count', (req, res) => {
  refreshReminders(req);
  return res.json({ unreadCount: unreadCount(req.user.id) });
});

// POST /api/notifications/read-all
router.post('/read-all', (req, res) => {
  const result = getDb()
    .prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
    .run(req.user.id);
  return res.json({ updated: result.changes, unreadCount: 0 });
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return undefined;
  if (!findOwned(id, req.user.id)) return notFound(res);

  getDb()
    .prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
    .run(id, req.user.id);

  return res.json({
    notification: toNotification(findOwned(id, req.user.id)),
    unreadCount: unreadCount(req.user.id),
  });
});

// DELETE /api/notifications/:id - dismiss.
router.delete('/:id', (req, res) => {
  const id = parseId(req, res);
  if (id === null) return undefined;

  const result = getDb()
    .prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?')
    .run(id, req.user.id);
  if (result.changes === 0) return notFound(res);

  return res.status(204).end();
});

module.exports = router;
