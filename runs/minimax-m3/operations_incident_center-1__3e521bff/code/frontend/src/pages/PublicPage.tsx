import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Card, ErrorBanner, SectionTitle } from "../ui";
import { SEVERITIES, type PublicStats } from "../types";
import { Link } from "../router";

const SEVERITY_LABELS: Record<string, string> = {
  sev1: "SEV1 · critical",
  sev2: "SEV2 · major",
  sev3: "SEV3 · minor",
  sev4: "SEV4 · low",
};

export default function PublicPage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.publicStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load statistics");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
            Incident center
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-50 sm:text-4xl">
            Public status
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Aggregate figures only. Sign in to see and manage individual incidents.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-6">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Open incidents"
          value={stats ? stats.open_total : "—"}
          hint="Currently being worked"
        />
        <StatCard
          label="Open past target"
          value={stats ? stats.sla_breached_open : "—"}
          hint="Resolution target exceeded"
          accent={stats ? stats.sla_breached_open > 0 : false}
        />
        <StatCard
          label="Resolved in 30 days"
          value={stats ? stats.resolved_last_30_days : "—"}
          hint="Closed incidents"
        />
      </div>

      <Card className="mt-6 p-5">
        <SectionTitle>Open incidents by severity</SectionTitle>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SEVERITIES.map((severity) => (
            <div
              key={severity}
              className="rounded-lg border border-slate-800 bg-slate-950/60 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {severity}
              </p>
              <p className="mt-1 text-xs text-slate-500">{SEVERITY_LABELS[severity]}</p>
              <p className="mt-3 text-3xl font-bold text-slate-50">
                {stats ? stats.open_by_severity?.[severity] ?? 0 : "—"}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <p className="mt-8 text-sm text-slate-500">
        Team members can{" "}
        <Link
          to="/incidents"
          className="font-medium text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
        >
          open and update incidents
        </Link>
        .
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: number | string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p
        className={`mt-2 text-4xl font-bold ${accent ? "text-red-300" : "text-slate-50"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}
