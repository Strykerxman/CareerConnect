import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JobForm from './JobForm';
import { makeToken } from '../test/makeToken';

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

const existingJob = {
  id: 7,
  title: 'Backend Developer',
  company: 'Acme',
  location: 'Montreal',
  type: 'Full-time',
  category: 'Engineering',
  description: 'Build APIs.',
  requirements: 'Node.js',
  status: 'open',
  createdAt: '2026-10-22 12:00:00',
  applicationCount: 0,
};

// Routes fetch calls by "METHOD /path" so each test only declares what it needs.
function mockApi(handlers) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    const key = `${options.method || 'GET'} ${new URL(url).pathname}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler(options);
  });
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/recruiter/jobs" element={<h1>Postings list</h1>} />
        <Route path="/recruiter/jobs/new" element={<JobForm key="new" />} />
        <Route path="/recruiter/jobs/:id/edit" element={<JobForm key="edit" />} />
        <Route path="/login" element={<h1>Sign in page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

const sentBody = (spy, method, path) => {
  const call = spy.mock.calls.find(([url, options]) =>
    new URL(url).pathname === path && options?.method === method);
  return call && JSON.parse(call[1].body);
};

describe('JobForm', () => {
  beforeEach(() => {
    localStorage.setItem('token', makeToken(3600));
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'recruiter' }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('publishing a new job', () => {
    it('pre-fills the company from the recruiter profile', async () => {
      mockApi({ 'GET /api/profile': () => reply(200, { profile: { company_name: 'Acme' } }) });
      renderAt('/recruiter/jobs/new');
      expect(await screen.findByDisplayValue('Acme')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Post a job' })).toBeInTheDocument();
    });

    it('blocks submission and shows errors when required fields are empty', async () => {
      const spy = mockApi({ 'GET /api/profile': () => reply(200, { profile: { company_name: '' } }) });
      renderAt('/recruiter/jobs/new');
      await userEvent.click(screen.getByRole('button', { name: 'Publish job' }));

      expect(await screen.findByText('Enter the job title.')).toBeInTheDocument();
      expect(screen.getByText('Enter the company name.')).toBeInTheDocument();
      expect(screen.getByText('Enter the job description.')).toBeInTheDocument();
      expect(screen.getByLabelText(/job title/i)).toHaveFocus();
      expect(spy.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
    });

    it('treats whitespace-only input as empty', async () => {
      mockApi({ 'GET /api/profile': () => reply(200, { profile: {} }) });
      renderAt('/recruiter/jobs/new');
      await userEvent.type(screen.getByLabelText(/job title/i), '   ');
      await userEvent.click(screen.getByRole('button', { name: 'Publish job' }));
      expect(await screen.findByText('Enter the job title.')).toBeInTheDocument();
    });

    it('posts trimmed values with the auth token, then returns to the list', async () => {
      const spy = mockApi({
        'GET /api/profile': () => reply(200, { profile: { company_name: 'Acme' } }),
        'POST /api/recruiter/jobs': () => reply(201, { job: existingJob }),
      });
      renderAt('/recruiter/jobs/new');
      await screen.findByDisplayValue('Acme');

      await userEvent.type(screen.getByLabelText(/job title/i), '  Backend Developer  ');
      await userEvent.type(screen.getByLabelText('Location'), 'Montreal');
      await userEvent.type(screen.getByLabelText('Job type'), 'Full-time');
      await userEvent.type(screen.getByLabelText(/description/i), 'Build APIs.');
      await userEvent.click(screen.getByRole('button', { name: 'Publish job' }));

      expect(await screen.findByRole('heading', { name: 'Postings list' })).toBeInTheDocument();
      expect(sentBody(spy, 'POST', '/api/recruiter/jobs')).toEqual({
        title: 'Backend Developer',
        company: 'Acme',
        location: 'Montreal',
        type: 'Full-time',
        category: '',
        description: 'Build APIs.',
        requirements: '',
        status: 'open',
      });
      const post = spy.mock.calls.find(([, o]) => o?.method === 'POST');
      expect(post[1].headers.Authorization).toBe(`Bearer ${localStorage.getItem('token')}`);
    });

    it('defaults to open and can be saved as closed without publishing', async () => {
      const spy = mockApi({
        'GET /api/profile': () => reply(200, { profile: { company_name: 'Acme' } }),
        'POST /api/recruiter/jobs': () => reply(201, { job: { ...existingJob, status: 'closed' } }),
      });
      renderAt('/recruiter/jobs/new');
      await screen.findByDisplayValue('Acme');
      expect(screen.getByRole('radio', { name: /Open/ })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Publish job' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('radio', { name: /Closed/ }));
      expect(screen.queryByRole('button', { name: 'Publish job' })).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
      await userEvent.type(screen.getByLabelText(/description/i), 'Text');
      await userEvent.click(screen.getByRole('button', { name: 'Save without publishing' }));

      await screen.findByRole('heading', { name: 'Postings list' });
      expect(sentBody(spy, 'POST', '/api/recruiter/jobs').status).toBe('closed');
    });

    it('shows server field errors and keeps the user on the form', async () => {
      mockApi({
        'GET /api/profile': () => reply(200, { profile: { company_name: 'Acme' } }),
        'POST /api/recruiter/jobs': () =>
          reply(400, { errors: { title: 'The job title must be at most 150 characters.' } }),
      });
      renderAt('/recruiter/jobs/new');
      await screen.findByDisplayValue('Acme');
      await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
      await userEvent.type(screen.getByLabelText(/description/i), 'Text');
      await userEvent.click(screen.getByRole('button', { name: 'Publish job' }));

      expect(await screen.findByText('The job title must be at most 150 characters.')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Please fix the highlighted fields.');
      expect(screen.getByRole('button', { name: 'Publish job' })).toBeEnabled();
    });

    it('shows a general error when the server is unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      renderAt('/recruiter/jobs/new');
      await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
      await userEvent.type(screen.getByLabelText(/^company/i), 'Acme');
      await userEvent.type(screen.getByLabelText(/description/i), 'Text');
      await userEvent.click(screen.getByRole('button', { name: 'Publish job' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
    });

    it('sends the user to sign in when the session has expired', async () => {
      mockApi({
        'GET /api/profile': () => reply(200, { profile: { company_name: 'Acme' } }),
        'POST /api/recruiter/jobs': () => reply(401, { error: 'Your session has expired. Sign in again.' }),
      });
      renderAt('/recruiter/jobs/new');
      await screen.findByDisplayValue('Acme');
      await userEvent.type(screen.getByLabelText(/job title/i), 'Dev');
      await userEvent.type(screen.getByLabelText(/description/i), 'Text');
      await userEvent.click(screen.getByRole('button', { name: 'Publish job' }));
      expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument();
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('editing a job', () => {
    it('loads the posting into the form', async () => {
      mockApi({ 'GET /api/recruiter/jobs/7': () => reply(200, { job: existingJob }) });
      renderAt('/recruiter/jobs/7/edit');

      expect(await screen.findByRole('heading', { name: 'Edit job posting' })).toBeInTheDocument();
      expect(screen.getByLabelText(/job title/i)).toHaveValue('Backend Developer');
      expect(screen.getByLabelText(/^company/i)).toHaveValue('Acme');
      expect(screen.getByLabelText('Location')).toHaveValue('Montreal');
      expect(screen.getByLabelText(/description/i)).toHaveValue('Build APIs.');
      expect(screen.getByLabelText(/requirements/i)).toHaveValue('Node.js');
    });

    it('saves changes with PATCH and returns to the list', async () => {
      const spy = mockApi({
        'GET /api/recruiter/jobs/7': () => reply(200, { job: existingJob }),
        'PATCH /api/recruiter/jobs/7': () => reply(200, { job: existingJob }),
      });
      renderAt('/recruiter/jobs/7/edit');
      const title = await screen.findByLabelText(/job title/i);
      await userEvent.clear(title);
      await userEvent.type(title, 'Senior Backend Developer');
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByRole('heading', { name: 'Postings list' })).toBeInTheDocument();
      expect(sentBody(spy, 'PATCH', '/api/recruiter/jobs/7')).toMatchObject({
        title: 'Senior Backend Developer',
        company: 'Acme',
      });
    });

    it('lets a recruiter clear an optional field', async () => {
      const spy = mockApi({
        'GET /api/recruiter/jobs/7': () => reply(200, { job: existingJob }),
        'PATCH /api/recruiter/jobs/7': () => reply(200, { job: existingJob }),
      });
      renderAt('/recruiter/jobs/7/edit');
      await userEvent.clear(await screen.findByLabelText('Location'));
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await screen.findByRole('heading', { name: 'Postings list' });
      expect(sentBody(spy, 'PATCH', '/api/recruiter/jobs/7').location).toBe('');
    });

    it('shows the posting’s current availability', async () => {
      mockApi({ 'GET /api/recruiter/jobs/7': () => reply(200, { job: { ...existingJob, status: 'closed' } }) });
      renderAt('/recruiter/jobs/7/edit');
      expect(await screen.findByRole('radio', { name: /Closed/ })).toBeChecked();
      expect(screen.getByRole('radio', { name: /Open/ })).not.toBeChecked();
    });

    it('lets a recruiter reopen a closed posting from the form', async () => {
      const spy = mockApi({
        'GET /api/recruiter/jobs/7': () => reply(200, { job: { ...existingJob, status: 'closed' } }),
        'PATCH /api/recruiter/jobs/7': () => reply(200, { job: existingJob }),
      });
      renderAt('/recruiter/jobs/7/edit');
      await userEvent.click(await screen.findByRole('radio', { name: /Open/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await screen.findByRole('heading', { name: 'Postings list' });
      expect(sentBody(spy, 'PATCH', '/api/recruiter/jobs/7').status).toBe('open');
    });

    it('lets a recruiter hide an open posting from the form', async () => {
      const spy = mockApi({
        'GET /api/recruiter/jobs/7': () => reply(200, { job: existingJob }),
        'PATCH /api/recruiter/jobs/7': () => reply(200, { job: { ...existingJob, status: 'closed' } }),
      });
      renderAt('/recruiter/jobs/7/edit');
      expect(await screen.findByRole('radio', { name: /Open/ })).toBeChecked();
      await userEvent.click(screen.getByRole('radio', { name: /Closed/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await screen.findByRole('heading', { name: 'Postings list' });
      expect(sentBody(spy, 'PATCH', '/api/recruiter/jobs/7').status).toBe('closed');
    });

    it('shows a not-found state for a posting that is missing or not theirs', async () => {
      mockApi({ 'GET /api/recruiter/jobs/99': () => reply(404, { error: 'Job not found.' }) });
      renderAt('/recruiter/jobs/99/edit');
      expect(await screen.findByText('Job posting not found')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to my postings' })).toBeInTheDocument();
    });
  });
});
