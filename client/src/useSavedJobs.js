import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Saving jobs is only available to signed-in job seekers.
function getSeekerToken() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user?.role === 'job_seeker' ? token : null;
  } catch {
    return null;
  }
}

// US-09 — Loads the user's saved jobs and saves/unsaves without reloading.
export default function useSavedJobs() {
  const [token] = useState(getSeekerToken);
  const [savedJobs, setSavedJobs] = useState([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState('');
  const [pendingIds, setPendingIds] = useState([]);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    async function loadSavedJobs() {
      try {
        const response = await fetch(`${API_URL}/api/saved-jobs`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load saved jobs.');
        }

        if (!controller.signal.aborted) {
          setSavedJobs(data.savedJobs || []);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadSavedJobs();
    return () => controller.abort();
  }, [token]);

  const isSaved = jobId => savedJobs.some(job => job.id === jobId);
  const isPending = jobId => pendingIds.includes(jobId);

  async function toggleSave(job) {
    if (!token || isPending(job.id)) return;

    const wasSaved = isSaved(job.id);
    setPendingIds(ids => [...ids, job.id]);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/saved-jobs/${job.id}`, {
        method: wasSaved ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      // A 404 on unsave means it was already removed, so the result is the same.
      if (!response.ok && !(wasSaved && response.status === 404)) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to update saved jobs.');
      }

      setSavedJobs(jobs =>
        wasSaved
          ? jobs.filter(item => item.id !== job.id)
          : [job, ...jobs.filter(item => item.id !== job.id)]
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingIds(ids => ids.filter(id => id !== job.id));
    }
  }

  return {
    canSave: Boolean(token),
    savedJobs,
    loading,
    error,
    isSaved,
    isPending,
    toggleSave,
  };
}
