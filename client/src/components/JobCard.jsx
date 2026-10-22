import { Link } from 'react-router-dom';

function JobCard({ job }) {
  const metadata = [job.location, job.type].filter(Boolean).join(' · ');

  return (
    <article className="card job-summary">
      <h2>{job.title}</h2>
      <p>{job.company}</p>

      {metadata && <p className="job-meta">{metadata}</p>}

      <Link
        to={`/jobs/${job.id}`}
        state={{ job }}
        className="button secondary"
      >
        View Details
      </Link>
    </article>
  );
}

export default JobCard;