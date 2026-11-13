import { useEffect, useState } from "react";
import { api, formatDate, formatMoney, type TransferPage } from "./api";

const PAGE_SIZE = 10;

export default function History({ version }: { version: number }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TransferPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [version]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listTransfers(page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, version]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="rounded-xl bg-white p-6 shadow">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Transaction history</h2>
        {data && <span className="text-sm text-slate-500">{data.total} total</span>}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {data && data.items.length === 0 && !loading && (
        <p className="mt-6 text-center text-sm text-slate-500">No transactions yet.</p>
      )}

      {data && data.items.length > 0 && (
        <ul className={`mt-4 divide-y divide-slate-100 ${loading ? "opacity-60" : ""}`}>
          {data.items.map((t) => {
            const incoming = t.direction === "in";
            const other = incoming ? t.from_username : t.to_username;
            return (
              <li key={t.id} className="flex items-start justify-between gap-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      incoming ? "bg-green-100 text-green-800" : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {incoming ? "IN" : "OUT"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {incoming ? "From " : "To "}
                      {other}
                    </p>
                    {t.memo && <p className="break-words text-sm text-slate-600">{t.memo}</p>}
                    <p className="text-xs text-slate-400">
                      <time dateTime={t.created_at}>{formatDate(t.created_at)}</time>
                    </p>
                  </div>
                </div>
                <span
                  className={`shrink-0 font-semibold tabular-nums ${
                    incoming ? "text-green-700" : "text-rose-700"
                  }`}
                >
                  {incoming ? "+" : "−"}
                  {formatMoney(t.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {data && data.total > 0 && (
        <nav className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-slate-600">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
