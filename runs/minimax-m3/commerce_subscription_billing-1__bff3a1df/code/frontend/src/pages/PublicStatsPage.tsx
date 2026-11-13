import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiPublicStats } from "../api";
import StatusBadge from "../components/StatusBadge";
import { formatMoney } from "../format";
import { STATUS_LABELS, STATUS_ORDER } from "../types";
import type { PublicStats } from "../types";

export default function PublicStatsPage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiPublicStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = stats?.counts ?? {};
  const total = STATUS_ORDER.reduce((sum, status) => sum + (counts[status] ?? 0), 0);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 px-6 py-10 text-white shadow-lg shadow-indigo-600/20 sm:px-10">
        <p className="text-sm font-medium uppercase tracking-widest text-indigo-100">Public summary</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Monthly recurring revenue
        </h1>
        <p className="mt-6 text-5xl font-semibold tracking-tight sm:text-6xl">
          {stats ? formatMoney(stats.mrr) : "—"}
        </p>
        <p className="mt-3 max-w-xl text-sm text-indigo-100">
          The sum of the monthly amounts of all active and past-due subscriptions. Trial and
          cancelled subscriptions are not counted.
        </p>
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Subscriptions per status</h2>
          <span className="text-sm text-slate-500">{total} total</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATUS_ORDER.map((status) => (
            <div
              key={status}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <StatusBadge status={status} />
              <p className="mt-4 text-3xl font-semibold tracking-tight">
                {stats ? counts[status] ?? 0 : "—"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {STATUS_LABELS[status]} subscriptions
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Team access</h2>
        <p className="mt-2 text-sm text-slate-600">
          Customer details, invoices and payment runs are private. Sign in with a team account to
          manage subscriptions.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Sign in to the console
        </Link>
      </section>
    </div>
  );
}
