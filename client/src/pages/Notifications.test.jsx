import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Notifications from './Notifications';
import { UNREAD_EVENT } from '../notificationsApi';
import { makeToken } from '../test/makeToken';

// US-16 / Task 16.5 - Notifications page

const STATUS = {
  id: 1,
  type: 'application_status',
  title: 'Application update',
  message: 'Your application for Backend Developer at Acme is now Under Review.',
  link: '/applications',
  isRead: false,
  createdAt: '2026-11-15 14:30:00',
};
const INTERVIEW = {
  id: 2,
  type: 'interview_invitation',
  title: 'Interview invitation',
  message: 'You have been invited to interview for Data Analyst at Globex.',
  link: '/applications',
  isRead: true,
  createdAt: '2026-11-14 09:00:00',
};

function json(body, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

// Routes each request by method and path; anything unexpected fails the test.
function mockApi(handlers) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const key = `${options.method || 'GET'} ${new URL(url).pathname}`;
    if (!handlers[key]) throw new Error(`Unexpected request: ${key}`);
    return handlers[key](options);
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/notifications']}>
      <Routes>
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/applications" element={<p>Applications page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('US-16 - Notifications page', () => {
  beforeEach(() => {
    localStorage.setItem('token', makeToken(3600));
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'job_seeker' }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('asks signed-out users to sign in without calling the API', () => {
    localStorage.clear();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    renderPage();
    expect(screen.getByRole('heading', { name: 'Sign in to see your notifications' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a loading state, then each notification with its type, message, time and link', async () => {
    mockApi({ 'GET /api/notifications': () => json({ notifications: [STATUS, INTERVIEW], unreadCount: 1 }) });
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading notifications...');

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Application update')).toBeInTheDocument();
    expect(within(items[0]).getByText(STATUS.message)).toBeInTheDocument();
    expect(within(items[0]).getByText('Unread')).toBeInTheDocument();
    expect(within(items[0]).getByRole('link', { name: 'View' })).toHaveAttribute('href', '/applications');
    expect(within(items[0]).getByText(/Nov 15, 2026/)).toHaveAttribute('datetime', STATUS.createdAt);
    expect(within(items[1]).getByText('Interview invitation')).toBeInTheDocument();
    expect(within(items[1]).queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    mockApi({ 'GET /api/notifications': () => json({ notifications: [], unreadCount: 0 }) });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No notifications yet.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  });

  it('filters between all and unread notifications', async () => {
    mockApi({ 'GET /api/notifications': () => json({ notifications: [STATUS, INTERVIEW], unreadCount: 1 }) });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole('listitem');

    await user.click(screen.getByRole('button', { name: 'Unread (1)' }));
    expect(screen.getByRole('button', { name: 'Unread (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText(INTERVIEW.message)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All (2)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('marks one notification as read and announces the new unread count', async () => {
    const markRead = vi.fn(() => json({ notification: { ...STATUS, isRead: true }, unreadCount: 0 }));
    mockApi({
      'GET /api/notifications': () => json({ notifications: [STATUS, INTERVIEW], unreadCount: 1 }),
      'PATCH /api/notifications/1/read': markRead,
    });
    const announced = vi.fn();
    window.addEventListener(UNREAD_EVENT, announced);
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole('listitem');

    await user.click(screen.getByRole('button', { name: 'Mark as read' }));

    expect(markRead).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Unread')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unread (0)' })).toBeInTheDocument();
    expect(announced.mock.calls.at(-1)[0].detail).toBe(0);
    window.removeEventListener(UNREAD_EVENT, announced);
  });

  it('marks all notifications as read', async () => {
    const second = { ...STATUS, id: 3, message: 'Another update.' };
    mockApi({
      'GET /api/notifications': () => json({ notifications: [STATUS, second], unreadCount: 2 }),
      'POST /api/notifications/read-all': () => json({ updated: 2, unreadCount: 0 }),
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole('listitem');

    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(screen.queryAllByRole('button', { name: 'Mark as read' })).toHaveLength(0));
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  });

  it('dismisses a notification', async () => {
    mockApi({
      'GET /api/notifications': () => json({ notifications: [STATUS, INTERVIEW], unreadCount: 1 }),
      'DELETE /api/notifications/2': () => ({ ok: true, status: 204, json: async () => null }),
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole('listitem');

    await user.click(screen.getByRole('button', { name: `Dismiss: ${INTERVIEW.message}` }));

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.queryByText(INTERVIEW.message)).not.toBeInTheDocument();
  });

  it('opening a notification marks it as read and follows its link', async () => {
    const markRead = vi.fn(() => json({ notification: { ...STATUS, isRead: true }, unreadCount: 0 }));
    mockApi({
      'GET /api/notifications': () => json({ notifications: [STATUS], unreadCount: 1 }),
      'PATCH /api/notifications/1/read': markRead,
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('link', { name: 'View' }));

    expect(await screen.findByText('Applications page')).toBeInTheDocument();
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it('shows an error and retries loading', async () => {
    let calls = 0;
    mockApi({
      'GET /api/notifications': () => {
        calls += 1;
        return calls === 1
          ? json({ error: 'Something went wrong on the server.' }, 500)
          : json({ notifications: [STATUS], unreadCount: 1 });
      },
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on the server.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(STATUS.message)).toBeInTheDocument();
  });

  it('shows an error when an action fails and keeps the notification', async () => {
    mockApi({
      'GET /api/notifications': () => json({ notifications: [STATUS], unreadCount: 1 }),
      'DELETE /api/notifications/1': () => json({ error: 'Notification not found.' }, 404),
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: `Dismiss: ${STATUS.message}` }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Notification not found.');
    expect(screen.getByText(STATUS.message)).toBeInTheDocument();
  });

  it('sends the user to sign in when the session has expired', async () => {
    mockApi({ 'GET /api/notifications': () => json({ error: 'Your session has expired. Sign in again.' }, 401) });
    renderPage();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
  });
});
