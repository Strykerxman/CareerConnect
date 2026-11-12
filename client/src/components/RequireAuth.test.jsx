import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import RequireAuth from './RequireAuth';
import { makeToken } from '../test/makeToken';

// Stand-ins for pages this file isn't testing: it only checks where the guard sends people.
vi.mock('../pages/Login', () => ({ default: () => <h1>Sign in page</h1> }));
vi.mock('../pages/Profile', () => ({ default: () => <h1>Profile page</h1> }));

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

function signIn(role, expSecondsFromNow = 3600) {
  localStorage.setItem('token', makeToken(expSecondsFromNow));
  localStorage.setItem('user', JSON.stringify({ id: 1, email: 'a@example.com', role }));
}

// The guard on its own, with stand-in pages.
function renderGuard(role) {
  return render(
    <MemoryRouter initialEntries={['/secret']}>
      <Routes>
        <Route path="/login" element={<h1>Sign in page</h1>} />
        <Route path="/profile" element={<h1>Profile page</h1>} />
        <Route element={<RequireAuth role={role} />}>
          <Route path="/secret" element={<h1>Protected page</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('RequireAuth', () => {
  it('sends a signed-out visitor to sign in', () => {
    renderGuard('recruiter');
    expect(screen.getByRole('heading', { name: 'Sign in page' })).toBeInTheDocument();
  });

  it('sends a visitor with an expired session to sign in and clears it', () => {
    signIn('recruiter', -60);
    renderGuard('recruiter');
    expect(screen.getByRole('heading', { name: 'Sign in page' })).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('sends a job seeker away from a recruiter-only page', () => {
    signIn('job_seeker');
    renderGuard('recruiter');
    expect(screen.getByRole('heading', { name: 'Profile page' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Protected page' })).not.toBeInTheDocument();
  });

  it('lets a recruiter into a recruiter-only page', () => {
    signIn('recruiter');
    renderGuard('recruiter');
    expect(screen.getByRole('heading', { name: 'Protected page' })).toBeInTheDocument();
  });

  it('lets any signed-in user in when no role is required', () => {
    signIn('job_seeker');
    renderGuard(undefined);
    expect(screen.getByRole('heading', { name: 'Protected page' })).toBeInTheDocument();
  });
});

// The real route table: the three recruiter pages and the navigation link.
describe('recruiter routes in the app', () => {
  const RECRUITER_PAGES = ['/recruiter/jobs', '/recruiter/jobs/new', '/recruiter/jobs/7/edit'];

  function mockApi() {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const { pathname } = new URL(url);
      if (pathname === '/api/recruiter/jobs') return reply(200, { jobs: [] });
      if (pathname === '/api/profile') return reply(200, { profile: { company_name: 'Acme' } });
      if (pathname === '/api/saved-jobs') return reply(200, { savedJobs: [] });
      if (pathname === '/api/recruiter/jobs/7') return reply(404, { error: 'Job not found.' });
      return reply(200, {});
    });
  }
  const recruiterCalls = spy =>
    spy.mock.calls.filter(([url]) => new URL(url).pathname.startsWith('/api/recruiter'));

  const renderApp = path =>
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

  it.each(RECRUITER_PAGES)('%s sends a signed-out visitor to sign in without calling the API', async (path) => {
    const spy = mockApi();
    renderApp(path);
    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument();
    expect(recruiterCalls(spy)).toHaveLength(0);
  });

  it.each(RECRUITER_PAGES)('%s keeps a job seeker out without calling the API', async (path) => {
    signIn('job_seeker');
    const spy = mockApi();
    renderApp(path);
    expect(await screen.findByRole('heading', { name: 'Profile page' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recruiter dashboard' })).not.toBeInTheDocument();
    expect(recruiterCalls(spy)).toHaveLength(0);
  });

  it('opens the dashboard and the publish form for a recruiter', async () => {
    signIn('recruiter');
    mockApi();
    renderApp('/recruiter/jobs');
    expect(await screen.findByRole('heading', { name: 'Recruiter dashboard' })).toBeInTheDocument();
  });

  it('opens the publish form for a recruiter', async () => {
    signIn('recruiter');
    mockApi();
    renderApp('/recruiter/jobs/new');
    expect(await screen.findByRole('button', { name: 'Publish job' })).toBeInTheDocument();
  });

  it('shows the Dashboard link to recruiters only', async () => {
    mockApi();
    signIn('job_seeker');
    const seekerView = renderApp('/saved-jobs');
    await screen.findByRole('heading', { name: 'Saved Jobs' });
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    seekerView.unmount();

    signIn('recruiter');
    renderApp('/saved-jobs');
    await screen.findByRole('heading', { name: 'Saved Jobs' });
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/recruiter/jobs');
  });
});
