
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDeadlineStatus } from '../utils/deadlines';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Get the token only for logged-in job seekers
function getSeekerToken() {
  const token = localStorage.getItem('token');

  if (!token) return null;

  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user?.role === 'job_seeker' ? token : null;
  } catch {
    return null;
  }
}

function Reminders() {
  const [token] = useState(getSeekerToken);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    async function loadReminders() {
      try {
        const response = await fetch(`${API_URL}/api/reminders`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Unable to load reminders.');
        }

        const data = await response.json();

        if (!Array.isArray(data.reminders)) {
          throw new Error('Invalid reminders response.');
        }

        if (!controller.signal.aborted) {
          setReminders(data.reminders);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadReminders();

    return () => controller.abort();
  }, [token]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Deadline Reminders</h1>
        <p>Keep track of applications closing soon.</p>
      </div>

      {!token ? (
        <div className="card empty-state">
          <h2>Sign in as a job seeker</h2>
          <p>Sign in to view your application deadlines.</p>
          <Link to="/login" className="button primary">
            Sign in
          </Link>
        </div>
      ) : loading ? (
        <p role="status">Loading reminders...</p>
      ) : error ? (
        <div className="banner error" role="alert">
          {error}
        </div>
      ) : reminders.length === 0 ? (
        <div className="card empty-state">
          <h2>No upcoming deadlines.</h2>
          <p>
            You have no saved jobs with deadlines in the next three days.
          </p>
        </div>
      ) : (
        <ul className="job-list">
          {reminders.map(job => {
            // Task 13.4: Calculate deadline status once
            const deadlineStatus = getDeadlineStatus(
              job.application_deadline
            );

            // Format the deadline for display
            const formattedDeadline = deadlineStatus
              ? new Date(
                  `${job.application_deadline}T00:00:00Z`
                ).toLocaleDateString('en-US', {
                  timeZone: 'UTC',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : null;

            return (
              <li key={job.jobId}>
                <div className="card">
                  <h2>{job.title}</h2>

                  <p>{job.company}</p>

                  {/* Display the application deadline */}
                  {formattedDeadline && (
                    <p>
                      <strong>Application deadline: </strong>
                      <time dateTime={job.application_deadline}>
                        {formattedDeadline}
                      </time>
                    </p>
                  )}

                  {/* Task 13.4: Deadline indicator */}
                  {deadlineStatus && (
                    <div className="reminder-deadline-status">
                      <span
                        className={`deadline-badge deadline-${deadlineStatus.type}`}
                      >
                        {deadlineStatus.label}
                      </span>
                    </div>
                  )}

                  {/* Link to the job details page */}
                  <Link
                    to={`/jobs/${job.jobId}`}
                    className="button secondary"
                  >
                    View job
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Reminders;
