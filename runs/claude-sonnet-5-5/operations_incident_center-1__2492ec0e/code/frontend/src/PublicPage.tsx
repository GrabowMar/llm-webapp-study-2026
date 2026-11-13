import { useEffect, useState } from "react";
import { api, SEVERITIES, type PublicStats } from "./api";
import { ErrorBox } from "./ui";

function Stat({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

export function PublicPage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .stats()
      .then((s) => alive && setStats(s))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Service status</h1>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!stats && !error && <p className="text-slate-500">Loading...</p>}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Open incidents" value={stats.open_total} />
            <Stat
              label="Past resolution target"
              value={stats.sla_breached_open}
              tone={stats.sla_breached_open > 0 ? "text-red-600" : ""}
            />
            <Stat label="Resolved in last 30 days" value={stats.resolved_last_30_days} />
          </div>
          <div>
            <h2 className="mb-2 text-lg font-medium">Open by severity</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {SEVERITIES.map((s) => (
                <Stat key={s} label={s.toUpperCase()} value={stats.open_by_severity[s]} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
