import { useEffect, useState } from "react";
import { api, ApiError, type TransferPage } from "./api";

const PAGE_SIZE = 10;

interface Props {
  token: string;
  page: number;
  version: number;
  onPageChange: (page: number) => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export default function History({ token, page, version, onPageChange }: Props) {
  const [data, setData] = useState<TransferPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .listTransfers(token, page, PAGE_SIZE)
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Could not load history");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, page, version]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Transactions</h2>
        {data && <span className="text-sm text-slate-500">{data.total} total</span>}
      </div>

      {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {loading && !data ? (
        <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
      ) : data && data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No transactions yet.</p>
      ) : data ? (
        <ul className="divide-y divide-slate-100">
          {data.items.map((t) => (
            <li key={t.id} className="flex items-center gap-4 py-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                  t.direction === "in" ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600"
                }`}
                title={t.direction === "in" ? "Received" : "Sent"}
              >
                {t.direction === "in" ? "↓" : "↑"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {t.direction === "in" ? `From ${t.from_username}` : `To ${t.to_username}`}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {t.memo ? `“${t.memo}” · ` : ""}
                  {formatDate(t.created_at)}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-semibold ${
                  t.direction === "in" ? "text-emerald-600" : "text-slate-900"
                }`}
              >
                {t.direction === "in" ? "+" : "−"}
                {t.amount.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {data && data.total > data.page_size && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Newer
          </button>
          <span className="text-slate-500">
            Page {data.page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || loading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Older →
          </button>
        </div>
      )}
    </div>
  );
}
