import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../api";
import type { PublicStats } from "../types";
import { SEVERITIES } from "../types";
import { Card, ErrorBanner, secondaryButtonClass } from "../ui";

export default function PublicStatsPage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await api.getPublicStats());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load public stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Public status</h1>
          <p className="mt-1 text-sm text-slate-500">Aggregate figures only. No incident details are shown here.</p>
        </div>
        <button type="button" onClick={() => void load()} className={secondaryButtonClass}>
          Refresh
        </button>
      </div>

      <div className="mt-6">
        <ErrorBanner message={error} />
      </div>

      {loading && !stats ? (
        <p className="mt-8 text-sm text-slate-500">Loading...</p>
      ) : stats ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Open incidents</p>
              <p className="mt-2 text-4xl font-bold text-slate-900">{stats.open_total}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Open past target</p>
              <p className="mt-2 text-4xl font-bold text-red-600">{stats.sla_breached_open}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Resolved (last 30 days)</p>
              <p className="mt-2 text-4xl font-bold text-emerald-600">{stats.resolved_last_30_days}</p>
            </Card>
          </div>

          <h2 className="mt-8 text-lg font-semibold text-slate-900">Open incidents by severity</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SEVERITIES.map((severity) => (
              <Card key={severity}>
                <p className="text-sm font-medium text-slate-500">{severity}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{stats.open_by_severity[severity]}</p>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
