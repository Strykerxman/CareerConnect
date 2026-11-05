import React, { useEffect, useState } from 'react';
import JobCard from '../components/JobCard';
import useSavedJobs from '../useSavedJobs';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const saved = useSavedJobs();

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

        if (!response.ok) {
          throw new Error('Jobs request failed.');
        }

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

  // Generate dropdown options from available jobs.
  const locations = [
    ...new Set(jobs.map(job => job.location).filter(Boolean)),
  ].sort();

  const types = [
    ...new Set(jobs.map(job => job.type).filter(Boolean)),
  ].sort();

  const categories = [
    ...new Set(jobs.map(job => job.category).filter(Boolean)),
  ].sort();

  // Apply keyword and dropdown filters together.
  const searchValue = search.trim().toLowerCase();

  const filteredJobs = jobs.filter(job => {
    const matchesSearch =
      !searchValue ||
      [
        job.title,
        job.company,
        job.description,
        job.requirements,
        job.location,
        job.type,
        job.category,
      ].some(value =>
        String(value || '').toLowerCase().includes(searchValue)
      );

    const matchesLocation =
      !selectedLocation || job.location === selectedLocation;

    const matchesType =
      !selectedType || job.type === selectedType;

    const matchesCategory =
      !selectedCategory || job.category === selectedCategory;

    return (
      matchesSearch &&
      matchesLocation &&
      matchesType &&
      matchesCategory
    );
  });

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedLocation !== '' ||
    selectedType !== '' ||
    selectedCategory !== '';

  // Reset all four filters at once.
  function resetFilters() {
    setSearch('');
    setSelectedLocation('');
    setSelectedType('');
    setSelectedCategory('');
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Jobs</h1>
        <p>Discover available job opportunities.</p>
      </div>

      {!loading && !error && (
        <div className="job-search">
          <label htmlFor="job-search">Search jobs</label>

          <input
            id="job-search"
            type="search"
            placeholder="Search jobs by keyword..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />

          <div className="job-filter-grid">
            <div>
              <label htmlFor="location-filter">Location</label>
              <select
                id="location-filter"
                value={selectedLocation}
                onChange={event => setSelectedLocation(event.target.value)}
              >
                <option value="">All locations</option>
                {locations.map(location => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="type-filter">Job Type</label>
              <select
                id="type-filter"
                value={selectedType}
                onChange={event => setSelectedType(event.target.value)}
              >
                <option value="">All job types</option>
                {types.map(type => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="category-filter">Category</label>
              <select
                id="category-filter"
                value={selectedCategory}
                onChange={event => setSelectedCategory(event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Active filters and reset button */}
      {!loading && !error && hasActiveFilters && (
        <div className="active-filters">
          <div className="active-filters-list">
            <span className="active-filters-label">
              Active filters:
            </span>

            {search.trim() && (
              <span className="filter-chip">
                Search: {search.trim()}
              </span>
            )}

            {selectedLocation && (
              <span className="filter-chip">
                Location: {selectedLocation}
              </span>
            )}

            {selectedType && (
              <span className="filter-chip">
                Type: {selectedType}
              </span>
            )}

            {selectedCategory && (
              <span className="filter-chip">
                Category: {selectedCategory}
              </span>
            )}
          </div>

          <button
            type="button"
            className="button secondary"
            onClick={resetFilters}
          >
            Reset Filters
          </button>
        </div>
      )}
      {saved.error && (
        <div className="banner error" role="alert">{saved.error}</div>
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
            <p>No jobs match your current filters.</p>

            <button
              type="button"
              className="button secondary"
              onClick={resetFilters}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <ul className="job-list">
            {filteredJobs.map(job => (
              <li key={job.id}>
                <JobCard
                  job={job}
                  saved={saved.isSaved(job.id)}
                  savePending={saved.isPending(job.id)}
                  onToggleSave={saved.canSave ? saved.toggleSave : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default Jobs;
