import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobApplicants from './JobApplicants';
import { makeToken } from '../test/makeToken';

const application = { id: 9, candidateName: 'Ada Candidate', appliedAt: '2026-11-12 13:00:00', status: 'Applied' };
const payload = {
  job: { id: 7, title: 'Backend Developer', status: 'closed' },
  applications: [application, { ...application, id: 10, candidateName: 'Grace Candidate' }],
};
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/recruiter/jobs/7/applications']}>
      <Routes>
        <Route path="/recruiter/jobs/:id/applications" element={<JobApplicants />} />
        <Route path="/recruiter/jobs" element={<h1>Recruiter dashboard</h1>} />
        <Route path="/login" element={<h1>Sign in page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => localStorage.setItem('token', makeToken(3600)));
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('JobApplicants', () => {
  it('loads applicants with the title, names, dates and saved statuses, and navigates back', async () => {
    const user = userEvent.setup();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, payload));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading applicants...');
    expect(await screen.findByRole('heading', { name: 'Applicants for Backend Developer' })).toBeInTheDocument();
    for (const name of ['Ada Candidate', 'Grace Candidate']) {
      const row = within(screen.getByRole('article', { name: `Application from ${name}` }));
      expect(row.getByText('Applied: 2026-11-12 13:00:00 UTC')).toBeInTheDocument();
      expect(row.getByText(/Current status:/)).toHaveTextContent('Current status: Applied');
      expect(row.getByRole('combobox')).toHaveValue('Applied');
      expect(row.getByRole('button', { name: 'Save' })).toBeDisabled();
    }
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/recruiter/jobs/7/applications'), expect.objectContaining({
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    }));
    await user.click(screen.getByRole('link', { name: 'Back to recruiter dashboard' }));
    expect(screen.getByRole('heading', { name: 'Recruiter dashboard' })).toBeInTheDocument();
  });

  it('saves the selected status, disables only the saving row and displays the persisted result', async () => {
    const user = userEvent.setup();
    let finishSave;
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(200, payload))
      .mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }));
    renderPage();
    const ada = within(await screen.findByRole('article', { name: 'Application from Ada Candidate' }));
    const grace = within(screen.getByRole('article', { name: 'Application from Grace Candidate' }));
    await user.selectOptions(ada.getByRole('combobox'), 'Interview');
    expect(ada.getByText(/Current status:/)).toHaveTextContent('Applied');
    await user.click(ada.getByRole('button', { name: 'Save' }));
    expect(ada.getByRole('combobox')).toBeDisabled();
    expect(ada.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(grace.getByRole('combobox')).toBeEnabled();
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/api/recruiter/jobs/7/applications/9'), expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ status: 'Interview' }),
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
    await act(async () => finishSave(reply(200, { application: { ...application, status: 'Interview' } })));
    expect(await ada.findByRole('status')).toHaveTextContent('Application status saved.');
    expect(ada.getByText(/Current status:/)).toHaveTextContent('Current status: Interview');
    expect(ada.getByRole('combobox')).toHaveValue('Interview');
    expect(ada.getByRole('combobox')).toBeEnabled();
    expect(ada.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(grace.getByText(/Current status:/)).toHaveTextContent('Applied');
  });

  it('keeps the saved status and allows retry when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(200, payload))
      .mockResolvedValueOnce(reply(500, { error: 'Unable to save.' }))
      .mockResolvedValueOnce(reply(200, { application: { ...application, status: 'Interview' } }));
    renderPage();
    const row = within(await screen.findByRole('article', { name: 'Application from Ada Candidate' }));
    await user.selectOptions(row.getByRole('combobox'), 'Interview');
    await user.click(row.getByRole('button', { name: 'Save' }));
    expect(await row.findByRole('alert')).toHaveTextContent('Unable to save.');
    expect(row.getByText(/Current status:/)).toHaveTextContent('Applied');
    expect(row.getByRole('combobox')).toBeEnabled();
    await user.click(row.getByRole('button', { name: 'Save' }));
    expect(await row.findByRole('status')).toHaveTextContent('Application status saved.');
    expect(row.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { ...payload, applications: [] }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No applications yet' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows load errors without applicants and supports retry', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(404, { error: 'Job not found.' }))
      .mockResolvedValueOnce(reply(200, payload));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Job not found.');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Ada Candidate' })).toBeInTheDocument();
  });

  it('sends an expired server session to login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(401, { error: 'Unauthorized' }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
  });
});
