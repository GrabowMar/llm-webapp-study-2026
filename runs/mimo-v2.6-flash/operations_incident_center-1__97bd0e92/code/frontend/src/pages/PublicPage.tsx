import { useEffect, useState } from "react";
import { api, type PublicStats, type Severity } from "../api";
import { Link } from "../router";
import { useAuth } from "../auth";
import { ErrorAlert, SeverityBadge } from "../ui";

const SEVERITY_HINTS: Record<Severity, string> = {
  sev1: "critical · 60 min target",
  sev2: "major · 4 hour target",
  sev3: "moderate · 24 hour target",
  sev4: "minor · 3 day target",
};

export default function PublicPage() {
  const { username } = useAuth();
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<PublicStats>("/api/public/stats")
      .then((data) => {
        if (!cancelled) {
          setStats(data);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const severities: Severity[] = ["sev1", "sev2", "sev3", "sev4"];

  return (
    <div>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Public status
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
          System incident overview
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Aggregate figures only. Detailed incidents are visible to signed-in team
          members.
        </p>
        {!username ? (
          <div className="mt-4 flex gap-3">
            <Link
              to="/login"
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Register
            </Link>
          </div>
        ) : null}
      </div>

      <ErrorAlert message={error} />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open incidents"
          value={stats ? stats.open_total : "…"}
          accent="text-slate-900"
        />
        <StatCard
          label="Past resolution target"
          value={stats ? stats.sla_breached_open : "…"}
          accent={stats && stats.sla_breached_open > 0 ? "text-red-600" : "text-slate-900"}
          note="open incidents past their target"
        />
        <StatCard
          label="Resolved · last 30 days"
          value={stats ? stats.resolved_last_30_days : "…"}
          accent="text-slate-900"
        />
        <StatCard
          label="Tracked severities"
          value="sev1 – sev4"
          accent="text-slate-900"
          note="resolution targets 60 / 240 / 1440 / 4320 min"
        />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Open incidents by severity
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {severities.map((severity) => (
          <div
            key={severity}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <SeverityBadge severity={severity} />
              <span className="text-3xl font-bold tabular-nums text-slate-900">
                {stats ? stats.open_by_severity[severity] : "…"}
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-500">{SEVERITY_HINTS[severity]}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Showing sev1–sev4 open counts · data updates live from the incident API.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  note,
}: {
  label: string;
  value: string | number;
  accent: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-4xl font-bold tabular-nums ${accent}`}>{value}</p>
      {note ? <p className="mt-2 text-xs text-slate-400">{note}</p> : null}
    </div>
  );
}
