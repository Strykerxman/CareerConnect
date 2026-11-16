import { request } from './recruiterJobsApi';

// Task 16.4 - Client for /api/notifications.

const base = '/api/notifications';

export const listNotifications = options => request(base, options);
export const getUnreadCount = options => request(`${base}/unread-count`, options);
export const markNotificationRead = id => request(`${base}/${id}/read`, { method: 'PATCH' });
export const markAllNotificationsRead = () => request(`${base}/read-all`, { method: 'POST' });
export const dismissNotification = id => request(`${base}/${id}`, { method: 'DELETE' });

// The navigation badge listens for this event so it updates as soon as the
// Notifications page changes the unread count.
export const UNREAD_EVENT = 'notifications:unread';

export function announceUnreadCount(count) {
  window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: count }));
}
