
import { useEffect, useState } from "react";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const STATUSES = [
    { key: "Applied", label: "Applied" },
    { key: "Under Review", label: "Under Review" },
    { key: "Interview", label: "Interviews" },
    { key: "Offered", label: "Offers" },
    { key: "Rejected", label: "Rejected" },
];

export default function ApplicationStats() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        async function fetchStats() {
            try {
                setLoading(true);
                setError("");

                const token = localStorage.getItem("token");

                if (!token) {
                    throw new Error("Please sign in to view your statistics.");
                }

                const response = await fetch(
                    `${API_URL}/api/applications/stats`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                        signal: controller.signal,
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        response.status === 401
                            ? "Your session has expired. Please sign in again."
                            : "Unable to load application statistics."
                    );
                }

                const data = await response.json();
                setStats(data);
            } catch (err) {
                if (err.name !== "AbortError") {
                    setError(err.message);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        fetchStats();

        return () => controller.abort();
    }, []);

    if (loading) {
        return (
            <main className="application-stats-page">
                <p>Loading application statistics...</p>
            </main>
        );
    }

    if (error) {
        return (
            <main className="application-stats-page">
                <h1>Application Statistics</h1>
                <p role="alert" className="stats-error">{error}</p>
            </main>
        );
    }

    const cards = [
        { label: "Total Applications", value: stats.total },
        ...STATUSES.map(({ key, label }) => ({
            label,
            value: stats.byStatus[key] ?? 0,
        })),
    ];

    return (
        <main className="application-stats-page">
            <div className="stats-header">
                <h1>Application Statistics</h1>
                <p>
                    Track your job applications and monitor your progress.
                </p>
            </div>

            <section className="stats-summary-grid" aria-label="Application summary">
                {cards.map((card) => (
                    <article className="stats-summary-card" key={card.label}>
                        <p className="stats-summary-label">{card.label}</p>
                        <h2 className="stats-summary-value">{card.value}</h2>
                    </article>
                ))}
            </section>

            <section className="stats-chart-card" aria-labelledby="stats-chart-title">
                <div className="stats-chart-header">
                    <h2 id="stats-chart-title">Applications by Status</h2>
                    <p>Visual breakdown of your job application progress.</p>
                </div>

                {stats.total === 0 ? (
                    <div className="stats-chart-empty">
                        No application data available yet.
                    </div>
                ) : (
                    <div className="stats-chart-list">
                        {[
                            "Applied",
                            "Under Review",
                            "Interview",
                            "Offered",
                            "Rejected",
                        ].map((status) => {
                            const count = stats.byStatus[status] ?? 0;
                            const percentage = (count / stats.total) * 100;

                            return (
                                <div className="stats-chart-row" key={status}>
                                    <div className="stats-chart-info">
                                        <span className="stats-chart-label">{status}</span>
                                        <span className="stats-chart-count">
                                            {count} ({percentage.toFixed(0)}%)
                                        </span>
                                    </div>

                                    <div
                                        className="stats-chart-track"
                                        role="progressbar"
                                        aria-label={status}
                                        aria-valuenow={count}
                                        aria-valuemin={0}
                                        aria-valuemax={stats.total}
                                    >
                                        <div
                                            className="stats-chart-bar"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>


            {stats.total === 0 && (
                <p className="stats-empty">
                    You haven't submitted any applications yet.
                </p>
            )}
        </main>
    );
}
