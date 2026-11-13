import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPublicStats, type PublicStats } from "../api";
import { useAuth } from "../auth";
import {
  buttonClass,
  Card,
  ErrorBanner,
  formatMoney,
  STATUSES,
  STATUS_LABELS,
  StatusBadge,
} from "../ui";

export default function PublicPage() {
  const { session } = useAuth();
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stats");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = stats
    ? STATUSES.reduce((sum, status) => sum + (stats.counts[status] ?? 0), 0)
    : 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Billing health for the whole portfolio, visible to everyone.
          </p>
        </div>
        {session ? (
          <Link to="/subscriptions" className={buttonClass("primary")}>
            Manage subscriptions
          </Link>
        ) : (
          <Link to="/login" className={buttonClass("primary")}>
            Sign in to manage
          </Link>
        )}
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
            Monthly recurring revenue
          </p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">
            {stats ? formatMoney(stats.mrr) : "—"}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Active and past due subscriptions
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Subscriptions
          </p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
            {stats ? total : "—"}
          </p>
          <p className="mt-2 text-sm text-slate-500">Across all statuses</p>
        </div>
      </div>

      <div className="mt-6">
        <Card title="Subscriptions per status">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATUSES.map((status) => (
              <div
                key={status}
                className="rounded-lg border border-slate-100 bg-slate-50 p-4"
              >
                <StatusBadge status={status} />
                <p className="mt-3 text-3xl font-semibold text-slate-900">
                  {stats ? (stats.counts[status] ?? 0) : "—"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {STATUS_LABELS[status]}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {!session ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link to="/login" className={buttonClass("secondary")}>
            Sign in
          </Link>
          <Link to="/register" className={buttonClass("secondary")}>
            Register
          </Link>
        </div>
      ) : null}
    </div>
  );
}
