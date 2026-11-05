
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import Reminders from './Reminders';

function renderPage() {
  return render(
    <MemoryRouter>
      <Reminders />
    </MemoryRouter>
  );
}

describe('US-13 - Deadline Reminders UI', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, role: 'job_seeker' })
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('displays upcoming deadline reminders', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        reminders: [{
          jobId: 5,
          title: 'Frontend Developer',
          company: 'Example Company',
          application_deadline: '2026-11-08'
        }]
      })
    });

    renderPage();

    expect(await screen.findByText('Frontend Developer'))
      .toBeInTheDocument();

    expect(screen.getByText('Example Company'))
      .toBeInTheDocument();

    expect(screen.getByText('November 8, 2026'))
      .toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'View job' }))
      .toHaveAttribute('href', '/jobs/5');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/reminders$/),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token'
        }
      })
    );
  });

  it('shows an empty state when there are no deadlines', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ reminders: [] })
    });

    renderPage();

    expect(await screen.findByText('No upcoming deadlines.'))
      .toBeInTheDocument();
  });

  it('requires a job seeker account', () => {
    localStorage.clear();

    const fetchMock = vi.spyOn(globalThis, 'fetch');

    renderPage();

    expect(screen.getByText('Sign in as a job seeker'))
      .toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('displays an error when the API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500
    });

    renderPage();

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Unable to load reminders.');
  });
});
