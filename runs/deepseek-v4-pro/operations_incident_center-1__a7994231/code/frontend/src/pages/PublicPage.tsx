import { useEffect, useState } from "react";
import { getStats, Stats } from "../api";

const SEVERITIES = ["sev1", "sev2", "sev3", "sev4"];
const SEVERITY_COLORS: Record<string, string> = {
  sev1: "text-red-700",
  sev2: "text-orange-700",
  sev3: "text-yellow-700",
  sev4: "text-slate-600",
};

export default function PublicPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p className="text-red-600">Failed to load stats: {error}</p>;
  }

  if (!stats) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Public status</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Open incidents</p>
          <p className="mt-1 text-4xl font-bold text-slate-900">{stats.open_total}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Open past target</p>
          <p
            className={`mt-1 text-4xl font-bold ${
              stats.sla_breached_open > 0 ? "text-red-600" : "text-slate-900"
            }`}
          >
            {stats.sla_breached_open}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Resolved last 30 days</p>
          <p className="mt-1 text-4xl font-bold text-slate-900">
            {stats.resolved_last_30_days}
          </p>
        </div>
      </div>

      <h2 className="mt-8 mb-4 text-lg font-semibold text-slate-900">
        Open by severity
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {SEVERITIES.map((sev) => (
          <div
            key={sev}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500 uppercase">{sev}</p>
            <p className={`mt-1 text-3xl font-bold ${SEVERITY_COLORS[sev]}`}>
              {stats.open_by_severity[sev] ?? 0}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
