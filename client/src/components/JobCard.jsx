import { Link } from 'react-router-dom';
import SaveJobButton from './SaveJobButton';

// Pass `onToggleSave` to show the Save button (job seekers only).
function JobCard({ job, saved = false, savePending = false, onToggleSave }) {
  const metadata = [job.location, job.type].filter(Boolean).join(' · ');

  return (
    <article className="card job-summary">
      <h2>{job.title}</h2>
      <p>{job.company}</p>

      {metadata && <p className="job-meta">{metadata}</p>}

      <div className="job-actions">
        <Link
          to={`/jobs/${job.id}`}
          state={{ job }}
          className="button secondary"
        >
          View Details
        </Link>

        {onToggleSave && (
          <SaveJobButton
            saved={saved}
            pending={savePending}
            onToggle={() => onToggleSave(job)}
          />
        )}
      </div>
    </article>
  );
}

export default JobCard;
