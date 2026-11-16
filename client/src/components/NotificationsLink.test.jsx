import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NotificationsLink from './NotificationsLink';
import { announceUnreadCount } from '../notificationsApi';
import { makeToken } from '../test/makeToken';

// US-16 / Task 16.5 - Unread badge in the navigation bar

function mockCount(unreadCount) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ unreadCount }),
  });
}

function renderLink() {
  return render(
    <MemoryRouter>
      <NotificationsLink className="nav-link" />
    </MemoryRouter>
  );
}

describe('US-16 - Notifications link and unread badge', () => {
  beforeEach(() => {
    localStorage.setItem('token', makeToken(3600));
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'job_seeker' }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows the unread count from the server', async () => {
    const fetchMock = mockCount(3);
    renderLink();

    const link = await screen.findByRole('link', { name: 'Notifications, 3 unread' });
    expect(link).toHaveAttribute('href', '/notifications');
    expect(link).toHaveTextContent('3');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/notifications\/unread-count$/);
  });

  it('hides the badge when nothing is unread', async () => {
    const fetchMock = mockCount(0);
    renderLink();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Notifications' })).toHaveTextContent(/^Notifications$/);
  });

  it('caps large counts at 99+', async () => {
    mockCount(150);
    renderLink();
    expect(await screen.findByText('99+')).toBeInTheDocument();
  });

  it('updates when the Notifications page announces a new count', async () => {
    mockCount(2);
    renderLink();
    await screen.findByRole('link', { name: 'Notifications, 2 unread' });

    act(() => announceUnreadCount(0));
    expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('does not ask the server when signed out', () => {
    localStorage.clear();
    const fetchMock = mockCount(5);
    renderLink();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Notifications' })).toBeInTheDocument();
  });
});
