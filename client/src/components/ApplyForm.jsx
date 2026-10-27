import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function ApplyForm({ jobId }) {
  const [resumes, setResumes] = useState([]);
  const [resumeId, setResumeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadResumes() {
      try {
        const response = await fetch(`${API_URL}/api/resume`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Unable to load resumes.');
        }

        if (!controller.signal.aborted) {
          const list = data.resumes || [];
          setResumes(list);

          const primary = list.find(resume => resume.is_primary);
          setResumeId(String(primary?.id || list[0]?.id || ''));
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadResumes();
    return () => controller.abort();
  }, [token]);

  async function handleApply(event) {
    event.preventDefault();
    if (!resumeId || submitting || applied) return;

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${API_URL}/api/applications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId: Number(jobId),
          resumeId: Number(resumeId),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Application failed.');
      }

      setApplied(true);
      setMessage('Application submitted successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <section className="card">
        <h2>Apply for this job</h2>
        <p>Please sign in to submit your application.</p>
        <Link to="/login" className="button primary">Sign in</Link>
      </section>
    );
  }

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    // Invalid saved user information.
  }

  if (user?.role === 'recruiter') {
    return null;
  }

  return (
    <section className="card">
      <h2>Apply for this job</h2>

      {error && <div className="banner error" role="alert">{error}</div>}
      {message && <div className="banner success" role="status">{message}</div>}

      {loading ? (
        <p>Loading your resumes...</p>
      ) : applied ? (
        <Link to="/applications" className="button secondary">
          View My Applications
        </Link>
      ) : resumes.length === 0 ? (
        <p>
          You need to upload a resume before applying.{' '}
          <Link to="/resumes">Upload a resume</Link>
        </p>
      ) : (
        <form onSubmit={handleApply}>
          <label htmlFor="application-resume">Choose your resume</label>

          <select
            id="application-resume"
            value={resumeId}
            onChange={event => setResumeId(event.target.value)}
            required
          >
            {resumes.map(resume => (
              <option key={resume.id} value={resume.id}>
                {resume.original_name}
                {resume.is_primary ? ' (Primary)' : ''}
              </option>
            ))}
          </select>

          <div style={{ marginTop: '16px' }}>
            <button
              type="submit"
              className="button primary"
              disabled={submitting || !resumeId}
            >
              {submitting ? 'Submitting...' : 'Apply Now'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}