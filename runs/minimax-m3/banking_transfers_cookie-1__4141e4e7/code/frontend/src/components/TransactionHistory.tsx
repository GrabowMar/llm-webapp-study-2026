import { useEffect, useState } from "react";
import { fetchTransfers } from "../api";
import { formatDate, formatMoney } from "../format";
import type { Transfer, TransferPage } from "../types";

interface TransactionHistoryProps {
  refreshKey: number;
}

const PAGE_SIZES = [5, 10, 25];

function DirectionBadge({ direction }: { direction: Transfer["direction"] }) {
  const incoming = direction === "in";
  return (
    <span
      data-direction={direction}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
        incoming
          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-400/30"
          : "bg-sky-500/10 text-sky-300 ring-sky-400/30"
      }`}
    >
      <svg
        viewBox="0 0 20 20"
        className="h-3.5 w-3.5"
        fill="currentColor"
        aria-hidden="true"
      >
        {incoming ? (
          <path d="M10 3.5 17 10h-4v6.5H7V10H3l7-6.5Z" />
        ) : (
          <path d="M10 16.5 3 10h4V3.5h6V10h4l-7 6.5Z" />
        )}
      </svg>
      {incoming ? "Received" : "Sent"}
      <span className="font-normal opacity-70">{direction}</span>
    </span>
  );
}

export default function TransactionHistory({ refreshKey }: TransactionHistoryProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<TransferPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTransfers(page, pageSize)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the transaction history.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, refreshKey]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = data?.items ?? [];

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Transaction history</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            {loading ? "Loading…" : `${total} transaction${total === 1 ? "" : "s"}`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          Per page
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p
          role="alert"
          className="m-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      {!error && items.length === 0 && !loading ? (
        <p className="px-6 py-12 text-center text-sm text-slate-500">
          No transactions yet. Send money to someone to get started.
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-800">
                <th scope="col" className="px-6 py-3 font-medium">
                  Direction
                </th>
                <th scope="col" className="px-6 py-3 font-medium">
                  Counterparty
                </th>
                <th scope="col" className="px-6 py-3 text-right font-medium">
                  Amount
                </th>
                <th scope="col" className="px-6 py-3 font-medium">
                  Memo
                </th>
                <th scope="col" className="px-6 py-3 font-medium">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {items.map((item) => {
                const incoming = item.direction === "in";
                const other = incoming ? item.from_username : item.to_username;
                return (
                  <tr key={item.id} className="transition hover:bg-slate-800/40">
                    <td className="px-6 py-4">
                      <DirectionBadge direction={item.direction} />
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-100">{other}</td>
                    <td
                      className={`px-6 py-4 text-right font-semibold tabular-nums ${
                        incoming ? "text-emerald-300" : "text-slate-100"
                      }`}
                    >
                      {incoming ? "+" : "−"}
                      {formatMoney(item.amount)}
                    </td>
                    <td className="max-w-[16rem] truncate px-6 py-4 text-slate-400">
                      {item.memo || "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-slate-400">
                      {formatDate(item.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-6 py-4">
        <p className="text-sm text-slate-500">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            disabled={page >= totalPages || loading}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
