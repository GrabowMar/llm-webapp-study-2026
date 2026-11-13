import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage, formatDate, formatNumber } from "../lib/format";
import type { AdminScoresResponse } from "../types";

interface Props {
  onChanged: () => void;
}

const PAGE_SIZE = 20;

export default function AdminPanel({ onChanged }: Props) {
  const [data, setData] = useState<AdminScoresResponse>({
    items: [],
    total: 0,
    page: 1,
    page_size: PAGE_SIZE,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.adminScores(targetPage, PAGE_SIZE);
      setData(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  async function toggle(id: number) {
    setBusyId(id);
    setError(null);
    try {
      await api.toggleScore(id);
      await load(page);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const lastPage = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl shadow-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">Admin · all scores</h2>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400">
            {data.total} total
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load(page)}
          disabled={loading}
          className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-700/60 disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="m-5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <th scope="col" className="px-5 py-3 font-semibold">
                Player
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                Score
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                Date
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                Visibility
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr
                key={item.id}
                className={`border-b border-slate-800/70 ${
                  item.is_hidden ? "bg-slate-950/40 text-slate-500" : "text-slate-200"
                }`}
              >
                <td className="px-5 py-3 font-medium text-slate-100">{item.player}</td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-slate-100">
                  {formatNumber(item.score)}
                </td>
                <td className="px-5 py-3 text-right text-xs text-slate-400">
                  {formatDate(item.achieved_at)}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => void toggle(item.id)}
                    disabled={busyId === item.id}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
                      item.is_hidden
                        ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                        : "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30"
                    }`}
                  >
                    {busyId === item.id ? "…" : item.is_hidden ? "Show" : "Hide"}
                  </button>
                </td>
              </tr>
            ))}
            {data.items.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                  No scores have been submitted yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-5 py-3 text-sm">
        <span className="text-slate-500">
          Page {data.page} of {lastPage}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={data.page <= 1}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 font-medium text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
            disabled={data.page >= lastPage}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 font-medium text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
