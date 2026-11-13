import { useEffect, useState } from "react";
import type { Score } from "./api";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function MyScores({
  refreshKey,
}: {
  refreshKey: number;
}) {
  const [items, setItems] = useState<Score[]>([]);
  const [best, setBest] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    import("./api")
      .then(({ getMyScores }) => getMyScores())
      .then((res) => {
        if (!active) return;
        setItems(res.items);
        setBest(res.best_score);
        setError(null);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">
          My submissions
        </h2>
        {best != null && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">
            Best: {best}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-3 text-sm text-slate-400">Loading...</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No submissions yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span className="font-semibold tabular-nums">{s.score}</span>
              <span className="text-slate-500">{formatDate(s.achieved_at)}</span>
              {s.is_hidden && (
                <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                  hidden
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
