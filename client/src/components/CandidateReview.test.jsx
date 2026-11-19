import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CandidateReview from './CandidateReview';
import { getCandidateReview, getSubmittedResume } from '../recruiterJobsApi';

vi.mock('../recruiterJobsApi', () => ({ getCandidateReview: vi.fn(), getSubmittedResume: vi.fn() }));
const details = {
  candidate: { fullName: 'Ada Candidate', headline: 'Software student', location: 'Montreal',
    bio: 'I build apps.', skills: ['React', 'Node.js'], linkedinUrl: 'https://www.linkedin.com/in/ada' },
  resume: { id: 4, originalName: 'submitted.pdf', fileType: 'application/pdf' },
};
function renderReview() {
  return render(<MemoryRouter initialEntries={['/review']}><Routes>
    <Route path="/review" element={<CandidateReview jobId={7} applicationId={9} />} />
    <Route path="/login" element={<h1>Sign in page</h1>} />
  </Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  getCandidateReview.mockResolvedValue(details);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:test-resume') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
});
afterEach(() => vi.restoreAllMocks());

describe('candidate review', () => {
  it('loads profile details for the selected application', async () => {
    renderReview();
    expect(screen.getByRole('status')).toHaveTextContent('Loading candidate');
    expect(await screen.findByText('Software student')).toBeInTheDocument();
    expect(screen.getByText('Ada Candidate')).toBeInTheDocument();
    expect(screen.getByText(/React, Node.js/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LinkedIn profile' })).toHaveAttribute('href', details.candidate.linkedinUrl);
    expect(getCandidateReview).toHaveBeenCalledWith(7, 9, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('shows no resume and hides unsafe profile links', async () => {
    getCandidateReview.mockResolvedValue({ candidate: { ...details.candidate, linkedinUrl: 'javascript:alert(1)' }, resume: null });
    renderReview();
    expect(await screen.findByText('No submitted resume is available for this application.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View resume' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('previews the submitted PDF and releases its object URL when closed', async () => {
    getSubmittedResume.mockResolvedValue({ headers: new Headers({ 'Content-Type': 'application/pdf' }), blob: async () => new Blob(['PDF']) });
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: 'View resume' }));
    expect(await screen.findByTitle('Preview of submitted.pdf')).toHaveAttribute('src', 'blob:test-resume');
    expect(getSubmittedResume).toHaveBeenCalledWith(7, 9, 'view', expect.any(Object));
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-resume');
    expect(screen.queryByTitle('Preview of submitted.pdf')).not.toBeInTheDocument();
  });

  it('renders a DOCX preview in a sandbox', async () => {
    getSubmittedResume.mockResolvedValue({ headers: new Headers({ 'Content-Type': 'text/html' }), text: async () => '<p>Candidate resume</p>' });
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: 'View resume' }));
    expect(await screen.findByTitle('Preview of submitted.pdf')).toHaveAttribute('sandbox', '');
    expect(screen.getByTitle('Preview of submitted.pdf')).toHaveAttribute('srcdoc', '<p>Candidate resume</p>');
  });

  it('downloads using the protected application endpoint', async () => {
    getSubmittedResume.mockResolvedValue({ blob: async () => new Blob(['PDF']) });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Download resume' }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(getSubmittedResume).toHaveBeenCalledWith(7, 9, 'download', expect.any(Object));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-resume'));
  });

  it('shows errors for a missing resume file', async () => {
    getSubmittedResume.mockRejectedValue(new Error('Resume file not found.'));
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: 'View resume' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Resume file not found.');
  });

  it('retries a failed candidate load and redirects expired sessions', async () => {
    getCandidateReview.mockRejectedValueOnce(new Error('Candidate unavailable.')).mockResolvedValueOnce(details);
    renderReview();
    expect(await screen.findByRole('alert')).toHaveTextContent('Candidate unavailable.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry candidate' }));
    expect(await screen.findByText('Software student')).toBeInTheDocument();
  });

  it('redirects an expired session to login', async () => {
    getCandidateReview.mockRejectedValue(Object.assign(new Error('Expired'), { status: 401 }));
    renderReview();
    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument();
  });

  it('aborts pending resume requests when the panel unmounts', async () => {
    let resolve;
    getSubmittedResume.mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = renderReview();
    fireEvent.click(await screen.findByRole('button', { name: 'View resume' }));
    const signal = getSubmittedResume.mock.calls[0][3].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ headers: new Headers({ 'Content-Type': 'application/pdf' }), blob: async () => new Blob(['PDF']) }));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
