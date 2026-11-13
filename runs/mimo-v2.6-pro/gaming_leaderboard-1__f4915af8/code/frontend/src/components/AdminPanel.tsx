import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../api";
import { formatDate, formatScore } from "../format";
import type { Score } from "../types";

interface AdminPanelProps {
  token: string;
  onUnauthorized: () => void;
}

const PAGE_SIZE = 10;

export default function AdminPanel({ token, onUnauthorized }: AdminPanelProps) {
  const [items, setItems] = useState<Score[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminScores(token, page, PAGE_SIZE);
      setItems(data.items);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load scores");
    } finally {
      setLoading(false);
    }
  }, [token, page, onUnauthorized]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleToggle = async (id: number) => {
    try {
      const updated = await api.toggleScore(token, id);
      setItems((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to update score");
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-2xl bg-white p-6 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Admin · all scores
          </h2>
          <p className="text-sm text-slate-500">
            Hide implausible scores to keep them off the leaderboard.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">ID</th>
              <th className="px-3 py-2 font-semibold">Player</th>
              <th className="px-3 py-2 font-semibold">Score</th>
              <th className="px-3 py-2 font-semibold">Date</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-500">{item.id}</td>
                <td className="px-3 py-2 font-medium text-slate-900">
                  {item.player}
                </td>
                <td className="px-3 py-2 font-semibold text-slate-900">
                  {formatScore(item.score)}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {formatDate(item.achieved_at)}
                </td>
                <td className="px-3 py-2">
                  {item.is_hidden ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                      hidden
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      visible
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void handleToggle(item.id)}
                    className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      item.is_hidden
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-slate-800 text-white hover:bg-slate-900"
                    }`}
                  >
                    {item.is_hidden ? "Show" : "Hide"}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-400">
                  No scores yet.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {total} score{total === 1 ? "" : "s"} · page {page} of {pages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((current) => current + 1)}
            className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
