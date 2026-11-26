import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../recruiterJobsApi';

const GROUPS = [
  { status: 'missing', title: 'Missing from your resume', empty: 'No missing requirements identified.' },
  { status: 'partial', title: 'Needs stronger evidence', empty: 'No partial matches identified.' },
  { status: 'matched', title: 'Requirements you cover', empty: 'No fully supported requirements identified yet.' },
];

export default function ResumeJobMatch({ jobId, resumeId, resumeName }) {
  const navigate = useNavigate();
  const controller = useRef(null);
  const timer = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [expanded, setExpanded] = useState(true);
  useEffect(() => () => {
    const pending = controller.current;
    controller.current = null;
    pending?.abort();
    clearTimeout(timer.current);
  }, []);

  async function compare() {
    if (loading || !resumeId) return;
    const pending = new AbortController();
    controller.current = pending;
    const timeout = setTimeout(() => pending.abort(), 100000);
    timer.current = timeout;
    setLoading(true);
    setError('');
    try {
      const data = await request(`/api/resume/${resumeId}/match`, {
        method: 'POST', body: { jobId: Number(jobId) }, signal: pending.signal,
      });
      if (pending.signal.aborted) return;
      setReport(data.match);
      setExpanded(true);
    } catch (err) {
      if (controller.current !== pending) return;
      if (err.status === 401) { navigate('/login'); return; }
      setError(err.name === 'AbortError'
        ? 'The comparison took too long. Please try again.' : err.message || 'Unable to compare this resume. Please try again.');
    } finally {
      clearTimeout(timeout);
      if (controller.current === pending) setLoading(false);
    }
  }

  return (
    <section className="resume-match" aria-label="Resume to job match">
      <div className="resume-match-heading">
        <div>
          <span className="resume-match-eyebrow">AI CAREER TOOLS</span>
          <h3>How well does your resume match?</h3>
          <p>Find your strengths, spot the gaps, and tailor your next application.</p>
        </div>
        {report && <button type="button" className="button secondary" aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide report' : 'Show report'}</button>}
      </div>
      <p className="field-help">Compare <strong>{resumeName}</strong> with this posting. Resume text and job details are sent to Google Gemini; email, phone numbers, and links are removed. Google may use free-tier input to improve its models. Your report is private and is not saved.</p>
      <button type="button" className="button secondary resume-match-button" onClick={compare} disabled={loading || !resumeId}>
        {loading ? 'Comparing resume…' : report ? 'Analyze again' : 'Compare resume to this job'}
      </button>
      {loading && <p role="status" className="field-help">Reading requirements and checking your resume for evidence. This may take a minute.</p>}
      {error && <p className="banner error" role="alert">{error}</p>}
      {report && <p role="status" className="field-help">Comparison ready: {report.score}% resume match.</p>}
      {report && expanded && (
        <div className="resume-match-report" aria-label="Job match report" role="region" tabIndex={-1}>
          <div className="resume-match-overview">
            <div className="resume-match-score" style={{ '--match-score': `${report.score}%` }} role="img" aria-label={`${report.score}% resume match`}>
              <span>{report.score}<small>%</small></span>
            </div>
            <div>
              <span className="resume-match-eyebrow">RESUME MATCH</span>
              <h3>{report.score >= 80 ? 'A strong foundation' : report.score >= 50 ? 'Room to strengthen your match' : 'Start with the biggest gaps'}</h3>
              <p>{report.summary}</p>
              <p className="field-help">Evidence coverage: each requirement counts equally. Matched = 1 point, partial = ½, missing = 0. This is AI guidance, not a hiring prediction.</p>
            </div>
          </div>
          <div className="resume-match-counts">
            <div><strong>{report.counts.matched}</strong><span>Matched</span></div>
            <div><strong>{report.counts.partial}</strong><span>Partial</span></div>
            <div><strong>{report.counts.missing}</strong><span>Missing</span></div>
          </div>
          {GROUPS.map(group => {
            const items = report.requirements.filter(item => item.status === group.status);
            return (
              <details key={group.status} className={`resume-match-group match-${group.status}`} open={group.status !== 'matched'}>
                <summary>{group.title} <span>({items.length})</span></summary>
                {items.length === 0 ? <p className="field-help">{group.empty}</p> : <ul>
                  {items.map((item, index) => (
                    <li key={index}>
                      <h4>{item.requirement}</h4>
                      <p>{item.explanation}</p>
                      {item.evidence && <blockquote><span>In your resume</span>{item.evidence}</blockquote>}
                      {item.suggestion && <p className="resume-match-suggestion"><strong>Next step:</strong> {item.suggestion}</p>}
                    </li>
                  ))}
                </ul>}
              </details>
            );
          })}
          <div className="resume-match-keywords">
            <h4>Keywords to consider</h4>
            <p className="field-help">Terms from the posting that are absent from your resume. Add them only when they reflect your actual skills or experience.</p>
            {report.missingKeywords.length ? <ul>{report.missingKeywords.map(keyword => <li key={keyword}>{keyword}</li>)}</ul>
              : <p>No additional missing keywords identified.</p>}
          </div>
          <p className="field-help">Review the findings against the full posting. Missing evidence in a resume does not mean you lack the skill. Your resume and application have not been changed.</p>
        </div>
      )}
    </section>
  );
}
