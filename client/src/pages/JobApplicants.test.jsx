import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobApplicants from './JobApplicants';
import { makeToken } from '../test/makeToken';

const application = { id: 9, candidateName: 'Ada Candidate', appliedAt: '2026-11-12 13:00:00', status: 'Applied' };
const payload = {
  job: { id: 7, title: 'Backend Developer', status: 'closed', applicationCount: 2 },
  applications: [application, { ...application, id: 10, candidateName: 'Grace Candidate' }],
};
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
function Location() {
  return <div data-testid="location">{useLocation().search}</div>;
}
function renderPage(query = '') {
  return render(
    <MemoryRouter initialEntries={[`/recruiter/jobs/7/applications${query}`]}>
      <Location />
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
      .mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve; }))
      .mockResolvedValue(reply(200, { ...payload, applications: [{ ...application, status: 'Interview' }, payload.applications[1]] }));
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
    expect(await screen.findByText('Application status saved.')).toBeInTheDocument();
    await screen.findByRole('article', { name: 'Application from Ada Candidate' });
    const refreshed = within(screen.getByRole('article', { name: 'Application from Ada Candidate' }));
    expect(refreshed.getByText(/Current status:/)).toHaveTextContent('Current status: Interview');
    expect(refreshed.getByRole('combobox')).toHaveValue('Interview');
    expect(refreshed.getByRole('combobox')).toBeEnabled();
    expect(refreshed.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(within(screen.getByRole('article', { name: 'Application from Grace Candidate' })).getByText(/Current status:/)).toHaveTextContent('Applied');
  });

  it('keeps the saved status and allows retry when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(200, payload))
      .mockResolvedValueOnce(reply(500, { error: 'Unable to save.' }))
      .mockResolvedValueOnce(reply(200, { application: { ...application, status: 'Interview' } }))
      .mockResolvedValue(reply(200, payload));
    renderPage();
    const row = within(await screen.findByRole('article', { name: 'Application from Ada Candidate' }));
    await user.selectOptions(row.getByRole('combobox'), 'Interview');
    await user.click(row.getByRole('button', { name: 'Save' }));
    expect(await row.findByRole('alert')).toHaveTextContent('Unable to save.');
    expect(row.getByText(/Current status:/)).toHaveTextContent('Applied');
    expect(row.getByRole('combobox')).toBeEnabled();
    await user.click(row.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Application status saved.')).toBeInTheDocument();
    expect(row.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { ...payload, applications: [] }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No applications yet' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Application status' })).toHaveValue('');
  });

  it('shows load errors without applicants and supports retry', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(404, { error: 'Job not found.' }))
      .mockResolvedValueOnce(reply(200, payload));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Job not found.');
    expect(screen.getByRole('combobox', { name: 'Application status' })).toHaveValue('');
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

describe('applicant filters', () => {
  it('applies filters to the API and URL, then clears them', async () => {
    const user = userEvent.setup();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, payload));
    renderPage();
    await screen.findByRole('heading', { name: 'Ada Candidate' });
    await user.selectOptions(screen.getByLabelText('Application status'), 'Under Review');
    fireEvent.change(screen.getByLabelText('Applied from'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Applied to'), { target: { value: '2026-11-12' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[1][0]).toContain('?status=Under+Review&from=2026-11-01&to=2026-11-12');
    expect(screen.getByTestId('location')).toHaveTextContent('?status=Under+Review&from=2026-11-01&to=2026-11-12');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch.mock.calls[2][0]).toMatch(/\/applications$/);
    expect(screen.getByTestId('location')).toBeEmptyDOMElement();
    expect(screen.getByLabelText('Application status')).toHaveValue('');
    expect(screen.getByLabelText('Applied from')).toHaveValue('');
    expect(screen.getByLabelText('Applied to')).toHaveValue('');
    expect(await screen.findByRole('heading', { name: 'Ada Candidate' })).toBeInTheDocument();
  });

  it('restores URL filters and shows no matches with the job title', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { ...payload, applications: [] }));
    renderPage('?status=Interview&from=2026-11-01&to=2026-11-12');
    expect(await screen.findByRole('heading', { name: 'No applicants match your filters' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Applicants for Backend Developer' })).toBeInTheDocument();
    expect(screen.getByLabelText('Application status')).toHaveValue('Interview');
    expect(screen.getByLabelText('Applied from')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Applied to')).toHaveValue('2026-11-12');
    expect(fetch.mock.calls[0][0]).toContain('?status=Interview&from=2026-11-01&to=2026-11-12');
  });

  it('reloads active filters after saving so an applicant leaves the status-filtered list', async () => {
    const user = userEvent.setup();
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(200, { ...payload, applications: [application] }))
      .mockResolvedValueOnce(reply(200, { application: { ...application, status: 'Interview' } }))
      .mockResolvedValueOnce(reply(200, { ...payload, applications: [] }));
    renderPage('?status=Applied');
    const row = within(await screen.findByRole('article', { name: 'Application from Ada Candidate' }));
    await user.selectOptions(row.getByRole('combobox'), 'Interview');
    await user.click(row.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'No applicants match your filters' })).toBeInTheDocument();
    expect(fetch.mock.calls[2][0]).toContain('/applications?status=Applied');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('shows no applications yet for a posting with no applications even with active filters', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { ...payload, job: { ...payload.job, applicationCount: 0 }, applications: [] }));
    renderPage('?status=Interview');
    expect(await screen.findByRole('heading', { name: 'No applications yet' })).toBeInTheDocument();
  });

  it('validates reversed date ranges before requesting', async () => {
    const user = userEvent.setup();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, payload));
    renderPage();
    await screen.findByRole('heading', { name: 'Ada Candidate' });
    fireEvent.change(screen.getByLabelText('Applied from'), { target: { value: '2026-11-12' } });
    fireEvent.change(screen.getByLabelText('Applied to'), { target: { value: '2026-11-01' } });
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Applied from must be on or before Applied to.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows API validation errors from URL filters and allows clearing them', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(400, { error: 'Choose a valid application status.' }))
      .mockResolvedValueOnce(reply(200, payload));
    renderPage('?status=Invalid');
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a valid application status.');
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('heading', { name: 'Ada Candidate' })).toBeInTheDocument();
  });

  it('ignores stale responses after a newer filtered request completes', async () => {
    const user = userEvent.setup();
    let resolveOld;
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(reply(200, { ...payload, applications: [] }));
    renderPage();
    await user.selectOptions(screen.getByLabelText('Application status'), 'Rejected');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByRole('heading', { name: 'No applicants match your filters' })).toBeInTheDocument();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolveOld(reply(200, payload)));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No applicants match your filters' })).toBeInTheDocument();
  });
});
