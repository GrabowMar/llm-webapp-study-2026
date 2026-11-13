import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api";
import type { ConversionPage, Session } from "../api";

const PAGE_SIZE = 10;

interface Props {
  session: Session;
  refreshKey: number;
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function History({ session, refreshKey }: Props) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ConversionPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number, signal: { cancelled: boolean }) => {
      try {
        const result = await apiFetch<ConversionPage>(
          `/api/conversions?page=${targetPage}&page_size=${PAGE_SIZE}`,
          { token: session.token },
        );
        if (!signal.cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!signal.cancelled) {
          setError(err instanceof Error ? err.message : "Could not load history");
        }
      }
    },
    [session.token],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    load(page, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load, page, refreshKey]);

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/api/conversions/${id}`, {
        method: "DELETE",
        token: session.token,
      });
      const lastOnPage = (data?.items.length ?? 0) <= 1;
      if (lastOnPage && page > 1) {
        setPage(page - 1);
      } else {
        await load(page, { cancelled: false });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete conversion");
    }
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = data?.items ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">History</h2>
        <span className="text-sm text-slate-500">
          {total} saved conversion{total === 1 ? "" : "s"}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {items.length === 0 && !error ? (
        <p className="mt-3 text-sm text-slate-500">No saved conversions yet.</p>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 p-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                    {item.direction}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatCreatedAt(item.created_at)}
                  </span>
                </div>
                <p className="truncate font-mono text-sm text-slate-800">
                  {item.input_preview}
                </p>
                <p className="truncate font-mono text-sm text-slate-500">
                  {item.output_preview}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-slate-600">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
