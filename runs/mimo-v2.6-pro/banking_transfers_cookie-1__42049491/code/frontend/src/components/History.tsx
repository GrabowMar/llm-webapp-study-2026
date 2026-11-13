import { useEffect, useState } from "react";
import { api, money } from "../api";
import type { Transfer, TransferPage } from "../api";

type Props = {
  version: number;
};

const PAGE_SIZE = 5;

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function TransferRow({ transfer }: { transfer: Transfer }) {
  const incoming = transfer.direction === "in";
  return (
    <li className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
              incoming ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }`}
          >
            {incoming ? "In" : "Out"}
          </span>
          <p className="truncate text-sm font-medium text-slate-800">
            {incoming ? `From ${transfer.from_username}` : `To ${transfer.to_username}`}
          </p>
        </div>
        {transfer.memo && (
          <p className="mt-1 truncate text-sm italic text-slate-500">{transfer.memo}</p>
        )}
        <p className="mt-1 text-xs text-slate-400">{formatDate(transfer.created_at)}</p>
      </div>
      <p
        className={`shrink-0 text-sm font-semibold tabular-nums ${
          incoming ? "text-emerald-600" : "text-slate-800"
        }`}
      >
        {incoming ? "+" : "-"}
        {money(transfer.amount)}
      </p>
    </li>
  );
}

export default function History({ version }: Props) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TransferPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(1);
  }, [version]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .transfers(page, PAGE_SIZE)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load your history.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, version]);

  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      {error && (
        <div className="m-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      )}
      {!error && loading && (
        <p className="px-5 py-8 text-center text-sm text-slate-500">Loading transfers...</p>
      )}
      {!error && !loading && data && data.items.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          No transfers yet. Send money to get started.
        </p>
      )}
      {!error && !loading && data && data.items.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {data.items.map((transfer) => (
            <TransferRow key={transfer.id} transfer={transfer} />
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
        <p className="text-xs text-slate-500">
          {total} transfer{total === 1 ? "" : "s"}
          {total > 0 && ` · Page ${data?.page ?? page} of ${totalPages}`}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading || page >= totalPages}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
