import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCandidateReview, getSubmittedResume } from '../recruiterJobsApi';
import ResumePreview from './ResumePreview';

function profileLink(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export default function CandidateReview({ jobId, applicationId }) {
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState(null);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState('');
  const mediaRequest = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getCandidateReview(jobId, applicationId, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        if (!data?.candidate) throw new Error('Unable to load this candidate.');
        setDetails(data);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        if (err.status === 401) navigate('/login', { replace: true });
        else setError(err.message || 'Unable to load this candidate.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [jobId, applicationId, attempt, navigate]);

  useEffect(() => () => mediaRequest.current?.abort(), []);
  useEffect(() => () => {
    if (preview?.pdfUrl) URL.revokeObjectURL(preview.pdfUrl);
  }, [preview]);

  async function openResume(action) {
    mediaRequest.current?.abort();
    const controller = new AbortController();
    mediaRequest.current = controller;
    setBusy(action);
    setFileError('');
    if (action === 'view') setPreview({ loading: true });
    try {
      const response = await getSubmittedResume(jobId, applicationId, action, { signal: controller.signal });
      if (action === 'view' && response.headers.get('Content-Type')?.includes('text/html')) {
        const html = await response.text();
        if (!controller.signal.aborted) setPreview({ html });
      } else {
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        if (action === 'view') setPreview({ pdfUrl: url });
        else {
          const link = document.createElement('a');
          link.href = url;
          link.download = details.resume.originalName;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err.status === 401) navigate('/login', { replace: true });
      else if (action === 'view') setPreview({ error: err.message || 'Unable to view this resume.' });
      else setFileError(err.message || 'Unable to download this resume.');
    } finally {
      if (!controller.signal.aborted) setBusy('');
    }
  }

  function closePreview() {
    mediaRequest.current?.abort();
    setBusy('');
    setPreview(null);
  }

  if (loading) return <p role="status">Loading candidate...</p>;
  if (error) return (
    <div role="alert" className="banner error">
      <p>{error}</p>
      <button type="button" className="button secondary" onClick={() => setAttempt(n => n + 1)}>Retry candidate</button>
    </div>
  );
  if (!details) return null;
  const { candidate, resume } = details;
  const linkedin = profileLink(candidate.linkedinUrl);
  return (
    <section id={`candidate-${applicationId}`} aria-label={`Candidate details for ${candidate.fullName}`}>
      <h3>Candidate profile</h3>
      <p><strong>{candidate.fullName}</strong></p>
      <p>{candidate.headline || 'No headline provided.'}</p>
      <p><strong>Location:</strong> {candidate.location || 'Not provided'}</p>
      <p><strong>About:</strong> {candidate.bio || 'Not provided'}</p>
      <p><strong>Skills:</strong> {candidate.skills?.length ? candidate.skills.join(', ') : 'Not provided'}</p>
      {linkedin && <a href={linkedin} target="_blank" rel="noopener noreferrer">LinkedIn profile</a>}
      <h3>Submitted resume</h3>
      {resume ? (
        <>
          <p>{resume.originalName}</p>
          <div className="form-actions">
            <button type="button" className="button secondary" disabled={!!busy} onClick={() => openResume('view')}>
              {busy === 'view' ? 'Loading resume...' : 'View resume'}
            </button>
            <button type="button" className="button secondary" disabled={!!busy} onClick={() => openResume('download')}>
              {busy === 'download' ? 'Downloading...' : 'Download resume'}
            </button>
          </div>
          {fileError && <p role="alert" className="banner error">{fileError}</p>}
          {preview && <ResumePreview state={preview} name={resume.originalName} onClose={closePreview} />}
        </>
      ) : <p>No submitted resume is available for this application.</p>}
    </section>
  );
}
