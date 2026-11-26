import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { closeJob, deleteJob, listMyJobs, reopenJob } from '../recruiterJobsApi';

const APPLICATION_STATUSES = ['Applied', 'Under Review', 'Interview', 'Offered', 'Rejected'];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'applications', label: 'Most applications' },
  { value: 'title', label: 'Title (A–Z)' },
];

// createdAt is "YYYY-MM-DD HH:MM:SS" (UTC), so plain string comparison orders it correctly.
const byNewest = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || b.id - a.id;

function sortJobs(jobs, sort) {
  const sorted = [...jobs];
  if (sort === 'oldest') sorted.sort((a, b) => byNewest(b, a));
  else if (sort === 'applications') sorted.sort((a, b) => b.applicationCount - a.applicationCount || byNewest(a, b));
  else if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title) || byNewest(a, b));
  else sorted.sort(byNewest);
  return sorted;
}

function matchesSearch(job, term) {
  return [job.title, job.company, job.location, job.type, job.category]
    .some(value => (value || '').toLowerCase().includes(term));
}

function SummaryCard({ label, value }) {
  return (
    <div className="stats-summary-card">
      <p className="stats-summary-label">{label}</p>
      <p className="stats-summary-value">{value}</p>
    </div>
  );
}

// Recruiter dashboard: an overview of every posting plus the actions to manage them.
function MyJobs() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [flash, setFlash] = useState(location.state?.message || '');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const filterToggle = useRef(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [validation, setValidation] = useState('');

  // Filters live in the URL so a refresh or shared link keeps the same view.
  const statusParam = searchParams.get('status');
  const sortParam = searchParams.get('sort');
  const status = STATUS_FILTERS.some(f => f.value === statusParam) ? statusParam : 'all';
  const sort = SORT_OPTIONS.some(o => o.value === sortParam) ? sortParam : 'newest';
  const query = searchParams.get('q') || '';

  const applicationStatus = searchParams.get('applicationStatus') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const filterCount = [applicationStatus, from, to].filter(Boolean).length;
  const [draft, setDraft] = useState({ applicationStatus, from, to });
  useEffect(() => {
    setDraft({ applicationStatus, from, to });
    setValidation('');
  }, [applicationStatus, from, to]);

  function updateFilters(changes) {
    const next = { status, sort, q: query, applicationStatus, from, to, ...changes };
    const params = new URLSearchParams();
    if (next.status !== 'all') params.set('status', next.status);
    if (next.sort !== 'newest') params.set('sort', next.sort);
    if (next.q) params.set('q', next.q);
    for (const key of ['applicationStatus', 'from', 'to']) {
      if (next[key]) params.set(key, next[key]);
    }
    setSearchParams(params, { replace: true });
  }

  // The success message was passed through router state; clear it so a refresh doesn't replay it.
  useEffect(() => {
    if (location.state?.message) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    const filters = Object.fromEntries(Object.entries({ applicationStatus, from, to }).filter(([, value]) => value));
    listMyJobs({ filters, signal: controller.signal })
      .then(data => {
        if (!Array.isArray(data?.jobs)) throw new Error('Invalid response.');
        setJobs(data.jobs);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (err.status === 401) {
          navigate('/login', { replace: true });
          return;
        }
        setError(err.status ? err.message : 'Unable to load your job postings. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, applicationStatus, from, to]);

  const totals = useMemo(() => {
    const open = jobs.filter(job => job.status === 'open').length;
    return {
      all: jobs.length,
      open,
      closed: jobs.length - open,
      applications: jobs.reduce((sum, job) => sum + job.applicationCount, 0),
    };
  }, [jobs]);

  const visibleJobs = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = jobs.filter(job =>
      (status === 'all' || job.status === status) && (!term || matchesSearch(job, term)) &&
      (!filterCount || job.matchingApplicationCount > 0));
    return sortJobs(filtered, sort);
  }, [jobs, status, sort, query, filterCount]);

  function applyApplicationFilters(event) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setValidation('Applied from must be on or before Applied to.');
      return;
    }
    setValidation('');
    updateFilters(draft);
    setFiltersOpen(false);
    filterToggle.current?.focus();
  }

  function clearApplicationFilters() {
    setDraft({ applicationStatus: '', from: '', to: '' });
    setValidation('');
    updateFilters({ applicationStatus: '', from: '', to: '' });
  }

  function applicantsLink(id) {
    const params = new URLSearchParams();
    if (applicationStatus) params.set('status', applicationStatus);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return `/recruiter/jobs/${id}/applications${params.size ? `?${params}` : ''}`;
  }

  async function runAction(job, action, onSuccess) {
    setBusyId(job.id);
    setActionError('');
    setFlash('');
    try {
      const result = await action(job.id);
      onSuccess(result);
    } catch (err) {
      if (err.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function toggleStatus(job) {
    const closing = job.status === 'open';
    runAction(job, closing ? closeJob : reopenJob, result => {
      setJobs(previous => previous.map(item => (item.id === job.id ? { ...item, ...result.job } : item)));
      setFlash(closing
        ? 'Job posting closed. It is now hidden from job seekers.'
        : 'Job posting reopened. It is visible to job seekers again.');
    });
  }

  function remove(job) {
    if (!window.confirm(`Delete "${job.title}"? This cannot be undone.`)) return;
    runAction(job, deleteJob, () => {
      setJobs(previous => previous.filter(item => item.id !== job.id));
      setFlash('Job posting deleted.');
    });
  }

  return (
    <div className="page">
      <div className="page-header page-header-row">
        <div>
          <h1>Recruiter dashboard</h1>
          <p>Track your openings and the applications they receive, and publish, edit, or close postings.</p>
        </div>
        <Link to="/recruiter/jobs/new" className="button primary">Post a job</Link>
      </div>

      {flash && <div className="banner success" role="status">{flash}</div>}
      {actionError && <div className="banner error" role="alert">{actionError}</div>}

      {loading && <p className="loading">Loading your postings...</p>}

      {!loading && error && (
        <div className="card empty-state" role="alert">
          <h3>{error}</h3>
          <button type="button" className="button secondary" onClick={() => setAttempt(n => n + 1)}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <div className="card empty-state">
          <h3>You haven't posted any jobs yet</h3>
          <p>Publish your first opening to start receiving applications.</p>
          <Link to="/recruiter/jobs/new" className="button primary">Post a job</Link>
        </div>
      )}

      {!loading && !error && jobs.length > 0 && (
        <>
          <section className="dashboard-summary" aria-label="Postings summary">
            <SummaryCard label="Total postings" value={totals.all} />
            <SummaryCard label="Open postings" value={totals.open} />
            <SummaryCard label="Closed postings" value={totals.closed} />
            <SummaryCard label="Applications received" value={totals.applications} />
          </section>

          <div className="dashboard-toolbar">
            <div className="dashboard-search">
              <label htmlFor="posting-search">Search postings</label>
              <input
                id="posting-search"
                type="search"
                value={query}
                onChange={event => updateFilters({ q: event.target.value })}
                placeholder="Title, company, location..."
              />
            </div>

            <div className="dashboard-sort">
              <label htmlFor="posting-sort">Sort by</label>
              <select id="posting-sort" value={sort} onChange={event => updateFilters({ sort: event.target.value })}>
                {SORT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <button type="button" className="button secondary dashboard-filter-toggle" ref={filterToggle}
              aria-expanded={filtersOpen} aria-controls="posting-application-filters"
              onClick={() => setFiltersOpen(open => !open)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="var(--surface)" /><circle cx="15" cy="17" r="3" fill="var(--surface)" />
              </svg>
              Filters{filterCount > 0 && <span className="dashboard-filter-count">{filterCount}</span>}
              <span aria-hidden="true">{filtersOpen ? '⌃' : '⌄'}</span>
            </button>
          </div>

          {filtersOpen && (
            <form id="posting-application-filters" className="card dashboard-filter-panel" onSubmit={applyApplicationFilters}>
              <h2>Filter by applications</h2>
              <p className="field-help">Show postings with at least one application matching all selected filters. Dates use UTC.</p>
              <div className="dashboard-filter-fields">
                <div className="form-group">
                  <label htmlFor="posting-application-status">Application status</label>
                  <select id="posting-application-status" value={draft.applicationStatus}
                    onChange={event => setDraft({ ...draft, applicationStatus: event.target.value })}>
                    <option value="">All statuses</option>
                    {APPLICATION_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="posting-applied-from">Applied from</label>
                  <input id="posting-applied-from" type="date" value={draft.from}
                    onChange={event => setDraft({ ...draft, from: event.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="posting-applied-to">Applied to</label>
                  <input id="posting-applied-to" type="date" value={draft.to}
                    onChange={event => setDraft({ ...draft, to: event.target.value })} />
                </div>
              </div>
              {validation && <p className="banner error" role="alert">{validation}</p>}
              <div className="dashboard-filter-actions">
                <button type="button" className="button secondary" onClick={clearApplicationFilters}>Clear application filters</button>
                <button type="submit" className="button primary">Apply filters</button>
              </div>
            </form>
          )}
          {filterCount > 0 && (
            <div className="dashboard-active-filters">
              <span>Applications: {[applicationStatus, from && `from ${from}`, to && `to ${to}`].filter(Boolean).join(' · ')}</span>
              <button type="button" onClick={clearApplicationFilters}>Clear application filters</button>
            </div>
          )}

          <div className="dashboard-tabs" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map(filter => (
              <button
                key={filter.value}
                type="button"
                className={status === filter.value ? 'dashboard-tab active' : 'dashboard-tab'}
                aria-pressed={status === filter.value}
                onClick={() => updateFilters({ status: filter.value })}
              >
                {filter.label} ({totals[filter.value]})
              </button>
            ))}
          </div>

          <p className="field-help" role="status" aria-live="polite">
            Showing {visibleJobs.length} of {jobs.length} {jobs.length === 1 ? 'posting' : 'postings'}
          </p>

          {visibleJobs.length === 0 && (
            <div className="card empty-state">
              <h3>No postings match your filters</h3>
              <button
                type="button"
                className="button secondary"
                onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
              >
                Clear filters
              </button>
            </div>
          )}

          {visibleJobs.length > 0 && (
            <ul className="job-list">
              {visibleJobs.map(job => {
                const isOpen = job.status === 'open';
                const busy = busyId === job.id;
                const metadata = [job.location, job.type, job.category].filter(Boolean).join(' · ');
                const count = job.applicationCount;
                return (
                  <li key={job.id}>
                    <article className="card posting-card">
                      <div className="posting-info">
                        <div className="posting-title">
                          <h2>{job.title}</h2>
                          <span
                            className={isOpen ? 'status-badge' : 'status-badge closed'}
                            title={isOpen ? 'Visible to job seekers' : 'Hidden from job seekers'}
                          >
                            {isOpen ? 'Open' : 'Closed'}
                          </span>
                        </div>
                        <p>{job.company}</p>
                        {metadata && <p className="job-meta">{metadata}</p>}
                        <p className="job-meta">
                          {count} {count === 1 ? 'application' : 'applications'}
                          {job.createdAt && ` · Posted ${job.createdAt.slice(0, 10)}`}
                        </p>
                      </div>

                      <div className="posting-actions">
                        <Link
                          to={applicantsLink(job.id)}
                          className="button secondary"
                          aria-label={`View applicants for ${job.title}`}
                        >
                          View applicants
                        </Link>
                        <Link
                          to={`/recruiter/jobs/${job.id}/edit`}
                          className="button secondary"
                          aria-label={`Edit ${job.title}`}
                        >
                          Edit
                        </Link>
                        {isOpen && (
                          <Link
                            to={`/jobs/${job.id}`}
                            className="button secondary"
                            aria-label={`View listing for ${job.title}`}
                          >
                            View listing
                          </Link>
                        )}
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => toggleStatus(job)}
                          disabled={busy}
                          aria-label={`${isOpen ? 'Close' : 'Reopen'} ${job.title}`}
                          title={isOpen ? 'Hide this posting from job seekers' : 'Make this posting visible to job seekers again'}
                        >
                          {isOpen ? 'Close' : 'Reopen'}
                        </button>
                        <button
                          type="button"
                          className="button danger"
                          onClick={() => remove(job)}
                          disabled={busy || count > 0}
                          aria-label={`Delete ${job.title}`}
                        >
                          Delete
                        </button>
                        {count > 0 && (
                          <span className="field-help">Has applications. Close it instead of deleting.</span>
                        )}
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default MyJobs;
