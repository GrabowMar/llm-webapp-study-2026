import { useCallback, useEffect, useState } from "react";
import { ApiError, deleteConversion, listConversions, type ConversionPage } from "./api";

interface Props {
  token: string;
  refreshKey: number;
}

const PAGE_SIZE = 5;

export default function History({ token, refreshKey }: Props) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ConversionPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await listConversions(token, page, PAGE_SIZE);
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load history");
    }
  }, [token, page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function remove(id: string) {
    setError(null);
    try {
      await deleteConversion(token, id);
      if (data && data.items.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">History</h2>
        <span className="text-xs text-slate-500">
          {data ? `${data.total} saved` : "…"}
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {data && data.items.length === 0 && !error && (
        <p className="py-6 text-center text-sm text-slate-400">No saved conversions yet.</p>
      )}

      {data && data.items.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${
                      item.direction === "encode"
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {item.direction}
                  </span>
                  <span className="text-slate-400">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-sm text-slate-700" title={item.input_preview}>
                  {item.input_preview || "(empty)"}
                </p>
                <p className="truncate font-mono text-sm text-slate-500" title={item.output_preview}>
                  → {item.output_preview || "(empty)"}
                </p>
              </div>
              <button
                onClick={() => remove(item.id)}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-xs text-slate-500">
            Page {data.page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
