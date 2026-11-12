
import React, { useEffect, useState } from 'react';

const API_URL = 'http://localhost:4000';

function ApplicationTimeline() {
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadTimeline() {
      try {
        setLoading(true);
        setError('');

        const token = localStorage.getItem('token');

        const response = await fetch(
          `${API_URL}/api/applications/stats/timeline`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error('Unable to load application timeline.');
        }

        const data = await response.json();

        if (!Array.isArray(data.weeks)) {
          throw new Error('Invalid timeline data.');
        }

        setWeeks(data.weeks);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadTimeline();

    return () => controller.abort();
  }, []);

  function formatWeek(dateString) {
    const date = new Date(`${dateString}T00:00:00Z`);

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  const maxCount = Math.max(1, ...weeks.map(w => w.count));
  const total = weeks.reduce((sum, w) => sum + w.count, 0);

  return (
    <section className="card timeline-card">
      <div className="timeline-header">
        <div>
          <h2>Applications Submitted Over Time</h2>
          <p>Your job application activity over the last 8 weeks.</p>
        </div>

        {!loading && !error && (
          <span className="timeline-total">
            {total} applications
          </span>
        )}
      </div>

      {loading && <p>Loading application timeline...</p>}

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div
            className="timeline-chart"
            role="img"
            aria-label="Weekly job applications chart"
          >
            {weeks.map((week) => (
              <div
                className="timeline-column"
                key={week.weekStart}
              >
                <span className="timeline-count">
                  {week.count}
                </span>

                <div className="timeline-bar-track">
                  <div
                    className="timeline-bar"
                    style={{
                      height: `${(week.count / maxCount) * 100}%`,
                    }}
                    title={`${week.count} applications`}
                  />
                </div>

                <span className="timeline-label">
                  {formatWeek(week.weekStart)}
                </span>
              </div>
            ))}
          </div>

          {total === 0 && (
            <p className="timeline-empty">
              No applications submitted during this period.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default ApplicationTimeline;
