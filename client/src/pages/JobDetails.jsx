import { Link, useLocation, useParams } from 'react-router-dom';

function JobDetails() {
  const { id } = useParams();
  const location = useLocation();
  const job = location.state?.job;

  if (!job) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Job Details</h1>
        </div>

        <div className="card empty-state">
          <h2>Job not found</h2>
          <p>We could not load the details for job #{id}.</p>

          <Link to="/jobs" className="button secondary">
            Back to Jobs
          </Link>
        </div>
      </div>
    );
  }

  const metadata = [job.location, job.type, job.category]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="page">
      <Link to="/jobs" className="job-details-back">
        ← Back to Jobs
      </Link>

      <div className="card job-details">
        <div className="job-details-header">
          <h1>{job.title}</h1>
          <p className="job-details-company">{job.company}</p>

          {metadata && (
            <p className="job-meta">{metadata}</p>
          )}
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
    </div>
  );
}

export default JobDetails;