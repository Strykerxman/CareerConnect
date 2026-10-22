import JobCard from '../components/JobCard';

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
