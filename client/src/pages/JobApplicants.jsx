import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { listApplicants, updateApplicationStatus } from '../recruiterJobsApi';

const STATUSES = ['Applied', 'Under Review', 'Interview', 'Offered', 'Rejected'];

function Applicant({ jobId, application }) {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(application);
  const [status, setStatus] = useState(application.status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const data = await updateApplicationStatus(jobId, application.id, status);
      setSaved(data.application);
      setStatus(data.application.status);
      setMessage('Application status saved.');
    } catch (err) {
      if (err.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      setError(err.message || 'Unable to save application status. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="card" aria-label={`Application from ${saved.candidateName}`}>
      <h2>{saved.candidateName}</h2>
      <p>Applied: {saved.appliedAt} UTC</p>
      <p>Current status: <strong>{saved.status}</strong></p>
      <form onSubmit={save} className="applicant-status-form">
        <label htmlFor={`status-${application.id}`}>Status for {saved.candidateName}</label>
        <select
          id={`status-${application.id}`}
          value={status}
          disabled={saving}
          onChange={event => {
            setStatus(event.target.value);
            setMessage('');
            setError('');
          }}
        >
          {STATUSES.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <button type="submit" className="button primary" disabled={saving || status === saved.status}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>
      {message && <p className="banner success" role="status">{message}</p>}
      {error && <p className="banner error" role="alert">{error}</p>}
    </article>
  );
}

export default function JobApplicants() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setJob(null);
    setError('');
    listApplicants(id, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        if (!data?.job || !Array.isArray(data.applications)) throw new Error('Invalid response.');
        setJob(data.job);
        setApplications(data.applications);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (err.status === 401) {
          navigate('/login', { replace: true });
          return;
        }
        setError(err.status ? err.message : 'Unable to load applicants. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, attempt, navigate]);

  return (
    <div className="page">
      <div className="page-header page-header-row">
        <div>
          <h1>{job ? `Applicants for ${job.title}` : 'Job applicants'}</h1>
          <p>Review applicants and update their application status.</p>
        </div>
        <Link to="/recruiter/jobs" className="button secondary">Back to recruiter dashboard</Link>
      </div>
      {loading && <p role="status">Loading applicants...</p>}
      {!loading && error && (
        <div className="card empty-state" role="alert">
          <p>{error}</p>
          <button type="button" className="button secondary" onClick={() => setAttempt(n => n + 1)}>Try again</button>
        </div>
      )}
      {!loading && !error && (applications.length === 0 ? (
        <div className="card empty-state"><h2>No applications yet</h2></div>
      ) : (
        <div className="job-list">
          {applications.map(application => (
            <Applicant key={`${id}-${application.id}`} jobId={id} application={application} />
          ))}
        </div>
      ))}
    </div>
  );
}
