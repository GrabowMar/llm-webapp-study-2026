import { useEffect, useState } from "react";
import type { Score } from "./api";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function AdminPanel() {
  const [items, setItems] = useState<Score[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(p: number) {
    setLoading(true);
    setError(null);
    try {
      const { getAdminScores } = await import("./api");
      const res = await getAdminScores(p, pageSize);
      setItems(res.items);
      setTotal(res.total);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(id: number) {
    try {
      const { toggleScore } = await import("./api");
      const updated = await toggleScore(id);
      setItems((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">
        Admin: all scores
      </h2>
      <p className="text-sm text-slate-500">{total} total</p>

      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2 font-medium">ID</th>
              <th className="px-2 py-2 font-medium">Player</th>
              <th className="px-2 py-2 font-medium">Score</th>
              <th className="px-2 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="px-2 py-2 tabular-nums text-slate-400">{s.id}</td>
                <td className="px-2 py-2">{s.player}</td>
                <td className="px-2 py-2 font-semibold tabular-nums">
                  {s.score}
                </td>
                <td className="px-2 py-2 text-slate-500">
                  {formatDate(s.achieved_at)}
                </td>
                <td className="px-2 py-2">
                  {s.is_hidden ? (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      hidden
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                      visible
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    onClick={() => toggle(s.id)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {s.is_hidden ? "Show" : "Hide"}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-slate-400">
                  No scores yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <button
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1)}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-slate-600">
            Page {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
            className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
