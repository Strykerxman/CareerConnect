import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Resumes from './Resumes';

const resume = {
  id: 7,
  original_name: 'my-resume.pdf',
  file_type: 'application/pdf',
  file_size: 2048,
  uploaded_at: '2026-11-01 12:00:00',
};

const feedback = {
  summary: 'A solid start for a junior developer.',
  strengths: ['Clear project descriptions'],
  suggestions: [
    { category: 'content', title: 'Add numbers', detail: 'Show the impact of your work.' },
    { category: 'skills', title: 'Group skills', detail: 'Separate languages and tools.' },
    { category: 'formatting', title: 'Shorten', detail: 'Keep it to one page.' },
  ],
};

function mockFetch(feedbackResponse) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
    if (url.endsWith('/feedback') && options.method === 'POST') return feedbackResponse;
    return { ok: true, json: async () => ({ resumes: [resume] }) };
  });
}

describe('Resumes page - AI feedback (US-15)', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows AI feedback grouped by category', async () => {
    const fetchMock = mockFetch({ ok: true, json: async () => ({ feedback }) });

    render(<Resumes />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get AI Feedback' }));

    expect(await screen.findByText('A solid start for a junior developer.')).toBeInTheDocument();
    expect(screen.getByText('Clear project descriptions')).toBeInTheDocument();
    for (const heading of ['Content', 'Skills', 'Formatting']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText('Add numbers:')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/resume\/7\/feedback$/),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('still shows every category when one has no suggestions', async () => {
    const withoutFormatting = {
      ...feedback,
      suggestions: feedback.suggestions.filter(item => item.category !== 'formatting'),
    };
    mockFetch({ ok: true, json: async () => ({ feedback: withoutFormatting }) });

    render(<Resumes />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get AI Feedback' }));

    expect(await screen.findByRole('heading', { name: 'Formatting' })).toBeInTheDocument();
    expect(screen.getByText('No changes suggested. This part of your resume looks good.')).toBeInTheDocument();
    expect(screen.getByText('Add numbers:')).toBeInTheDocument();
    expect(screen.getByText('Group skills:')).toBeInTheDocument();
  });

  it('shows an error and says the resume was not changed when analysis fails', async () => {
    mockFetch({
      ok: false,
      json: async () => ({ error: 'The AI feedback service is unavailable. Please try again later.' }),
    });

    render(<Resumes />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get AI Feedback' }));

    expect(await screen.findByText('The AI feedback service is unavailable. Please try again later.'))
      .toBeInTheDocument();
    expect(screen.getByText('Your resume was not changed.')).toBeInTheDocument();
    expect(screen.getByText('my-resume.pdf')).toBeInTheDocument();
  });

  it('shows a PDF resume on the page without downloading it (#114)', async () => {
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    window.URL.createObjectURL = vi.fn(() => 'blob:resume-preview');
    window.URL.revokeObjectURL = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (url.endsWith('/view')) {
        return { ok: true, headers: new Headers({ 'Content-Type': 'application/pdf' }), blob: async () => pdf };
      }
      return { ok: true, json: async () => ({ resumes: [resume] }) };
    });

    render(<Resumes />);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));

    const frame = await screen.findByTitle('Preview of my-resume.pdf');
    expect(frame).toHaveAttribute('src', 'blob:resume-preview');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/resume\/7\/view$/), expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTitle('Preview of my-resume.pdf')).not.toBeInTheDocument();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:resume-preview');
  });

  it('shows a DOCX resume in a sandboxed frame (#114)', async () => {
    const docxResume = { ...resume, original_name: 'my-resume.docx' };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (url.endsWith('/view')) {
        return { ok: true, headers: new Headers({ 'Content-Type': 'text/html' }), text: async () => '<p>Jordan Tester</p>' };
      }
      return { ok: true, json: async () => ({ resumes: [docxResume] }) };
    });

    render(<Resumes />);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));

    const frame = await screen.findByTitle('Preview of my-resume.docx');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame.getAttribute('srcdoc')).toContain('Jordan Tester');
  });

  it('shows an error when a resume cannot be displayed (#114)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (url.endsWith('/view')) {
        return { ok: false, json: async () => ({ error: 'This resume could not be displayed. Try downloading it instead.' }) };
      }
      return { ok: true, json: async () => ({ resumes: [resume] }) };
    });

    render(<Resumes />);
    fireEvent.click(await screen.findByRole('button', { name: 'View' }));

    expect(await screen.findByText('This resume could not be displayed. Try downloading it instead.')).toBeInTheDocument();
  });

  it('closes the feedback panel', async () => {
    mockFetch({ ok: true, json: async () => ({ feedback }) });

    render(<Resumes />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get AI Feedback' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));

    expect(screen.queryByText('A solid start for a junior developer.')).not.toBeInTheDocument();
  });
});
