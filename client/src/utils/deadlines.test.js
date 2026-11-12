
import { describe, expect, it } from 'vitest';
import { getDeadlineStatus } from './deadlines';

describe('Task 13.4 - Deadline indicators', () => {
  const today = new Date('2026-11-05T12:00:00Z');

  it('shows Due today', () => {
    expect(getDeadlineStatus('2026-11-05', today)).toEqual({
      label: 'Due today',
      type: 'today',
    });
  });

  it('shows 1 day left', () => {
    expect(getDeadlineStatus('2026-11-06', today)).toEqual({
      label: '1 day left',
      type: 'soon',
    });
  });

  it('shows 3 days left', () => {
    expect(getDeadlineStatus('2026-11-08', today)).toEqual({
      label: '3 days left',
      type: 'soon',
    });
  });

  it('identifies expired deadlines', () => {
    expect(getDeadlineStatus('2026-11-04', today)).toEqual({
      label: 'Deadline passed',
      type: 'expired',
    });
  });

  it('handles jobs without deadlines', () => {
    expect(getDeadlineStatus(null, today)).toBeNull();
  });

  it('rejects invalid calendar dates', () => {
    expect(getDeadlineStatus('2026-02-30', today)).toBeNull();
  });
});
