import { useEffect, useState } from "react";
import { api, type PublicStats, STATUS_OPTIONS } from "../api";
import { StatusBadge } from "../Layout";

export default function PublicPage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .publicStats()
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!stats) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Public summary</h1>
      <p className="mt-1 text-sm text-gray-500">
        Monthly recurring revenue and subscription counts.
      </p>
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <div className="text-sm text-gray-500">MRR</div>
        <div className="text-3xl font-semibold text-gray-900">
          ${stats.mrr.toFixed(2)}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATUS_OPTIONS.map((status) => (
          <div
            key={status}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="text-xs uppercase tracking-wide text-gray-500">
              <StatusBadge status={status} />
            </div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {stats.counts[status] ?? 0}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
