import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function MyApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const token = localStorage.getItem('token');

    async function loadApplications() {
      if (!token) {
        setError('Please sign in to view your applications.');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/applications`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load applications.');
        }

        if (!controller.signal.aborted) {
          setApplications(data.applications || []);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadApplications();
    return () => controller.abort();
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>My Applications</h1>
        <p>Track the status of your submitted job applications.</p>
      </div>

      {loading ? (
        <p role="status">Loading applications...</p>
      ) : error ? (
        <div className="banner error" role="alert">{error}</div>
      ) : applications.length === 0 ? (
        <div className="card empty-state">
          <h2>No applications yet</h2>
          <p>Browse available jobs and submit your first application.</p>
          <Link to="/jobs" className="button primary">
            Browse Jobs
          </Link>
        </div>
      ) : (
        <div className="job-list">
          {applications.map(application => (
            <article className="card" key={application.id}>
              <h2>{application.title}</h2>
              <p>{application.company}</p>

              <p className="job-meta">
                {[application.location, application.type]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              <p>
                <strong>Status:</strong> {application.status}
              </p>

              <p>
                <strong>Applied:</strong> {application.appliedAt}
              </p>

              <Link
                to={`/jobs/${application.jobId}`}
                className="button secondary"
              >
                View Job
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}