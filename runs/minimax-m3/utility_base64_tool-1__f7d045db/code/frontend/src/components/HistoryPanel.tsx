import { useCallback, useEffect, useState } from "react";
import * as api from "../api";
import { ApiError } from "../api";
import type { Conversion } from "../types";

interface HistoryPanelProps {
  token: string | null;
  version: number;
  onError: (message: string | null) => void;
}

const PAGE_SIZE = 5;

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default function HistoryPanel({
  token,
  version,
  onError,
}: HistoryPanelProps) {
  const [items, setItems] = useState<Conversion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (targetPage: number) => {
      if (!token) return;
      setLoading(true);
      try {
        const data = await api.listConversions(token, targetPage, PAGE_SIZE);
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
      } catch (err) {
        onError(err instanceof ApiError ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [token, onError],
  );

  useEffect(() => {
    setPage(1);
    void load(1);
  }, [load, version]);

  if (!token) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          History
        </h2>
        <p className="mt-3 text-sm text-slate-500">
          Sign in to keep your conversions in a private history.
        </p>
      </section>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function remove(id: number) {
    if (!token) return;
    try {
      await api.deleteConversion(token, id);
      if (items.length === 1 && page > 1) {
        await load(page - 1);
      } else {
        await load(page);
      }
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          History
        </h2>
        <p className="text-sm text-slate-500">
          {total} saved conversion{total === 1 ? "" : "s"}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          Nothing saved yet. Turn on &quot;Save to history&quot; and convert
          something.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              data-testid="history-item"
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                      item.direction === "encode"
                        ? "bg-indigo-500/20 text-indigo-200"
                        : "bg-emerald-500/20 text-emerald-200"
                    }`}
                  >
                    {item.direction}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatTimestamp(item.created_at)}
                  </span>
                </div>
                <p className="mt-2 truncate font-mono text-sm text-slate-200">
                  {item.input_preview}
                </p>
                <p className="mt-1 truncate font-mono text-sm text-slate-400">
                  {item.output_preview}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                title="Delete conversion"
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:border-rose-500 hover:text-rose-200"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Page {page} of {pageCount}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => load(page - 1)}
            disabled={loading || page <= 1}
            title="Previous page"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => load(page + 1)}
            disabled={loading || page >= pageCount}
            title="Next page"
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
