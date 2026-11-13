import { useEffect, useState } from "react";
import { TransferPage, api, fmt } from "./api";

const PAGE_SIZE = 10;

export default function History({ version, username }: { version: number; username: string }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TransferPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<TransferPage>("GET", `/transfers?page=${page}&page_size=${PAGE_SIZE}`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [page, version, username]);

  useEffect(() => {
    setPage(1);
  }, [version]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="rounded-lg bg-white p-6 shadow">
      <h2 className="mb-4 text-lg font-semibold">Transaction history</h2>
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      {data && data.items.length === 0 && (
        <p className="text-sm text-slate-500">No transfers yet.</p>
      )}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-slate-500">
              <tr>
                <th className="py-2 pr-2">Direction</th>
                <th className="py-2 pr-2">Other party</th>
                <th className="py-2 pr-2 text-right">Amount</th>
                <th className="py-2 pr-2">Memo</th>
                <th className="py-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="py-2 pr-2">
                    <span
                      className={
                        t.direction === "in"
                          ? "rounded bg-green-100 px-2 py-0.5 text-green-800"
                          : "rounded bg-amber-100 px-2 py-0.5 text-amber-800"
                      }
                    >
                      {t.direction === "in" ? "In" : "Out"}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    {t.direction === "in" ? t.from_username : t.to_username}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {t.direction === "in" ? "+" : "-"}
                    {fmt(t.amount)}
                  </td>
                  <td className="py-2 pr-2 break-words">{t.memo}</td>
                  <td className="py-2 whitespace-nowrap">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > data.page_size && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
            className="rounded bg-slate-200 px-3 py-1 disabled:opacity-50"
          >
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pages}
            className="rounded bg-slate-200 px-3 py-1 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
