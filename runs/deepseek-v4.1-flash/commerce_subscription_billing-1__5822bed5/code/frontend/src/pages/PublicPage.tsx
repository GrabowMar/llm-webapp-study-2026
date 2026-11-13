import { useEffect, useState } from "react";
import { api } from "../api";
import type { Stats, Status } from "../types";

const STATUS_LABELS: Record<Status, string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
};

const STATUS_ORDER: Status[] = ["trial", "active", "past_due", "cancelled"];

export function PublicPage({ onSignIn }: { onSignIn: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/public/stats")
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          A public summary of subscription health. Sign in to manage accounts.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {stats && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Monthly recurring revenue</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">
              ${stats.mrr.toFixed(2)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Active and past-due subscriptions only.
            </p>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Subscriptions by status
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {STATUS_ORDER.map((status) => (
                <div
                  key={status}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-sm text-slate-500">{STATUS_LABELS[status]}</p>
                  <p className="mt-1 text-2xl font-semibold">{stats.counts[status] ?? 0}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <button
        onClick={onSignIn}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Sign in to manage subscriptions
      </button>
    </div>
  );
}
