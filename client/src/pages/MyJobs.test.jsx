import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyJobs from './MyJobs';
import { makeToken } from '../test/makeToken';

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

const job = (overrides = {}) => ({
  id: 1, title: 'Backend Developer', company: 'Acme', location: 'Montreal', type: 'Full-time',
  category: 'Engineering', description: 'd', requirements: '', status: 'open',
  createdAt: '2026-10-22 12:00:00', applicationCount: 0, ...overrides,
});

function mockApi(handlers) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const key = `${options.method || 'GET'} ${new URL(url).pathname}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler(options);
  });
}

function renderPage(state, search = '') {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/recruiter/jobs', search, state }]}>
      <Routes>
        <Route path="/recruiter/jobs" element={<MyJobs />} />
        <Route path="/recruiter/jobs/new" element={<h1>New job page</h1>} />
        <Route path="/recruiter/jobs/:id/edit" element={<h1>Edit job page</h1>} />
        <Route path="/jobs/:id" element={<h1>Public listing page</h1>} />
        <Route path="/login" element={<h1>Sign in page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MyJobs (recruiter dashboard)', () => {
  beforeEach(() => localStorage.setItem('token', makeToken(3600)));
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('links to applicants for both open and closed postings', async () => {
    mockApi({ 'GET /api/recruiter/jobs': () => reply(200, { jobs: [
      job(), job({ id: 2, title: 'Closed posting', status: 'closed', applicationCount: 1 }),
    ] }) });
    renderPage();
    expect(await screen.findByRole('link', { name: 'View applicants for Backend Developer' }))
      .toHaveAttribute('href', '/recruiter/jobs/1/applications');
    expect(screen.getByRole('link', { name: 'View applicants for Closed posting' }))
      .toHaveAttribute('href', '/recruiter/jobs/2/applications');
  });

  it('shows an empty state with a link to post a job', async () => {
    mockApi({ 'GET /api/recruiter/jobs': () => reply(200, { jobs: [] }) });
    renderPage();
    expect(await screen.findByText("You haven't posted any jobs yet")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('link', { name: 'Post a job' })[0]);
    expect(await screen.findByRole('heading', { name: 'New job page' })).toBeInTheDocument();
  });

  it('lists postings with status and application counts, and links to edit', async () => {
    mockApi({
      'GET /api/recruiter/jobs': () => reply(200, {
        jobs: [job(), job({ id: 2, title: 'Designer', status: 'closed', applicationCount: 3 })],
      }),
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Backend Developer' })).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText(/3 applications/)).toBeInTheDocument();
    expect(screen.getByText(/0 applications/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Edit Designer' }));
    expect(await screen.findByRole('heading', { name: 'Edit job page' })).toBeInTheDocument();
  });

  it('shows the success message passed from the form', async () => {
    mockApi({ 'GET /api/recruiter/jobs': () => reply(200, { jobs: [] }) });
    renderPage({ message: 'Job posting published.' });
    expect(await screen.findByRole('status')).toHaveTextContent('Job posting published.');
  });

  it('closes and reopens a posting', async () => {
    mockApi({
      'GET /api/recruiter/jobs': () => reply(200, { jobs: [job()] }),
      'POST /api/recruiter/jobs/1/close': () => reply(200, { job: job({ status: 'closed' }) }),
      'POST /api/recruiter/jobs/1/reopen': () => reply(200, { job: job({ status: 'open' }) }),
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Close Backend Developer' }));
    expect(await screen.findByText('Closed')).toBeInTheDocument();
    expect(screen.getByText(/now hidden from job seekers/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reopen Backend Developer' }));
    expect(await screen.findByText('Open')).toBeInTheDocument();
    expect(screen.getByText(/visible to job seekers again/)).toBeInTheDocument();
  });

  it('deletes a posting after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi({
      'GET /api/recruiter/jobs': () => reply(200, { jobs: [job()] }),
      'DELETE /api/recruiter/jobs/1': () => reply(204, null),
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Backend Developer' }));
    expect(await screen.findByText("You haven't posted any jobs yet")).toBeInTheDocument();
  });

  it('does not delete when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const spy = mockApi({ 'GET /api/recruiter/jobs': () => reply(200, { jobs: [job()] }) });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Backend Developer' }));
    expect(spy.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Backend Developer' })).toBeInTheDocument();
  });

  it('disables delete for postings that have applications', async () => {
    mockApi({ 'GET /api/recruiter/jobs': () => reply(200, { jobs: [job({ applicationCount: 2 })] }) });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Delete Backend Developer' })).toBeDisabled();
    expect(screen.getByText(/close it instead/i)).toBeInTheDocument();
  });

  it('shows an error with a retry button when loading fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('sends the user to sign in when the session has expired', async () => {
    mockApi({ 'GET /api/recruiter/jobs': () => reply(401, { error: 'Your session has expired.' }) });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument();
  });
  describe('overview and filtering', () => {
    const portfolio = [
      job({ id: 1, title: 'Backend Developer', company: 'Acme', createdAt: '2026-10-01 09:00:00', applicationCount: 2 }),
      job({ id: 2, title: 'Designer', company: 'Globex', location: 'Toronto', createdAt: '2026-10-05 09:00:00', applicationCount: 0 }),
      job({ id: 3, title: 'Analyst', company: 'Initech', status: 'closed', createdAt: '2026-10-03 09:00:00', applicationCount: 3 }),
    ];
    const headings = () => screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    const mockPortfolio = () => mockApi({ 'GET /api/recruiter/jobs': () => reply(200, { jobs: portfolio }) });
    const cardValue = label => screen.getByText(label).nextElementSibling.textContent;

    it('summarises postings and total applications', async () => {
      mockPortfolio();
      renderPage();
      await screen.findByRole('heading', { name: 'Designer' });
      expect(cardValue('Total postings')).toBe('3');
      expect(cardValue('Open postings')).toBe('2');
      expect(cardValue('Closed postings')).toBe('1');
      expect(cardValue('Applications received')).toBe('5');
    });

    it('lists newest first by default and can re-sort', async () => {
      mockPortfolio();
      renderPage();
      await screen.findByRole('heading', { name: 'Designer' });
      expect(headings()).toEqual(['Designer', 'Analyst', 'Backend Developer']);

      await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'applications');
      expect(headings()).toEqual(['Analyst', 'Backend Developer', 'Designer']);
      await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'title');
      expect(headings()).toEqual(['Analyst', 'Backend Developer', 'Designer']);
      await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'oldest');
      expect(headings()).toEqual(['Backend Developer', 'Analyst', 'Designer']);
    });

    it('filters by status with counts on the tabs', async () => {
      mockPortfolio();
      renderPage();
      await screen.findByRole('heading', { name: 'Designer' });
      expect(screen.getByRole('button', { name: 'All (3)' })).toHaveAttribute('aria-pressed', 'true');

      await userEvent.click(screen.getByRole('button', { name: 'Closed (1)' }));
      expect(headings()).toEqual(['Analyst']);
      expect(screen.getByText('Showing 1 of 3 postings')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Open (2)' }));
      expect(headings()).toEqual(['Designer', 'Backend Developer']);
    });

    it('starts from the status saved in the URL', async () => {
      mockPortfolio();
      renderPage(undefined, '?status=closed&sort=bogus');
      expect(await screen.findByRole('heading', { name: 'Analyst' })).toBeInTheDocument();
      expect(headings()).toEqual(['Analyst']);
    });

    it('searches title, company and location, and clears filters when nothing matches', async () => {
      mockPortfolio();
      renderPage();
      await screen.findByRole('heading', { name: 'Designer' });

      await userEvent.type(screen.getByLabelText('Search postings'), 'globex');
      expect(headings()).toEqual(['Designer']);

      await userEvent.clear(screen.getByLabelText('Search postings'));
      await userEvent.type(screen.getByLabelText('Search postings'), 'toronto');
      expect(headings()).toEqual(['Designer']);

      await userEvent.clear(screen.getByLabelText('Search postings'));
      await userEvent.type(screen.getByLabelText('Search postings'), 'zzz');
      expect(screen.getByText('No postings match your filters')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(headings()).toHaveLength(3);
      expect(screen.getByLabelText('Search postings')).toHaveValue('');
    });

    it('offers a public listing link only for open postings', async () => {
      mockPortfolio();
      renderPage();
      await screen.findByRole('heading', { name: 'Designer' });
      expect(screen.getByRole('link', { name: 'View listing for Designer' })).toHaveAttribute('href', '/jobs/2');
      expect(screen.queryByRole('link', { name: 'View listing for Analyst' })).not.toBeInTheDocument();
    });

    it('updates the summary and tabs after closing a posting', async () => {
      mockApi({
        'GET /api/recruiter/jobs': () => reply(200, { jobs: portfolio }),
        'POST /api/recruiter/jobs/2/close': () => reply(200, { job: { ...portfolio[1], status: 'closed' } }),
      });
      renderPage();
      await screen.findByRole('heading', { name: 'Designer' });
      await userEvent.click(screen.getByRole('button', { name: 'Close Designer' }));
      expect(await screen.findByRole('button', { name: 'Open (1)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Closed (2)' })).toBeInTheDocument();
      expect(cardValue('Open postings')).toBe('1');
      expect(cardValue('Closed postings')).toBe('2');
    });
  });
});
