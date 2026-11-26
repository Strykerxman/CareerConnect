const { getDb } = require('./db');

// Task 16.3 - Create notifications when application events happen.
// Every function here only inserts rows for the recipient; access control
// for reading them is in routes/notifications.js.

// Days before a saved job's deadline when the job seeker is reminded.
const DEADLINE_WINDOW_DAYS = 3;

function createNotification({ userId, type, title, message, link = '' }) {
  getDb().prepare(`
    INSERT INTO notifications (user_id, type, title, message, link)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, title, message, link);
}

// A job seeker applied: tell the recruiter who owns the posting.
function notifyNewApplication(applicationId) {
  const row = getDb().prepare(`
    SELECT
      j.id AS jobId,
      j.title,
      j.recruiter_id AS recruiterId,
      COALESCE(NULLIF(TRIM(p.full_name), ''), 'A candidate') AS candidateName
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    LEFT JOIN profiles p ON p.user_id = a.user_id
    WHERE a.id = ?
  `).get(applicationId);

  if (!row) return;

  createNotification({
    userId: row.recruiterId,
    type: 'new_application',
    title: 'New application',
    message: `${row.candidateName} applied to ${row.title}.`,
    link: `/recruiter/jobs/${row.jobId}/applications`,
  });
}

// A recruiter changed an application's status: tell the applicant.
// Saving the same status again sends nothing.
function notifyStatusChange(applicationId, previousStatus, newStatus) {
  if (previousStatus === newStatus) return;

  const row = getDb().prepare(`
    SELECT a.user_id AS userId, j.title, j.company
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = ?
  `).get(applicationId);

  if (!row) return;

  if (newStatus === 'Interview') {
    createNotification({
      userId: row.userId,
      type: 'interview_invitation',
      title: 'Interview invitation',
      message: `You have been invited to interview for ${row.title} at ${row.company}.`,
      link: '/applications',
    });
    return;
  }

  createNotification({
    userId: row.userId,
    type: 'application_status',
    title: 'Application update',
    message: `Your application for ${row.title} at ${row.company} is now ${newStatus}.`,
    link: '/applications',
  });
}

// Interview changes are recorded in the same transaction as their notification.
function notifyInterviewEvent(interviewId, event) {
  const labels = {
    scheduled: ['Interview scheduled', 'scheduled'],
    rescheduled: ['Interview rescheduled', 'rescheduled'],
    updated: ['Interview updated', 'updated'],
    cancelled: ['Interview cancelled', 'cancelled'],
  };
  if (!labels[event]) throw new Error('Unknown interview notification event.');

  const row = getDb().prepare(`
    SELECT a.user_id AS userId, j.title, j.company,
           i.scheduled_at AS scheduledAt, i.location
    FROM interviews i
    JOIN applications a ON a.id = i.application_id
    JOIN jobs j ON j.id = a.job_id
    WHERE i.id = ?
  `).get(interviewId);
  if (!row) throw new Error('Interview not found for notification.');

  const time = new Date(row.scheduledAt).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  const message = event === 'cancelled'
    ? `Your interview for ${row.title} at ${row.company}, originally scheduled for ${time}, has been cancelled.`
    : `Your interview for ${row.title} at ${row.company} has been ${labels[event][1]} for ${time} at ${row.location}.`;
  createNotification({
    userId: row.userId,
    type: 'interview_invitation',
    title: labels[event][0],
    message,
    link: '/interviews',
  });
}

// Saved open jobs whose deadline is within the window get one reminder each.
// There is no background scheduler, so this runs whenever the job seeker
// loads their notifications. The unique index makes repeat calls a no-op.
function createDeadlineReminders(userId) {
  const db = getDb();
  const jobs = db.prepare(`
    SELECT j.id, j.title, j.company, j.application_deadline AS deadline
    FROM saved_jobs s
    JOIN jobs j ON j.id = s.job_id
    WHERE s.user_id = ?
      AND j.status = 'open'
      AND j.application_deadline IS NOT NULL
      AND j.application_deadline >= date('now')
      AND j.application_deadline <= date('now', ?)
  `).all(userId, `+${DEADLINE_WINDOW_DAYS} days`);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO notifications (user_id, type, title, message, link)
    VALUES (?, 'deadline_reminder', 'Deadline coming up', ?, ?)
  `);

  for (const job of jobs) {
    insert.run(
      userId,
      `Applications for ${job.title} at ${job.company} close on ${job.deadline}.`,
      `/jobs/${job.id}`
    );
  }
}

module.exports = {
  createNotification,
  notifyNewApplication,
  notifyStatusChange,
  notifyInterviewEvent,
  createDeadlineReminders,
  DEADLINE_WINDOW_DAYS,
};
