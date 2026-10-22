import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Jobs from './Jobs';

describe('Jobs page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state while jobs are being fetched', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {})
    );

    render(<Jobs />);

    expect(screen.getByText('Loading jobs...')).toBeInTheDocument();
  });

  it('shows an empty state when no jobs are available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [] }),
    });

    render(<Jobs />);

    expect(
      await screen.findByText('No jobs available yet')
    ).toBeInTheDocument();

    expect(
      screen.getByText('Check back later for new opportunities.')
    ).toBeInTheDocument();
  });

  it('shows an error when the jobs API request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Network error')
    );

    render(<Jobs />);

    await waitFor(() => {
      expect(
        screen.getByText('Unable to load jobs. Please try again.')
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: 'Try again' })
    ).toBeInTheDocument();
  });
});