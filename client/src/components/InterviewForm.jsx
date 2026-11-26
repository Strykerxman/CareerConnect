import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createInterview, updateInterview } from '../interviewsApi';

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function InterviewForm({ applicationId, interview, onSaved, onCancel }) {
  const navigate = useNavigate();
  const [scheduledAt, setScheduledAt] = useState(() => localDateTime(interview?.scheduledAt));
  const [durationMinutes, setDurationMinutes] = useState(interview?.durationMinutes ?? 30);
  const [location, setLocation] = useState(interview?.location ?? '');
  const [notes, setNotes] = useState(interview?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const prefix = `interview-${interview?.id || applicationId}`;

  async function submit(event) {
    event.preventDefault();
    const date = new Date(scheduledAt);
    if (!scheduledAt || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
      setError('Choose a date and time in the future.');
      return;
    }
    if (!Number.isInteger(Number(durationMinutes)) || Number(durationMinutes) < 1 || Number(durationMinutes) > 1440) {
      setError('Enter a duration between 1 and 1440 minutes.');
      return;
    }
    if (!location.trim()) {
      setError('Enter a location or meeting link.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload = { scheduledAt: date.toISOString(), durationMinutes: Number(durationMinutes), location: location.trim(), notes: notes.trim() };
      if (interview) await updateInterview(interview.id, payload);
      else await createInterview({ applicationId, ...payload });
      onSaved();
    } catch (err) {
      if (err.status === 401) navigate('/login', { replace: true });
      else setError(err.fieldErrors ? Object.values(err.fieldErrors).join(' ') : (err.message || 'Unable to save interview. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="interview-form" onSubmit={submit}>
      <h3>{interview ? 'Reschedule interview' : 'Schedule interview'}</h3>
      <p>Times are shown in your local time zone.</p>
      <label htmlFor={`${prefix}-time`}>Date and time</label>
      <input id={`${prefix}-time`} type="datetime-local" required value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} />
      <label htmlFor={`${prefix}-duration`}>Duration (minutes)</label>
      <input id={`${prefix}-duration`} type="number" min="1" max="1440" step="1" required value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)} />
      <label htmlFor={`${prefix}-location`}>Location or meeting link</label>
      <input id={`${prefix}-location`} required maxLength="500" value={location} onChange={event => setLocation(event.target.value)} />
      <label htmlFor={`${prefix}-notes`}>Notes (optional)</label>
      <textarea id={`${prefix}-notes`} maxLength="2000" value={notes} onChange={event => setNotes(event.target.value)} />
      {error && <p className="banner error" role="alert">{error}</p>}
      <div className="interview-actions">
        <button className="button primary" disabled={saving} type="submit">{saving ? 'Saving...' : interview ? 'Save changes' : 'Schedule'}</button>
        <button className="button secondary" disabled={saving} type="button" onClick={onCancel}>Close</button>
      </div>
    </form>
  );
}
