import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { listApplicants, updateApplicationStatus } from '../recruiterJobsApi';

const STATUSES = ['Applied', 'Under Review', 'Interview', 'Offered', 'Rejected'];

function Applicant({ jobId, application, onSaved }) {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(application);
  const [status, setStatus] = useState(application.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = await updateApplicationStatus(jobId, application.id, status);
      setSaved(data.application);
      setStatus(data.application.status);
      onSaved();
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
            setError('');
          }}
        >
          {STATUSES.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <button type="submit" className="button primary" disabled={saving || status === saved.status}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </form>
      {error && <p className="banner error" role="alert">{error}</p>}
    </article>
  );
}

function filterError(filters) {
  if (filters.status && !STATUSES.includes(filters.status)) return 'Choose a valid application status.';
  for (const key of ['from', 'to']) {
    const value = filters[key];
    if (!value) continue;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000') ||
        !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      return 'Enter valid application dates in YYYY-MM-DD format.';
    }
  }
  if (filters.from && filters.to && filters.from > filters.to) return 'Applied from must be on or before Applied to.';
  return '';
}

export default function JobApplicants() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.toString();
  const [draft, setDraft] = useState(() => Object.fromEntries(['status', 'from', 'to'].map(key => [key, searchParams.get(key) || ''])));
  const [validation, setValidation] = useState('');
  const [message, setMessage] = useState('');
  const active = ['status', 'from', 'to'].some(key => searchParams.has(key));
  const [job, setJob] = useState(null);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(query);
    const filters = Object.fromEntries(['status', 'from', 'to'].filter(key => params.has(key)).map(key => [key, params.get(key)]));
    setDraft({ status: '', from: '', to: '', ...filters });
    setValidation('');
    const controller = new AbortController();
    setLoading(true);
    setJob(null);
    setError('');
    listApplicants(id, { filters, signal: controller.signal })
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
  }, [id, query, attempt, navigate]);

  function applyFilters(event) {
    event.preventDefault();
    const error = filterError(draft);
    setValidation(error);
    if (error) return;
    const params = new URLSearchParams(query);
    for (const key of ['status', 'from', 'to']) {
      if (draft[key]) params.set(key, draft[key]);
      else params.delete(key);
    }
    setMessage('');
    setSearchParams(params);
  }

  function clearFilters() {
    const params = new URLSearchParams(query);
    ['status', 'from', 'to'].forEach(key => params.delete(key));
    setDraft({ status: '', from: '', to: '' });
    setValidation('');
    setMessage('');
    setSearchParams(params);
  }

  return (
    <div className="page">
      <div className="page-header page-header-row">
        <div>
          <h1>{job ? `Applicants for ${job.title}` : 'Job applicants'}</h1>
          <p>Review applicants and update their application status.</p>
        </div>
        <Link to="/recruiter/jobs" className="button secondary">Back to recruiter dashboard</Link>
      </div>
      <form className="card applicant-status-form" onSubmit={applyFilters}>
        <label htmlFor="filter-status">Application status</label>
        <select id="filter-status" value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })}>
          <option value="">All statuses</option>
          {draft.status && !STATUSES.includes(draft.status) && <option value={draft.status}>{draft.status}</option>}
          {STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
        </select>
        <label htmlFor="filter-from">Applied from</label>
        <input id="filter-from" type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} />
        <label htmlFor="filter-to">Applied to</label>
        <input id="filter-to" type="date" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} />
        <button type="submit" className="button primary">Apply filters</button>
        <button type="button" className="button secondary" onClick={clearFilters}>Clear filters</button>
      </form>
      {validation && <p className="banner error" role="alert">{validation}</p>}
      {message && <p className="banner success" role="status">{message}</p>}
      {loading && <p role="status">Loading applicants...</p>}
      {!loading && error && (
        <div className="card empty-state" role="alert">
          <p>{error}</p>
          <button type="button" className="button secondary" onClick={() => setAttempt(n => n + 1)}>Try again</button>
        </div>
      )}
      {!loading && !error && (applications.length === 0 ? (
        <div className="card empty-state"><h2>{active && job?.applicationCount > 0 ? 'No applicants match your filters' : 'No applications yet'}</h2></div>
      ) : (
        <div className="job-list">
          {applications.map(application => (
            <Applicant key={`${id}-${application.id}`} jobId={id} application={application} onSaved={() => {
              setMessage('Application status saved.');
              setAttempt(n => n + 1);
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}
