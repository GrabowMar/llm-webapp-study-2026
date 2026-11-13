import { useEffect, useState } from "react";
import { api, money, STATUSES, statusLabel } from "./api";
import type { Stats } from "./api";
import { Card, ErrorMsg } from "./ui";

export default function PublicPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("GET", "/public/stats")
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Billing summary</h1>
      <ErrorMsg message={error} />
      {stats && (
        <>
          <Card>
            <p className="text-sm text-slate-500">Monthly recurring revenue</p>
            <p className="text-4xl font-bold text-slate-900" data-testid="mrr">
              {money(stats.mrr)}
            </p>
          </Card>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {STATUSES.map((s) => (
              <Card key={s}>
                <p className="text-sm capitalize text-slate-500">{statusLabel(s)}</p>
                <p className="text-2xl font-semibold text-slate-900">{stats.counts[s] ?? 0}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
