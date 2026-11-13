import { useEffect, useState } from "react";
import { apiGet, apiPost, formatDate, type AdminScoresResponse } from "../api";

type Props = {
  onScoresChanged: () => void;
};

const PAGE_SIZE = 10;

export default function AdminSection({ onScoresChanged }: Props) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminScoresResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiGet<AdminScoresResponse>(
      `/api/admin/scores?page=${page}&page_size=${PAGE_SIZE}`,
    )
      .then((response) => {
        if (!cancelled) {
          setData(response);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, nonce]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function toggle(id: number) {
    setBusyId(id);
    try {
      await apiPost(`/api/admin/scores/${id}/toggle`);
      setNonce((value) => value + 1);
      onScoresChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update score");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            All scores (admin)
          </h2>
          <p className="text-xs text-slate-500">
            {total} score{total === 1 ? "" : "s"} total
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-slate-600">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            disabled={page >= pageCount}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {error && (
        <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">ID</th>
              <th className="px-5 py-3">Player</th>
              <th className="px-5 py-3 text-right">Score</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {!data && !error && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                  No scores yet.
                </td>
              </tr>
            )}
            {data?.items.map((score) => (
              <tr
                key={score.id}
                className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-5 py-3 text-slate-500">{score.id}</td>
                <td className="px-5 py-3 font-medium text-slate-900">
                  {score.player}
                </td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-slate-900">
                  {score.score}
                </td>
                <td className="px-5 py-3 text-slate-500">
                  {formatDate(score.achieved_at)}
                </td>
                <td className="px-5 py-3">
                  {score.is_hidden ? (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Hidden
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Visible
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggle(score.id)}
                    disabled={busyId === score.id}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      score.is_hidden
                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                        : "bg-slate-800 text-white hover:bg-slate-600"
                    }`}
                  >
                    {busyId === score.id
                      ? "Working…"
                      : score.is_hidden
                        ? "Show"
                        : "Hide"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
