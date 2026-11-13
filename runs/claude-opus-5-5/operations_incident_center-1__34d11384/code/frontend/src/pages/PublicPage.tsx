import { useEffect, useState } from "react";
import { api, SEVERITIES, type Stats } from "../api";
import { Card, ErrorBanner, SeverityBadge } from "../ui";

export default function PublicPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      api<Stats>("/public/stats")
        .then((s) => {
          if (active) {
            setStats(s);
            setError(null);
          }
        })
        .catch(() => active && setError("Could not load status figures"));
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Service status</h1>
        <p className="text-sm text-slate-600">Aggregate incident figures, refreshed every 30 seconds.</p>
      </div>
      <ErrorBanner message={error} />
      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <div className="text-sm text-slate-500">Open incidents</div>
              <div className="mt-1 text-3xl font-bold" data-testid="open-total">
                {stats.open_total}
              </div>
            </Card>
            <Card className={stats.sla_breached_open > 0 ? "border-red-300 bg-red-50" : ""}>
              <div className="text-sm text-slate-500">Open past resolution target</div>
              <div
                className={`mt-1 text-3xl font-bold ${stats.sla_breached_open > 0 ? "text-red-700" : ""}`}
                data-testid="sla-breached-open"
              >
                {stats.sla_breached_open}
              </div>
            </Card>
            <Card>
              <div className="text-sm text-slate-500">Resolved in the last 30 days</div>
              <div className="mt-1 text-3xl font-bold">{stats.resolved_last_30_days}</div>
            </Card>
          </div>
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Open incidents by severity</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {SEVERITIES.map((s) => (
                <div key={s} className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3">
                  <SeverityBadge severity={s} />
                  <span className="text-2xl font-bold" data-testid={`open-${s}`}>
                    {stats.open_by_severity[s] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
