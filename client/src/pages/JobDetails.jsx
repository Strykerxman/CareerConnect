import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import ApplyForm from '../components/ApplyForm.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function JobDetails() {
  const { id } = useParams();
  const location = useLocation();

  const initialJob =
    String(location.state?.job?.id) === id
      ? location.state.job
      : null;

  const [job, setJob] = useState(initialJob);
  const [loading, setLoading] = useState(!initialJob);
  const [error, setError] = useState('');

  useEffect(() => {
    if (job && String(job.id) === id) return;

    const controller = new AbortController();

    async function loadJob() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`${API_URL}/api/jobs`, {
          signal: controller.signal,
        });

        if (!response.ok) throw new Error('Request failed');

        const data = await response.json();

        if (!Array.isArray(data.jobs)) {
          throw new Error('Invalid response');
        }

        const selectedJob = data.jobs.find(
          item => String(item.id) === id
        );

        if (!controller.signal.aborted) {
          setJob(selectedJob || null);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError('Unable to load job details.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadJob();

    return () => controller.abort();
  }, [id, job]);

  if (loading) {
    return <main className="page"><p role="status">Loading job details...</p></main>;
  }

  if (error) {
    return (
      <main className="page">
        <div className="banner error" role="alert">{error}</div>
        <Link to="/jobs" className="button secondary">Back to Jobs</Link>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="page">
        <div className="card empty-state">
          <h2>Job not found</h2>
          <Link to="/jobs" className="button secondary">Back to Jobs</Link>
        </div>
      </main>
    );
  }

  const metadata = [job.location, job.type, job.category]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="page">
      <Link to="/jobs" className="job-details-back">
        ← Back to Jobs
      </Link>

      <div className="card job-details">
        <div className="job-details-header">
          <h1>{job.title}</h1>
          <p className="job-details-company">{job.company}</p>
          {metadata && <p className="job-meta">{metadata}</p>}
          <ApplyForm key={job.id} jobId={job.id} />
        </div>

        <div className="job-details-section">
          <h2>Job Description</h2>
          <p>{job.description || 'No description provided.'}</p>
        </div>

        <div className="job-details-section">
          <h2>Requirements</h2>
          <p>{job.requirements || 'No requirements provided.'}</p>
        </div>
      </div>
    </main>
  );
}

export default JobDetails;