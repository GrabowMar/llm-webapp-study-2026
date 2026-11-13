import { useMemo, useState } from "react";
import { ApiError, deleteReservation } from "../api";
import type { Reservation } from "../api";
import { cardClass, cardTitleClass, dangerButtonClass, formatDate, secondaryButtonClass } from "../ui";

type Props = {
  reservations: Reservation[];
  onEdit: (reservation: Reservation) => void;
  onChanged: () => void;
};

export default function ReservationsPanel({ reservations, onEdit, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const groups = new Map<string, Reservation[]>();
    for (const reservation of reservations) {
      const list = groups.get(reservation.date) ?? [];
      list.push(reservation);
      groups.set(reservation.date, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [reservations]);

  async function handleCancel(reservation: Reservation) {
    const confirmed = window.confirm(
      `Cancel the reservation for ${reservation.name || "this guest"} on ${formatDate(reservation.date)} at ${reservation.time}?`,
    );
    if (!confirmed) return;
    setError(null);
    setBusyId(reservation.id);
    try {
      await deleteReservation(reservation.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel the reservation.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={cardClass} aria-labelledby="reservations-heading">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="reservations-heading" className={cardTitleClass}>
            My reservations
          </h2>
          <p className="mt-1 text-sm text-stone-500">Only you can see and change these bookings.</p>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
          {reservations.length} total
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {grouped.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
          You have no reservations yet. Book a table to get started.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold tracking-wide text-stone-700">{formatDate(date)}</h3>
              <ul className="mt-2 space-y-2">
                {items.map((reservation) => (
                  <li
                    key={reservation.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/60 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900">
                        {reservation.time} · {reservation.party_size} guest
                        {reservation.party_size === 1 ? "" : "s"}
                      </p>
                      <p className="truncate text-sm text-stone-600">
                        {reservation.name || "Guest"}
                        {reservation.email ? ` · ${reservation.email}` : ""}
                      </p>
                      {reservation.notes ? (
                        <p className="mt-0.5 truncate text-xs italic text-stone-500">{reservation.notes}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        onClick={() => onEdit(reservation)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={dangerButtonClass}
                        onClick={() => handleCancel(reservation)}
                        disabled={busyId === reservation.id}
                      >
                        {busyId === reservation.id ? "Cancelling…" : "Cancel"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
