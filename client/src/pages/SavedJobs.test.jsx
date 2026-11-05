import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SavedJobs from './SavedJobs';

function renderPage() {
  return render(
    <MemoryRouter>
      <SavedJobs />
    </MemoryRouter>
  );
}

const savedJobs = [
  { id: 2, title: 'Frontend Developer', company: 'Acme', location: 'Montreal' },
  { id: 1, title: 'Backend Developer', company: 'Globex', location: 'Laval' },
];

describe('Saved Jobs page', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'job_seeker' }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows an empty state when nothing is saved', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ savedJobs: [] }),
    });

    renderPage();

    expect(await screen.findByText('No saved jobs yet')).toBeInTheDocument();
  });

  it('lists saved jobs and removes one when unsaved', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ savedJobs }) })
      .mockResolvedValueOnce({ ok: true, status: 204 });

    renderPage();

    expect(await screen.findByText('Frontend Developer')).toBeInTheDocument();
    expect(screen.getByText('Backend Developer')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Saved' })[0]);

    await waitFor(() => {
      expect(screen.queryByText('Frontend Developer')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Backend Developer')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/api\/saved-jobs\/2$/),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('asks recruiters and signed-out users to sign in as a job seeker', () => {
    localStorage.setItem('user', JSON.stringify({ id: 3, role: 'recruiter' }));
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    renderPage();

    expect(screen.getByText('Saved jobs are for job seekers')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
