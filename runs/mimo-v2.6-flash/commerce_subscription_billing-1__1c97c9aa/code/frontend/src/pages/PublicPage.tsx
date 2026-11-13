import { useEffect, useState } from "react";
import { api, errorMessage, type Stats } from "../api";
import {
  ErrorNote,
  LoadingNote,
  STATUS_ORDER,
  formatMoney,
  statusCount,
  statusLabel,
} from "../components";

export default function PublicPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .publicStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Public summary
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Billing figures anyone can see. Team members can sign in to manage
            subscriptions.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-medium text-slate-500">
          Monthly recurring revenue
        </div>
        <div className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-slate-900">
          {stats ? formatMoney(stats.mrr) : "—"}
        </div>
        <div className="mt-1 text-sm text-slate-500">
          Sum of active and past-due subscriptions
        </div>
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Subscriptions by status
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {STATUS_ORDER.map((status) => (
          <div
            key={status}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="text-sm text-slate-500">{statusLabel(status)}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {stats ? statusCount(stats.counts, status) : "—"}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <ErrorNote message={error} />
        {loading && !stats && <LoadingNote label="Loading summary…" />}
      </div>
    </div>
  );
}
