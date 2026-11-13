import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Alert, Card, Loading, PageHeading } from "../components";
import type { Stats } from "../types";
import type { Navigate } from "../App";

const SEVERITY_KEYS = ["sev1", "sev2", "sev3", "sev4"] as const;

export default function PublicView({ navigate }: { navigate: Navigate }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = () => {
      api.getStats()
        .then((data) => active && setStats(data))
        .catch((err) => active && setError(err instanceof ApiError ? err.message : "Failed to load figures."));
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div>
      <PageHeading
        title="Public status"
        subtitle="Aggregate figures only — no incident details are shown here."
        action={
          <button
            onClick={() => navigate({ name: "incidents" })}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
          >
            Go to incident list →
          </button>
        }
      />

      {error && <Alert>{error}</Alert>}
      {!stats && !error && <Loading label="Loading figures…" />}

      {stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm font-medium text-slate-500">Open incidents</p>
              <p className="mt-2 text-4xl font-bold tabular-nums text-slate-900">{stats.open_total}</p>
            </Card>
            <Card>
              <p className="text-sm font-medium text-slate-500">Open past resolution target</p>
              <p className={`mt-2 text-4xl font-bold tabular-nums ${stats.sla_breached_open > 0 ? "text-red-600" : "text-slate-900"}`}>
                {stats.sla_breached_open}
              </p>
              {stats.sla_breached_open > 0 && (
                <p className="mt-2 text-xs font-medium text-red-600">SLA breached</p>
              )}
            </Card>
            <Card>
              <p className="text-sm font-medium text-slate-500">Resolved in last 30 days</p>
              <p className="mt-2 text-4xl font-bold tabular-nums text-emerald-600">{stats.resolved_last_30_days}</p>
            </Card>
          </div>

          <Card>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Open incidents by severity</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {SEVERITY_KEYS.map((key) => (
                <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{key}</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                    {stats.open_by_severity[key] ?? 0}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <p className="text-center text-xs text-slate-400">Figures refresh automatically every 30 seconds.</p>
        </div>
      )}
    </div>
  );
}
