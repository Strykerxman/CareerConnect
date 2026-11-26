import React, { useEffect, useState } from "react";
import { getToken } from "../auth";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000";

function formatDate(value) {
  const date = new Date(value.replace(" ", "T") + "Z");

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function ApplicationHistory({ applicationId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadHistory() {
      setLoading(true);
      setError("");
      setHistory([]);

      try {
        const response = await fetch(
          `${API_URL}/api/applications/${applicationId}/history`,
          {
            headers: {
              Authorization: `Bearer ${getToken()}`,
            },
            signal: controller.signal,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Unable to load application history."
          );
        }

        if (!controller.signal.aborted) {
          setHistory(data.history || []);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadHistory();

    return () => controller.abort();
  }, [applicationId, attempt]);

  return (
    <section className="application-history">
      <h3>Application Status History</h3>

      {loading ? (
        <p role="status">Loading application history...</p>
      ) : error ? (
        <div role="alert" className="history-error">
          <p>{error}</p>

          <button
            type="button"
            onClick={() => setAttempt((previous) => previous + 1)}
          >
            Retry
          </button>
        </div>
      ) : history.length === 0 ? (
        <p className="history-empty">
          No recorded status changes yet.
        </p>
      ) : (
        <ol className="history-timeline">
          {history.map((item, index) => (
            <li
              key={item.id}
              className={`history-item ${
                index === history.length - 1
                  ? "history-item-latest"
                  : ""
              }`}
            >
              <span className="history-dot" />

              <div className="history-content">
                <strong>{item.status}</strong>

                {index === history.length - 1 && (
                  <span className="history-current">
                    Latest recorded status
                  </span>
                )}

                <time>{formatDate(item.changedAt)}</time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}