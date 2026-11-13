import { useMemo } from "react";
import type { Reservation } from "../api";
import { cardClass, cardTitleClass, formatDate } from "../ui";

type Props = {
  date: string;
  reservations: Reservation[];
  total: number;
};

export default function AdminPanel({ date, reservations, total }: Props) {
  const guests = useMemo(
    () => reservations.reduce((sum, reservation) => sum + reservation.party_size, 0),
    [reservations],
  );

  return (
    <section className={cardClass} aria-labelledby="admin-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="admin-heading" className={cardTitleClass}>
            All reservations for {formatDate(date)}
          </h2>
          <p className="mt-1 text-sm text-stone-500">Every booking of every guest on the selected day.</p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-center">
            <p className="text-xs uppercase tracking-wide text-stone-500">Guests</p>
            <p className="text-xl font-semibold text-stone-900">{guests}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-center">
            <p className="text-xs uppercase tracking-wide text-stone-500">Bookings</p>
            <p className="text-xl font-semibold text-stone-900">{total}</p>
          </div>
        </div>
      </div>

      {reservations.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
          No reservations on this day.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Time
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Guest
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Email
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Party
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 bg-white">
              {reservations.map((reservation) => (
                <tr key={reservation.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-medium text-stone-800">
                    {reservation.time}
                  </td>
                  <td className="px-4 py-2.5 text-stone-700">{reservation.name || "—"}</td>
                  <td className="px-4 py-2.5 text-stone-600">{reservation.email || "—"}</td>
                  <td className="px-4 py-2.5 text-stone-700">{reservation.party_size}</td>
                  <td className="px-4 py-2.5 text-stone-500">{reservation.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-stone-50">
              <tr>
                <td className="px-4 py-2.5 font-semibold text-stone-800" colSpan={3}>
                  Guest total
                </td>
                <td className="px-4 py-2.5 font-semibold text-stone-800">{guests}</td>
                <td className="px-4 py-2.5 text-stone-500">{reservations.length} bookings</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
