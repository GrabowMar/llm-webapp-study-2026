import { useEffect, useState } from "react";
import { api, fmtMoney } from "../api";
import type { PublicStats } from "../api";
import { Spinner } from "../components";

export default function PublicPage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.publicStats().then(setStats).catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return <p className="mt-10 text-center text-sm text-rose-600">{error}</p>;
  }
  if (!stats) return <Spinner label="Loading summary…" />;

  const cards = [
    { label: "Trial", value: stats.counts.trial, accent: "text-sky-600" },
    { label: "Active", value: stats.counts.active, accent: "text-emerald-600" },
    { label: "Past due", value: stats.counts.past_due, accent: "text-amber-600" },
    { label: "Cancelled", value: stats.counts.cancelled, accent: "text-rose-600" },
  ];
  const total = cards.reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="mx-auto mt-10 max-w-3xl px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          MRR: {fmtMoney(stats.mrr)}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Monthly recurring revenue across active and past-due subscriptions.
        </p>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm"
          >
            <div className={`text-3xl font-bold tabular-nums ${card.accent}`}>
              {card.value}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-500">
              {card.label}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-slate-400">
        {total} subscription{total === 1 ? "" : "s"} tracked in total.
      </p>
    </div>
  );
}
