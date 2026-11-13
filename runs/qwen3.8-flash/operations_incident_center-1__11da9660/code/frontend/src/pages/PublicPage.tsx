import { useEffect, useState } from "react";
import { api, type PublicStats, type Severity } from "../api";
import { SEVERITIES } from "../components/ui";

const severityCardClasses: Record<Severity, string> = {
  sev1: "border-red-200 bg-red-50 text-red-700",
  sev2: "border-orange-200 bg-orange-50 text-orange-700",
  sev3: "border-yellow-200 bg-yellow-50 text-yellow-700",
  sev4: "border-sky-200 bg-sky-50 text-sky-700",
};

export default function PublicPage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch((e) => setError(e.message ?? "failed to load stats"));
  }, []);

  return (
    <div className="mx-auto mt-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Live incident overview</h1>
      <p className="mt-1 text-sm text-gray-500">
        Public aggregate figures — no sign-in required.
      </p>
      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {stats && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SEVERITIES.map((sev) => (
              <div
                key={sev}
                className={`rounded-xl border p-5 text-center ${severityCardClasses[sev]}`}
              >
                <div className="text-3xl font-bold">{stats.open_by_severity[sev]}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wide">
                  Open {sev}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
              <div className="text-3xl font-bold text-gray-900">{stats.open_total}</div>
              <div className="mt-1 text-sm text-gray-500">Open incidents</div>
            </div>
            <div className="rounded-xl border border-red-300 bg-white p-5 text-center shadow-sm">
              <div className="text-3xl font-bold text-red-600">
                {stats.sla_breached_open}
              </div>
              <div className="mt-1 text-sm text-gray-500">
                Open past resolution target
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-5 text-center shadow-sm">
              <div className="text-3xl font-bold text-emerald-600">
                {stats.resolved_last_30_days}
              </div>
              <div className="mt-1 text-sm text-gray-500">Resolved last 30 days</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
