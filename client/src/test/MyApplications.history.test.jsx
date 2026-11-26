// @vitest-environment jsdom

import React from 'react';
import { test, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup
} from '@testing-library/react';

import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import MyApplications from '../pages/MyApplications';

vi.mock('../auth', () => ({
  getToken: () => 'test-token'
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

test('opens and closes application history', async () => {
  localStorage.setItem('token', 'test-token');

  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        applications: [{
          id: 1,
          jobId: 2,
          title: 'Software Developer',
          company: 'Test Company',
          status: 'Interview',
          appliedAt: '2026-11-26 10:00:00'
        }]
      })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        history: [
          {
            id: 1,
            status: 'Applied',
            changedAt: '2026-11-26 10:00:00'
          },
          {
            id: 2,
            status: 'Interview',
            changedAt: '2026-11-26 12:00:00'
          }
        ]
      })
    })
  );

  render(
    <MemoryRouter>
      <MyApplications />
    </MemoryRouter>
  );

  const button = await screen.findByRole('button', {
    name: 'View History'
  });

  expect(fetch).toHaveBeenCalledTimes(1);

  fireEvent.click(button);

  expect(
    await screen.findByText('Latest recorded status')
  ).toBeInTheDocument();

  expect(fetch).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole('button', {
    name: 'Hide History'
  }));

  expect(
    screen.queryByText('Application Status History')
  ).not.toBeInTheDocument();

  expect(
    screen.getByRole('button', { name: 'View History' })
  ).toBeInTheDocument();
});