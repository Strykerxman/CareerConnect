
// @vitest-environment jsdom
import React from 'react';

import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  afterEach
} from 'vitest';

import {
  render,
  screen,
  fireEvent,
  cleanup
} from '@testing-library/react';

import '@testing-library/jest-dom/vitest';
import ApplicationHistory from './ApplicationHistory';

vi.mock('../auth', () => ({
  getToken: () => 'test-token'
}));

const mockHistory = [
  {
    id: 1,
    status: 'Applied',
    changedAt: '2026-11-26 10:00:00'
  },
  {
    id: 2,
    status: 'Under Review',
    changedAt: '2026-11-26 11:00:00'
  },
  {
    id: 3,
    status: 'Interview',
    changedAt: '2026-11-26 12:00:00'
  }
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('US-19 - ApplicationHistory Component', () => {

  test('displays loading state', () => {
    fetch.mockImplementation(() => new Promise(() => {}));

    render(<ApplicationHistory applicationId={1} />);

    expect(
      screen.getByText('Loading application history...')
    ).toBeInTheDocument();
  });

  test('displays application history chronologically', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ history: mockHistory })
    });

    render(<ApplicationHistory applicationId={1} />);

    await screen.findByText('Interview');

    const items = screen.getAllByRole('listitem');

    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Applied');
    expect(items[1]).toHaveTextContent('Under Review');
    expect(items[2]).toHaveTextContent('Interview');

    expect(
      screen.getByText('Latest recorded status')
    ).toBeInTheDocument();
  });

  test('displays empty history message', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ history: [] })
    });

    render(<ApplicationHistory applicationId={1} />);

    expect(
      await screen.findByText('No recorded status changes yet.')
    ).toBeInTheDocument();
  });

  test('displays API error message', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'Unable to load application history.'
      })
    });

    render(<ApplicationHistory applicationId={1} />);

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('Unable to load application history.');
  });

  test('allows the user to retry a failed request', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ history: mockHistory })
    });

    render(<ApplicationHistory applicationId={1} />);

    await screen.findByRole('alert');

    fireEvent.click(
      screen.getByRole('button', { name: 'Retry' })
    );

    expect(
      await screen.findByText('Interview')
    ).toBeInTheDocument();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('requests the correct application with authentication', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ history: mockHistory })
    });

    render(<ApplicationHistory applicationId={5} />);

    await screen.findByText('Interview');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/applications/5/history'),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token'
        }
      })
    );
  });
});
