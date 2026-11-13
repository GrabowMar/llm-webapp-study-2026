import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ConversionPage } from "./api";

interface Props {
  token: string;
  refreshKey: number;
  onUnauthorized: () => void;
}

const PAGE_SIZE = 10;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function History({ token, refreshKey, onUnauthorized }: Props) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ConversionPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (targetPage: number) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);
      try {
        const result = await api.listConversions(token, targetPage, PAGE_SIZE);
        if (seq !== requestSeq.current) return;
        const lastPage = Math.max(1, Math.ceil(result.total / result.page_size));
        if (result.items.length === 0 && targetPage > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(result);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized();
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not load history");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [token, onUnauthorized],
  );

  useEffect(() => {
    void load(page);
  }, [load, page, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [refreshKey]);

  const remove = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteConversion(token, id);
      await load(page);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Could not delete conversion");
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="history-title">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="history-title" className="text-lg font-semibold text-slate-900">
          History
        </h2>
        {data && (
          <span className="text-sm text-slate-500">
            {data.total} saved conversion{data.total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {data && data.items.length === 0 && !loading && (
        <p className="py-6 text-center text-sm text-slate-500">
          No saved conversions yet. Turn on “Save to history” and convert something.
        </p>
      )}

      {data && data.items.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <span
                className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                  item.direction === "encode" ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {item.direction}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-mono text-sm text-slate-800" title={item.input_preview}>
                  {item.input_preview || <span className="text-slate-400 italic">(empty)</span>}
                </p>
                <p className="truncate font-mono text-sm text-slate-500" title={item.output_preview}>
                  → {item.output_preview || <span className="italic">(empty)</span>}
                </p>
                <p className="text-xs text-slate-400">{formatDate(item.created_at)}</p>
              </div>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                disabled={deletingId === item.id}
                aria-label={`Delete conversion ${item.id}`}
                className="shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deletingId === item.id ? "Deleting…" : "Delete"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > 0 && (
        <nav className="mt-4 flex items-center justify-between" aria-label="History pages">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {data.page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages || loading}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </nav>
      )}

      {loading && !data && <p className="py-6 text-center text-sm text-slate-500">Loading…</p>}
    </section>
  );
}
