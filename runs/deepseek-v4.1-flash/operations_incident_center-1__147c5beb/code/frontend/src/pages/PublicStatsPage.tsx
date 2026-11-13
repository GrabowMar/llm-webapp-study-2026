import { useEffect, useState } from "react";
import { fetchStats } from "../api";
import type { PublicStats, Severity } from "../types";
import { SEVERITIES, Notice, severityBadge } from "../ui";

export function PublicStatsPage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => setError("Unable to load public statistics."));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Public status</h1>
      <p className="mt-1 text-sm text-slate-600">
        Aggregate figures only. Sign in for incident details.
      </p>

      {error && (
        <div className="mt-6">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {stats && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm font-medium text-slate-500">Open incidents</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">
                {stats.open_total}
              </p>
            </div>
            <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm font-medium text-slate-500">Past target (open)</p>
              <p className="mt-2 text-3xl font-semibold text-red-600">
                {stats.sla_breached_open}
              </p>
            </div>
            <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm font-medium text-slate-500">
                Resolved (last 30 days)
              </p>
              <p className="mt-2 text-3xl font-semibold text-emerald-600">
                {stats.resolved_last_30_days}
              </p>
            </div>
          </div>

          <h2 className="mt-8 text-lg font-semibold text-slate-900">
            Open by severity
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SEVERITIES.map((severity: Severity) => (
              <div
                key={severity}
                className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
              >
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ring-1 ring-inset ${severityBadge(severity)}`}
                >
                  {severity}
                </span>
                <p className="mt-3 text-2xl font-semibold text-slate-900">
                  {stats.open_by_severity[severity] ?? 0}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
