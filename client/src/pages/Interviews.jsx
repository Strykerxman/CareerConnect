import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser } from '../auth';
import InterviewForm from '../components/InterviewForm';
import { cancelInterview, listInterviews } from '../interviewsApi';

export default function Interviews() {
  const navigate = useNavigate();
  const isRecruiter = getUser()?.role === 'recruiter';
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    listInterviews({ signal: controller.signal }).then(data => {
      if (!Array.isArray(data?.interviews)) throw new Error('Invalid interviews response.');
      if (!controller.signal.aborted) setInterviews(data.interviews);
    }).catch(err => {
      if (controller.signal.aborted) return;
      if (err.status === 401) navigate('/login', { replace: true });
      else setError(err.message || 'Unable to load interviews.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt, navigate]);

  async function cancel(id) {
    setError('');
    setMessage('');
    setCancelling(id);
    try {
      await cancelInterview(id);
      setEditing(null);
      setMessage('Interview cancelled.');
      setAttempt(value => value + 1);
    } catch (err) {
      if (err.status === 401) navigate('/login', { replace: true });
      else setError(err.message || 'Unable to cancel interview.');
    } finally {
      setCancelling(null);
    }
  }

  const upcoming = interviews.filter(item => item.status === 'scheduled' && new Date(item.scheduledAt).getTime() > Date.now());
  return (
    <div className="page">
      <div className="page-header"><h1>Upcoming interviews</h1><p>Interview times are shown in your local time zone.</p></div>
      {message && <p className="banner success" role="status">{message}</p>}
      {error && <div className="banner error" role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
      {loading ? <p role="status">Loading interviews...</p> : !error && upcoming.length === 0 ? (
        <div className="card empty-state"><h2>No upcoming interviews</h2><p>{isRecruiter ? 'Schedule an interview from a job’s applicants page.' : 'Your scheduled interviews will appear here.'}</p></div>
      ) : (
        <div className="job-list">{upcoming.map(item => (
          <article className="card" key={item.id}>
            <h2>{item.jobTitle}</h2>
            <p>{item.company}</p>
            {isRecruiter && <p><strong>Candidate:</strong> {item.candidateName}</p>}
            <p><strong>When:</strong> <time dateTime={item.scheduledAt}>{new Date(item.scheduledAt).toLocaleString()}</time></p>
            <p><strong>Duration:</strong> {item.durationMinutes} minutes</p>
            <p><strong>Location:</strong> {item.location}</p>
            {item.notes && <p><strong>Notes:</strong> {item.notes}</p>}
            {isRecruiter && (editing === item.id ? <InterviewForm interview={item} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); setMessage('Interview updated.'); setAttempt(value => value + 1); }} /> : (
              <div className="interview-actions">
                <button type="button" className="button secondary" onClick={() => setEditing(item.id)}>Reschedule</button>
                <button type="button" className="button secondary" disabled={cancelling !== null} onClick={() => { if (window.confirm('Cancel this interview?')) cancel(item.id); }}>{cancelling === item.id ? 'Cancelling...' : 'Cancel interview'}</button>
              </div>
            ))}
          </article>
        ))}</div>
      )}
    </div>
  );
}
