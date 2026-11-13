import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatDate, Score } from "../api";

type Page = { items: Score[]; total: number; page: number; page_size: number };

export default function AdminPanel({
  refreshKey,
  onChanged,
}: {
  refreshKey: number;
  onChanged: () => void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Page>(`/admin/scores?page=${page}&page_size=20`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load scores");
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function toggle(id: number) {
    try {
      await api(`/admin/scores/${id}/toggle`, { method: "POST" });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update score");
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="rounded-lg bg-white p-5 shadow">
      <h2 className="mb-3 text-lg font-semibold">Admin: all scores</h2>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-2">Player</th>
              <th className="py-2 pr-2 text-right">Score</th>
              <th className="px-2 py-2">Date</th>
              <th className="py-2 pl-2" />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((s) => (
              <tr
                key={s.id}
                className={`border-b border-slate-100 ${s.is_hidden ? "text-slate-400" : ""}`}
              >
                <td className="py-2 pr-2">{s.player}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{s.score}</td>
                <td className="px-2 py-2">{formatDate(s.achieved_at)}</td>
                <td className="py-2 pl-2 text-right">
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                  >
                    {s.is_hidden ? "Show" : "Hide"}
                  </button>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400">
                  No scores yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-slate-500">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => setPage((p) => p + 1)}
          className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  );
}
