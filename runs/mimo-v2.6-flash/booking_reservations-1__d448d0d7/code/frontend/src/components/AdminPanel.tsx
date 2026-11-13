import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { AdminPage } from "../types";
import { card, formatDay, heading, smallMuted } from "../ui";
import DayPicker from "./DayPicker";

interface Props {
  date: string;
  onDateChange: (date: string) => void;
  onUnauthorized: () => void;
}

export default function AdminPanel({ date, onDateChange, onUnauthorized }: Props) {
  const [page, setPage] = useState<AdminPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<AdminPage>(
        `/api/admin/reservations?date=${encodeURIComponent(date)}&page=1&page_size=1000`,
      );
      setPage(result);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setPage(null);
      setError(cause instanceof ApiError ? cause.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [date, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const guests = page ? page.items.reduce((total, item) => total + item.party_size, 0) : 0;

  return (
    <section className={card} aria-label="Admin reservations">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={heading}>All reservations</h2>
          <p className={smallMuted}>Every guest's booking for the chosen day.</p>
        </div>
        <DayPicker date={date} onDateChange={onDateChange} />
      </div>

      <p className="mb-4 text-sm text-slate-600">{formatDay(date)}</p>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className={smallMuted}>Loading reservations…</p>
      ) : !page || page.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-700">No reservations on this day</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800">
              {page.total} {page.total === 1 ? "reservation" : "reservations"}
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
              {guests} {guests === 1 ? "guest" : "guests"} in total
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Time</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5 text-right">Party</th>
                  <th className="px-4 py-2.5">Notes</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((reservation) => (
                  <tr className="border-t border-slate-200 bg-white" key={reservation.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{reservation.time}</td>
                    <td className="px-4 py-2.5 text-slate-700">{reservation.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{reservation.email}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">
                      {reservation.party_size}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{reservation.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
