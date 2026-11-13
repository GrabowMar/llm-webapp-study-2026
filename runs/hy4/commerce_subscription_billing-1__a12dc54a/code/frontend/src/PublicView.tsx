import { useEffect, useState } from "react";
import { statsApi } from "./api";
import { ApiError } from "./api";
import { Alert, Card, Spinner } from "./components";
import { STATUSES, formatMoney, statusClasses, statusLabel } from "./types";
import type { Stats } from "./types";

export default function PublicView({
  onSignIn,
}: {
  onSignIn: () => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    statsApi
      .get()
      .then((data) => active && setStats(data))
      .catch((err: unknown) =>
        active &&
        setError(err instanceof ApiError ? err.message : "Could not load stats"),
      );
    return () => {
      active = false;
    };
  }, []);

  const total = stats
    ? Object.values(stats.counts).reduce((sum, value) => sum + value, 0)
    : 0;
  const extraStatuses = stats
    ? Object.keys(stats.counts).filter((key) => !STATUSES.includes(key as never))
    : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            Public summary
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            Billing at a glance
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Only team members can view and change individual subscriptions.
          </p>
        </div>
        <button
          onClick={onSignIn}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          Sign in
        </button>
      </div>

      {error && <Alert>{error}</Alert>}
      {!stats && !error && <Spinner label="Loading summary…" />}

      {stats && (
        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-indigo-50 to-white p-6">
            <p className="text-sm font-medium text-slate-500">
              Monthly recurring revenue
            </p>
            <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-indigo-700">
              {formatMoney(stats.mrr)}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Active and past-due subscriptions · {total} subscription
              {total === 1 ? "" : "s"} total
            </p>
          </Card>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Subscriptions by status
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STATUSES.map((status) => (
                <Card key={status} className="p-4">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusClasses(status)}`}
                  >
                    {statusLabel(status)}
                  </span>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
                    {stats.counts[status] ?? 0}
                  </p>
                </Card>
              ))}
            </div>
            {extraStatuses.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {extraStatuses.map((status) => (
                  <span
                    key={status}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600"
                  >
                    {statusLabel(status)}: <strong>{stats.counts[status]}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
