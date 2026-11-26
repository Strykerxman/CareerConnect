import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import ResumeJobMatch from './ResumeJobMatch';
import ApplyForm from './ApplyForm';
import { makeToken } from '../test/makeToken';
const report = {
  score: 50, summary: 'React is supported; Docker needs evidence.', counts: { matched: 1, partial: 0, missing: 1 },
  requirements: [
    { requirement: 'React', status: 'matched', evidence: 'Built a React app', explanation: 'A relevant project.', suggestion: '' },
    { requirement: 'Docker', status: 'missing', evidence: '', explanation: 'Not mentioned.', suggestion: 'Build a containerized demo.' },
  ], missingKeywords: ['docker'],
};
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const setup = () => render(<MemoryRouter><ResumeJobMatch jobId={3} resumeId="7" resumeName="Resume.pdf" /></MemoryRouter>);
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
it('analyzes on request and displays score, evidence, gaps, suggestions and toggle', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply({ match: report }));
  setup();
  expect(fetch).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Compare resume to this job' }));
  expect(await screen.findByRole('img', { name: '50% resume match' })).toBeInTheDocument();
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ jobId: 3 }) });
  expect(fetch.mock.calls[0][0]).toMatch(/\/api\/resume\/7\/match$/);
  expect(screen.getByText('Build a containerized demo.')).toBeInTheDocument();
  expect(screen.getByText(/not a hiring prediction/)).toBeInTheDocument();
  await userEvent.click(screen.getByText(/Requirements you cover/));
  expect(screen.getByText('Built a React app')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Hide report' }));
  expect(screen.queryByRole('region', { name: 'Job match report' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Show report' }));
  expect(screen.getByRole('region', { name: 'Job match report' })).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('shows retryable errors without inventing scores', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply({ error: 'AI is unavailable.' }, 503)).mockResolvedValue(reply({ match: report }));
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Compare resume to this job' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('AI is unavailable.');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Compare resume to this job' }));
  expect(await screen.findByRole('img', { name: '50% resume match' })).toBeInTheDocument();
});
it('prevents duplicate requests while loading', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Compare resume to this job' }));
  expect(screen.getByRole('button', { name: 'Comparing resume…' })).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('Reading requirements');
});
it('clears a previous report when the selected resume changes', async () => {
  localStorage.setItem('token', makeToken(3600));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => url.endsWith('/match') ? reply({ match: report })
    : reply({ resumes: [{ id: 7, original_name: 'Primary.pdf', is_primary: 1 }, { id: 8, original_name: 'Other.pdf' }] }));
  render(<MemoryRouter><ApplyForm jobId={3} /></MemoryRouter>);
  await userEvent.click(await screen.findByRole('button', { name: 'Compare resume to this job' }));
  await screen.findByRole('img', { name: '50% resume match' });
  await userEvent.selectOptions(screen.getByLabelText('Choose your resume'), '8');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Compare resume to this job' })).toBeInTheDocument();
  expect(screen.getByText('Other.pdf', { selector: 'strong' })).toBeInTheDocument();
});
