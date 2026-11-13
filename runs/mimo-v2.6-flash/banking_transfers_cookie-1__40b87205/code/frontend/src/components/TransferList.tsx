import { useEffect, useState } from "react";
import { listTransfers } from "../api";
import type { TransferPage } from "../api";
import { formatDate, formatMoney } from "../format";

const PAGE_SIZE = 10;

type Props = {
  version: number;
};

export default function TransferList({ version }: Props) {
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
    listTransfers(page, PAGE_SIZE)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load transfers.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, version]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (data && data.page > totalPages) setPage(totalPages);
  }, [data, totalPages]);

  return (
    <section className="rounded-2xl bg-white p-6 shadow">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          Transaction history
        </h2>
        {data && (
          <span className="text-sm text-slate-500">
            {total} transfer{total === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {!error && loading && (
        <p className="mt-4 text-sm text-slate-500">Loading transfers…</p>
      )}

      {!error && !loading && data && data.items.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No transfers yet.</p>
      )}

      {!error && !loading && data && data.items.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Direction</th>
                  <th className="py-2 pr-3 font-medium">Other party</th>
                  <th className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2 font-medium">Memo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((transfer) => {
                  const outgoing = transfer.direction === "out";
                  return (
                    <tr key={transfer.id} className="text-slate-700">
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {formatDate(transfer.created_at)}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={
                            outgoing
                              ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
                              : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                          }
                        >
                          {outgoing ? "Out" : "In"}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <span className="text-slate-400">
                          {outgoing ? "To" : "From"}
                        </span>{" "}
                        <span className="font-medium text-slate-900">
                          {outgoing ? transfer.to_username : transfer.from_username}
                        </span>
                      </td>
                      <td
                        className={
                          outgoing
                            ? "py-3 pr-3 text-right font-medium text-rose-600 whitespace-nowrap"
                            : "py-3 pr-3 text-right font-medium text-emerald-600 whitespace-nowrap"
                        }
                      >
                        {outgoing ? "−" : "+"}${formatMoney(transfer.amount)}
                      </td>
                      <td className="py-3 text-slate-500">
                        {transfer.memo || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {data.page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
