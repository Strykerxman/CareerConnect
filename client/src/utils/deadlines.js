
const DAY_MS = 24 * 60 * 60 * 1000;

// Task 13.4 - Calculate days remaining using UTC dates
export function getDeadlineStatus(deadline, now = new Date()) {
  if (
    typeof deadline !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(deadline)
  ) {
    return null;
  }

  const deadlineMs = Date.parse(`${deadline}T00:00:00Z`);

  // Reject invalid calendar dates
  if (
    !Number.isFinite(deadlineMs) ||
    new Date(deadlineMs).toISOString().slice(0, 10) !== deadline
  ) {
    return null;
  }

  const todayMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  const daysLeft = Math.round(
    (deadlineMs - todayMs) / DAY_MS
  );

  if (daysLeft < 0) {
    return { label: 'Deadline passed', type: 'expired' };
  }

  if (daysLeft === 0) {
    return { label: 'Due today', type: 'today' };
  }

  return {
    label: `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`,
    type: daysLeft <= 3 ? 'soon' : 'later',
  };
}
