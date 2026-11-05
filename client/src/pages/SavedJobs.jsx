import { Link } from 'react-router-dom';
import JobCard from '../components/JobCard';
import useSavedJobs from '../useSavedJobs';

// US-09 / Task 9.4 — Jobs the job seeker saved to come back to later.
export default function SavedJobs() {
  const saved = useSavedJobs();

  return (
    <div className="page">
      <div className="page-header">
        <h1>Saved Jobs</h1>
        <p>Jobs you saved to come back to later.</p>
      </div>

      {!saved.canSave ? (
        <div className="card empty-state">
          <h2>Saved jobs are for job seekers</h2>
          <p>Sign in with a job seeker account to save jobs.</p>
          <Link to="/login" className="button primary">
            Sign in
          </Link>
        </div>
      ) : saved.loading ? (
        <p role="status">Loading saved jobs...</p>
      ) : (
        <>
          {saved.error && (
            <div className="banner error" role="alert">{saved.error}</div>
          )}

          {saved.savedJobs.length === 0 ? (
            <div className="card empty-state">
              <h2>No saved jobs yet</h2>
              <p>Save jobs you are interested in to find them here.</p>
              <Link to="/jobs" className="button primary">
                Browse Jobs
              </Link>
            </div>
          ) : (
            <ul className="job-list">
              {saved.savedJobs.map(job => (
                <li key={job.id}>
                  <JobCard
                    job={job}
                    saved
                    savePending={saved.isPending(job.id)}
                    onToggleSave={saved.toggleSave}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
