
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ApplyForm from '../components/ApplyForm.jsx';
import SaveJobButton from '../components/SaveJobButton.jsx';
import useSavedJobs from '../useSavedJobs';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function JobDetails() {
  const { id } = useParams();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const saved = useSavedJobs();

  // Always fetch the latest job information from the API
  useEffect(() => {
    const controller = new AbortController();

    async function loadJob() {
      setLoading(true);
      setError('');
      setJob(null);

      try {
        const response = await fetch(`${API_URL}/api/jobs/${id}`, {
          signal: controller.signal,
        });

        if (response.status === 404) {
          return;
        }

        if (!response.ok) {
          throw new Error('Request failed');
        }

        const data = await response.json();

        if (!data.job || String(data.job.id) !== id) {
          throw new Error('Invalid job response');
        }

        if (!controller.signal.aborted) {
          setJob(data.job);
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
  }, [id]);

  if (loading) {
    return (
      <main className="page">
        <p role="status">Loading job details...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page">
        <div className="banner error" role="alert">
          {error}
        </div>
        <Link to="/jobs" className="button secondary">
          Back to Jobs
        </Link>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="page">
        <div className="card empty-state">
          <h2>Job not found</h2>
          <Link to="/jobs" className="button secondary">
            Back to Jobs
          </Link>
        </div>
      </main>
    );
  }

  // Job information displayed below the company name
  const metadata = [job.location, job.type, job.category]
    .filter(Boolean)
    .join(' · ');

  // Format the application deadline, if one exists
  const formattedDeadline = job.application_deadline
    ? new Date(`${job.application_deadline}T00:00:00Z`)
        .toLocaleDateString('en-US', {
          timeZone: 'UTC',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
    : null;

  return (
    <main className="page">
      <Link to="/jobs" className="job-details-back">
        ← Back to Jobs
      </Link>

      <div className="card job-details">
        <div className="job-details-header">
          <h1>{job.title}</h1>

          <p className="job-details-company">
            {job.company}
          </p>

          {metadata && (
            <p className="job-meta">{metadata}</p>
          )}

          {/* US-13: Display application deadline */}
          {formattedDeadline && (
            <p className="job-meta">
              <strong>Application deadline: </strong>
              <time dateTime={job.application_deadline}>
                {formattedDeadline}
              </time>
            </p>
          )}

          {saved.canSave && (
            <div className="job-actions">
              <SaveJobButton
                saved={saved.isSaved(job.id)}
                pending={saved.loading || saved.isPending(job.id)}
                onToggle={() => saved.toggleSave(job)}
              />
            </div>
          )}

          {saved.error && (
            <div className="banner error" role="alert">
              {saved.error}
            </div>
          )}

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
