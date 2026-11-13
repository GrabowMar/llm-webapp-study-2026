import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatDate, formatScore, type Score } from "../api";

interface Props {
  onChanged: () => void;
  onUnauthorized: () => void;
}

const PAGE_SIZE = 20;

export default function AdminPanel({ onChanged, onUnauthorized }: Props) {
  const [items, setItems] = useState<Score[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminScores(page, PAGE_SIZE);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      setError(err instanceof ApiError ? err.message : "Could not load scores");
    } finally {
      setLoading(false);
    }
  }, [page, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(id: number) {
    setPending(id);
    setError(null);
    try {
      const updated = await api.toggleScore(id);
      setItems((prev) => prev.map((s) => (s.id === id ? updated : s)));
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      setError(err instanceof ApiError ? err.message : "Could not update score");
    } finally {
      setPending(null);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-xl border border-amber-500/40 bg-slate-800/60 p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">
          Admin · all scores <span className="text-sm font-normal text-slate-400">({total})</span>
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-slate-600 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Reload"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-rose-500/15 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-right">Date</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  No scores submitted yet.
                </td>
              </tr>
            )}
            {items.map((s) => (
              <tr key={s.id} className={`border-b border-slate-700/60 ${s.is_hidden ? "opacity-60" : ""}`}>
                <td className="px-3 py-2 text-slate-400">{s.id}</td>
                <td className="px-3 py-2 font-medium text-slate-100">{s.player}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-100">{formatScore(s.score)}</td>
                <td className="px-3 py-2 text-right text-slate-400">{formatDate(s.achieved_at)}</td>
                <td className="px-3 py-2">
                  {s.is_hidden ? (
                    <span className="rounded bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-300">Hidden</span>
                  ) : (
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">Visible</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    disabled={pending === s.id}
                    onClick={() => void toggle(s.id)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                      s.is_hidden
                        ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                        : "bg-rose-500 text-white hover:bg-rose-400"
                    }`}
                  >
                    {s.is_hidden ? "Show" : "Hide"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm text-slate-300">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-md border border-slate-600 px-3 py-1 hover:bg-slate-700 disabled:opacity-40"
        >
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages || loading}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-md border border-slate-600 px-3 py-1 hover:bg-slate-700 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  );
}
