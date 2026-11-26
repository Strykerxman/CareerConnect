import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InterviewForm from '../components/InterviewForm';
import Interviews from './Interviews';
import { makeToken } from '../test/makeToken';

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const interview = { id: 4, applicationId: 9, jobTitle: 'Developer', company: 'Acme', candidateName: 'Ada', scheduledAt: '2099-07-12T13:00:00.000Z', durationMinutes: 30, location: 'Video call', notes: 'Bring portfolio', status: 'scheduled' };
beforeEach(() => localStorage.setItem('token', makeToken(3600)));
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('interviews', () => {
  it('schedules an interview with local time converted to UTC', async () => {
    const user = userEvent.setup();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(201, { interview }));
    const onSaved = vi.fn();
    render(<MemoryRouter><InterviewForm applicationId={9} onSaved={onSaved} onCancel={() => {}} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2099-07-12T13:00' } });
    await user.clear(screen.getByLabelText('Duration (minutes)'));
    await user.type(screen.getByLabelText('Duration (minutes)'), '45');
    await user.type(screen.getByLabelText('Location or meeting link'), 'Video call');
    await user.type(screen.getByLabelText('Notes (optional)'), 'Bring portfolio');
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/interviews'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ applicationId: 9, scheduledAt: new Date('2099-07-12T13:00').toISOString(), durationMinutes: 45, location: 'Video call', notes: 'Bring portfolio' }) }));
  });
  it('shows upcoming interviews to seekers but excludes past and cancelled ones', async () => {
    localStorage.setItem('user', JSON.stringify({ role: 'job_seeker' }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { interviews: [interview, { ...interview, id: 5, jobTitle: 'Past', scheduledAt: '2001-01-01T00:00:00Z' }, { ...interview, id: 6, jobTitle: 'Cancelled', status: 'cancelled' }] }));
    render(<MemoryRouter><Interviews /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Developer' })).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText(/Video call/)).toBeInTheDocument();
    expect(screen.getByText(/Bring portfolio/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Past' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cancelled' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
  });
  it('reschedules an interview and displays server validation errors', async () => {
    const user = userEvent.setup();
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(400, { errors: { location: 'Choose a valid location.' } }))
      .mockResolvedValueOnce(reply(200, { interview }));
    const onSaved = vi.fn();
    render(<MemoryRouter><InterviewForm interview={interview} onSaved={onSaved} onCancel={() => {}} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2099-08-01T10:30' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a valid location.');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining('/api/interviews/4'), expect.objectContaining({
      method: 'PATCH', body: expect.stringContaining(new Date('2099-08-01T10:30').toISOString()),
    }));
  });
  it('lets recruiters cancel an interview and refreshes the list', async () => {
    const user = userEvent.setup();
    localStorage.setItem('user', JSON.stringify({ role: 'recruiter' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(200, { interviews: [interview] })).mockResolvedValueOnce(reply(200, { interview: { ...interview, status: 'cancelled' } })).mockResolvedValueOnce(reply(200, { interviews: [{ ...interview, status: 'cancelled' }] }));
    render(<MemoryRouter><Interviews /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Developer' });
    await user.click(screen.getByRole('button', { name: 'Cancel interview' }));
    expect(await screen.findByRole('heading', { name: 'No upcoming interviews' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/interviews/4/cancel'), expect.objectContaining({ method: 'POST' }));
    expect(screen.getByText('Interview cancelled.')).toBeInTheDocument();
  });
});
