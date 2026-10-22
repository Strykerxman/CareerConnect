// Task 6.2: page layout. Live job loading is added by Task 6.5 (#35).
function Jobs({ jobs = [] }) {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Jobs</h1>
        <p>Discover available job opportunities.</p>
      </div>

      <section aria-label="Available opportunities">
        {jobs.length === 0 ? (
          <div className="card empty-state">
            <h2>No jobs available yet</h2>
            <p>Check back later for new opportunities.</p>
          </div>
        ) : (
          <ul className="job-list">
            {jobs.map(job => (
              <li key={job.id}>
                <article className="card job-summary">
                  <h2>{job.title}</h2>
                  <p>{job.company}</p>
                  {(job.location || job.type) && (
                    <p className="job-meta">
                      {[job.location, job.type].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default Jobs;
