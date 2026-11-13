import { useCallback, useEffect, useState } from "react";
import { api, ApiError, Conversion } from "./api";

const PAGE_SIZE = 10;

export default function History({ refreshKey }: { refreshKey: number }) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Conversion[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    try {
      const res = await api.history(p, PAGE_SIZE);
      const pages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
      if (p > pages) {
        setPage(pages);
        return;
      }
      setItems(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load history");
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page, refreshKey]);

  async function remove(id: number) {
    try {
      await api.remove(id);
      await load(page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete");
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-3 text-lg font-semibold">History</h2>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No saved conversions yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((c) => (
            <li key={c.id} className="flex items-start gap-3 py-2">
              <span
                className={`mt-0.5 rounded px-2 py-0.5 text-xs font-medium ${
                  c.direction === "encode" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {c.direction}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-mono" title={c.input_preview}>
                  {c.input_preview || <em className="text-slate-400">(empty)</em>}
                </p>
                <p className="truncate font-mono text-slate-500" title={c.output_preview}>
                  → {c.output_preview || <em className="text-slate-400">(empty)</em>}
                </p>
                <p className="text-xs text-slate-400">{new Date(c.created_at).toLocaleString()}</p>
              </div>
              <button
                onClick={() => remove(c.id)}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between text-sm">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-slate-500">
          Page {page} of {pages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(pages, p + 1))}
          disabled={page >= pages}
          className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>
  );
}
