
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import Reminders from './Reminders';

// Render the Reminders page with React Router
function renderPage() {
  return render(
    <MemoryRouter>
      <Reminders />
    </MemoryRouter>
  );
}

// Generate test dates relative to today using UTC
function dateAfter(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Format a date the same way as the Reminders page
function formatDeadline(deadline) {
  return new Date(`${deadline}T00:00:00Z`)
    .toLocaleDateString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
}

describe('US-13 - Deadline Reminders UI', () => {

  beforeEach(() => {
    localStorage.setItem('token', 'test-token');

    localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, role: 'job_seeker' })
    );
  });

  // Clean up after every test to prevent interference
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // TEST 1: Display upcoming reminders
  it('displays upcoming deadline reminders', async () => {
    const deadline = dateAfter(2);

    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          reminders: [{
            jobId: 5,
            title: 'Frontend Developer',
            company: 'Example Company',
            application_deadline: deadline,
          }],
        }),
      });

    renderPage();

    expect(await screen.findByText('Frontend Developer'))
      .toBeInTheDocument();

    expect(screen.getByText('Example Company'))
      .toBeInTheDocument();

    // Verify the formatted deadline
    const dateElement = screen.getByText(
      formatDeadline(deadline)
    );

    expect(dateElement).toBeInTheDocument();
    expect(dateElement)
      .toHaveAttribute('datetime', deadline);

    // Verify the correct job link
    expect(screen.getByRole('link', { name: 'View job' }))
      .toHaveAttribute('href', '/jobs/5');

    // Verify the API request includes the login token
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/reminders'),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
        },
      })
    );
  });

  // TEST 2: No upcoming deadlines
  it('shows an empty state when there are no deadlines', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ reminders: [] }),
    });

    renderPage();

    expect(await screen.findByText('No upcoming deadlines.'))
      .toBeInTheDocument();
  });

  // TEST 3: Authentication required
  it('requires a job seeker account', () => {
    localStorage.clear();

    const fetchMock = vi.spyOn(globalThis, 'fetch');

    renderPage();

    expect(screen.getByText('Sign in as a job seeker'))
      .toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // TEST 4: API error handling
  it('displays an error when the API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    });

    renderPage();

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Unable to load reminders.');
  });

  // TEST 5: Deadline countdown indicator
  it('displays a countdown badge for a deadline tomorrow', async () => {
    const deadline = dateAfter(1);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        reminders: [{
          jobId: 7,
          title: 'Software Intern',
          company: 'Example Company',
          application_deadline: deadline,
        }],
      }),
    });

    renderPage();

    // Verify the countdown
    const badge = await screen.findByText('1 day left');

    // Verify the correct CSS classes
    expect(badge).toHaveClass(
      'deadline-badge',
      'deadline-soon'
    );

    // Verify the job link
    expect(screen.getByRole('link', { name: 'View job' }))
      .toHaveAttribute('href', '/jobs/7');
  });

});
