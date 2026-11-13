import { useEffect, useState } from "react";
import { fetchAdminReservations } from "../api";
import type { AdminReservationList, SlotAvailability } from "../types";
import { formatISO } from "../dates";

const PAGE_SIZE = 10;

export default function AdminPanel({
  date,
  availability,
}: {
  date: string;
  availability: SlotAvailability[];
}) {
  const [data, setData] = useState<AdminReservationList | null>(null);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setMessage("");
    fetchAdminReservations({ date, page, page_size: PAGE_SIZE })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : "Request failed");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, page]);

  useEffect(() => {
    setPage(1);
  }, [date]);

  const guestTotal = availability.reduce((sum, slot) => sum + slot.booked, 0);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">
        Admin &mdash; all reservations
      </h2>
      <p className="text-sm text-slate-600">
        {formatISO(date)} &middot;{" "}
        <span className="font-medium text-slate-800">
          {data?.total ?? 0} reservation{(data?.total ?? 0) === 1 ? "" : "s"}
        </span>{" "}
        &middot;{" "}
        <span className="font-medium text-slate-800">
          {guestTotal} guest{guestTotal === 1 ? "" : "s"} in total
        </span>
      </p>
      {message ? (
        <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {message}
        </p>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2 pr-4 font-medium">Date</th>
              <th className="py-2 pr-4 font-medium">Time</th>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium">Party</th>
              <th className="py-2 pr-4 font-medium">Notes</th>
              <th className="py-2 font-medium">Booked at</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((res) => (
              <tr key={res.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 whitespace-nowrap">{res.date}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{res.time}</td>
                <td className="py-2 pr-4">{res.name}</td>
                <td className="py-2 pr-4">{res.email}</td>
                <td className="py-2 pr-4">{res.party_size}</td>
                <td className="py-2 pr-4">{res.notes}</td>
                <td className="py-2 whitespace-nowrap">{res.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && !busy ? (
          <p className="mt-3 text-sm text-slate-500">
            No reservations for this day.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-slate-600">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          disabled={busy || page >= pages}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </section>
  );
}
