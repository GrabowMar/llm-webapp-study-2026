import { useEffect, useState } from "react";
import type { PublicStats } from "../api";
import { STATUSES, STATUS_LABELS, api, errorMessage, formatMoney } from "../api";
import { Alert, StatusBadge } from "../ui";

export default function PublicPage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PublicStats>("/public/stats")
      .then(setStats)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Public summary</h1>
        <p className="text-sm text-slate-500">Monthly recurring revenue counts active and past-due subscriptions.</p>
      </div>
      {error && <Alert>{error}</Alert>}
      {stats && (
        <>
          <div className="rounded-lg bg-indigo-600 p-6 text-white shadow-sm">
            <div className="text-sm font-medium uppercase tracking-wide text-indigo-100">MRR</div>
            <div className="mt-1 text-4xl font-bold" data-testid="mrr">
              {formatMoney(stats.mrr)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {STATUSES.map((s) => (
              <div key={s} className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <StatusBadge status={s} />
                <div className="mt-3 text-3xl font-semibold text-slate-900">{stats.counts[s] ?? 0}</div>
                <div className="text-sm text-slate-500">{STATUS_LABELS[s]} subscriptions</div>
              </div>
            ))}
          </div>
        </>
      )}
      {!stats && !error && <p className="text-sm text-slate-500">Loading…</p>}
    </div>
  );
}
