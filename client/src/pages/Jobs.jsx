import { useEffect, useState } from 'react';
import JobCard from '../components/JobCard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadJobs() {
      setLoading(true);
      setError('');
      setJobs([]);

      try {
        const response = await fetch(`${API_URL}/api/jobs`, {
          signal: controller.signal,
        });

        if (!response.ok) throw new Error('Jobs request failed.');

        const data = await response.json();

        if (
          !Array.isArray(data?.jobs) ||
          !data.jobs.every(
            job =>
              job &&
              Number.isInteger(job.id) &&
              typeof job.title === 'string' &&
              typeof job.company === 'string' &&
              (job.location == null || typeof job.location === 'string') &&
              (job.type == null || typeof job.type === 'string')
          )
        ) {
          throw new Error('Invalid jobs response.');
        }

        if (!controller.signal.aborted) {
          setJobs(data.jobs);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError('Unable to load jobs. Please try again.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadJobs();

    return () => controller.abort();
  }, [attempt]);

  const searchValue = search.trim().toLowerCase();

  const filteredJobs = jobs.filter(job => {
    if (!searchValue) return true;

    return (
      job.title.toLowerCase().includes(searchValue) ||
      job.company.toLowerCase().includes(searchValue) ||
      (job.location || '').toLowerCase().includes(searchValue) ||
      (job.type || '').toLowerCase().includes(searchValue)
    );
  });

  function clearSearch() {
    setSearch('');
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Jobs</h1>
        <p>Discover available job opportunities.</p>
      </div>

      {!loading && !error && jobs.length > 0 && (
        <div className="job-search">
          <label htmlFor="job-search">Search jobs</label>

          <input
            id="job-search"
            type="search"
            placeholder="Search by title, company, location..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>
      )}

      <section
        aria-label="Available opportunities"
        aria-busy={loading}
      >
        {loading ? (
          <p role="status">Loading jobs...</p>
        ) : error ? (
          <div className="banner error">
            <p role="alert">{error}</p>

            <button
              className="button secondary"
              type="button"
              onClick={() => setAttempt(value => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="card empty-state">
            <h2>No jobs available yet</h2>
            <p>Check back later for new opportunities.</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="card empty-state">
            <h2>No jobs found</h2>
            <p>No jobs match your current search.</p>

            <button
              type="button"
              className="button secondary"
              onClick={clearSearch}
            >
              Clear search
            </button>
          </div>
        ) : (
          <ul className="job-list">
            {filteredJobs.map(job => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default Jobs;