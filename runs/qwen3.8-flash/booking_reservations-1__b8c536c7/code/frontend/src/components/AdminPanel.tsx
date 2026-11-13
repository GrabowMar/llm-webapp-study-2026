import { Reservation } from "../api";

export default function AdminPanel({
  date,
  items,
  total,
  page,
  pageSize,
  loading,
  error,
  onPage,
}: {
  date: string;
  items: Reservation[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  onPage: (p: number) => void;
}) {
  const guests = items.reduce((sum, r) => sum + r.party_size, 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-800">
          Admin · all reservations on {date}
        </h2>
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{total}</span> reservation
          {total === 1 ? "" : "s"} ·{" "}
          <span className="font-semibold text-slate-700">{guests}</span> guest
          {guests === 1 ? "" : "s"} (this page)
        </p>
      </div>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {loading && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
      {!loading && items.length === 0 && !error && (
        <p className="mt-3 text-sm text-slate-500">No reservations on this day.</p>
      )}
      {!loading && items.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Res #</th>
                <th className="py-2 pr-4">Guests</th>
                <th className="py-2 pr-4">Notes</th>
                <th className="py-2 pr-4">Booked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4 font-medium text-slate-700">{r.time}</td>
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4 text-slate-500">{r.email}</td>
                  <td className="py-2 pr-4 text-slate-500">#{r.id}</td>

                  <td className="py-2 pr-4">{r.party_size}</td>
                  <td className="py-2 pr-4 italic text-slate-400">{r.notes || "—"}</td>
                  <td className="py-2 pr-4 text-xs text-slate-400">{r.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-slate-500">
            Page {page} of {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
