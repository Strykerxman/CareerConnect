import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getToken } from '../auth';
import {
  announceUnreadCount,
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../notificationsApi';

// Task 16.4 - Notifications page.

const TYPE_LABELS = {
  application_status: 'Application update',
  interview_invitation: 'Interview invitation',
  new_application: 'New application',
  deadline_reminder: 'Deadline reminder',
};

// The server stores UTC timestamps as "YYYY-MM-DD HH:MM:SS".
function formatTime(createdAt) {
  const date = new Date(`${createdAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Notifications() {
  const navigate = useNavigate();
  const [token] = useState(getToken);
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError('');

    listNotifications({ signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(data?.notifications)) throw new Error('Invalid response.');
        setNotifications(data.notifications);
        announceUnreadCount(data.unreadCount);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (err.status === 401) {
          navigate('/login', { replace: true });
          return;
        }
        setError(err.status ? err.message : 'Unable to load notifications. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [token, attempt, navigate]);

  const unread = notifications.filter(n => !n.isRead).length;
  const shown = filter === 'unread' ? notifications.filter(n => !n.isRead) : notifications;

  // Runs an action, then applies `update` to the list and refreshes the badge.
  async function run(action, update) {
    setBusy(true);
    setActionError('');
    try {
      await action();
      setNotifications(current => {
        const next = update(current);
        announceUnreadCount(next.filter(n => !n.isRead).length);
        return next;
      });
    } catch (err) {
      if (err.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      setActionError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const markRead = id => run(
    () => markNotificationRead(id),
    list => list.map(n => (n.id === id ? { ...n, isRead: true } : n))
  );
  const markAll = () => run(
    () => markAllNotificationsRead(),
    list => list.map(n => ({ ...n, isRead: true }))
  );
  const dismiss = id => run(
    () => dismissNotification(id),
    list => list.filter(n => n.id !== id)
  );

  // Opening a notification's link also marks it as read.
  function open(notification) {
    if (!notification.isRead) {
      markNotificationRead(notification.id)
        .then(data => announceUnreadCount(data.unreadCount))
        .catch(() => {});
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Notifications</h1>
        <p>Application updates, interview invitations, new applications and upcoming deadlines.</p>
      </div>

      {!token ? (
        <div className="card empty-state">
          <h2>Sign in to see your notifications</h2>
          <p>Your notifications appear here once you are signed in.</p>
          <Link to="/login" className="button primary">Sign in</Link>
        </div>
      ) : loading ? (
        <p role="status">Loading notifications...</p>
      ) : error ? (
        <div className="banner error" role="alert">
          {error}{' '}
          <button type="button" className="button secondary" onClick={() => setAttempt(a => a + 1)}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="notifications-toolbar">
            <div className="notifications-filter" role="group" aria-label="Show notifications">
              <button
                type="button"
                className={`button ${filter === 'all' ? 'primary' : 'secondary'}`}
                aria-pressed={filter === 'all'}
                onClick={() => setFilter('all')}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                className={`button ${filter === 'unread' ? 'primary' : 'secondary'}`}
                aria-pressed={filter === 'unread'}
                onClick={() => setFilter('unread')}
              >
                Unread ({unread})
              </button>
            </div>
            <button type="button" className="button secondary" onClick={markAll} disabled={busy || unread === 0}>
              Mark all as read
            </button>
          </div>

          {actionError && <div className="banner error" role="alert">{actionError}</div>}

          {shown.length === 0 ? (
            <div className="card empty-state">
              <h2>{filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}</h2>
              <p>
                {filter === 'unread'
                  ? 'You are all caught up.'
                  : 'Updates about your applications and postings will appear here.'}
              </p>
            </div>
          ) : (
            <ul className="notification-list">
              {shown.map(n => (
                <li key={n.id} className={`card notification ${n.isRead ? 'is-read' : 'is-unread'}`}>
                  <div className="notification-meta">
                    <span className={`notification-type type-${n.type}`}>
                      {TYPE_LABELS[n.type] || n.title}
                    </span>
                    {!n.isRead && <span className="notification-dot">Unread</span>}
                    <time dateTime={n.createdAt}>{formatTime(n.createdAt)}</time>
                  </div>
                  <p className="notification-message">{n.message}</p>
                  <div className="notification-actions">
                    {n.link && (
                      <Link to={n.link} className="button primary" onClick={() => open(n)}>
                        View
                      </Link>
                    )}
                    {!n.isRead && (
                      <button type="button" className="button secondary" disabled={busy} onClick={() => markRead(n.id)}>
                        Mark as read
                      </button>
                    )}
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() => dismiss(n.id)}
                      aria-label={`Dismiss: ${n.message}`}
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default Notifications;
