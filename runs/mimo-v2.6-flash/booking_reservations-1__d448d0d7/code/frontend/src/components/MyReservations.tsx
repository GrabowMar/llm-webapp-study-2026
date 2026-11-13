import { useState } from "react";
import { api, ApiError } from "../api";
import type { Reservation } from "../types";
import {
  card,
  dangerButton,
  formatDay,
  heading,
  secondaryButton,
  smallMuted,
} from "../ui";

interface Props {
  reservations: Reservation[];
  loading: boolean;
  error: string | null;
  onEdit: (reservation: Reservation) => void;
  onRefresh: () => void;
  onUnauthorized: () => void;
}

export default function MyReservations({
  reservations,
  loading,
  error,
  onEdit,
  onRefresh,
  onUnauthorized,
}: Props) {
  const [actionError, setActionError] = useState<string | null>(null);

  async function cancel(reservation: Reservation) {
    const confirmed = window.confirm(
      `Cancel your reservation on ${reservation.date} at ${reservation.time}?`,
    );
    if (!confirmed) {
      return;
    }
    setActionError(null);
    try {
      await api(`/api/reservations/${reservation.id}`, { method: "DELETE" });
      onRefresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setActionError(cause instanceof ApiError ? cause.message : "Something went wrong");
    }
  }

  const groups = new Map<string, Reservation[]>();
  for (const reservation of reservations) {
    const list = groups.get(reservation.date) ?? [];
    list.push(reservation);
    groups.set(reservation.date, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.time.localeCompare(b.time) || a.id - b.id);
  }
  const dates = [...groups.keys()].sort();

  return (
    <section className={card} aria-label="Your reservations">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className={heading}>Your reservations</h2>
          <p className={smallMuted}>{reservations.length} upcoming booking(s)</p>
        </div>
        <button className={secondaryButton} type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {actionError && <p className="mb-4 text-sm text-red-700">{actionError}</p>}

      {loading ? (
        <p className={smallMuted}>Loading reservations…</p>
      ) : dates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-700">You have no reservations yet</p>
          <p className={`${smallMuted} mt-1`}>Pick a slot or use the booking form to reserve.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {dates.map((date) => (
            <div key={date}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {formatDay(date)}
              </h3>
              <ul className="space-y-3">
                {groups.get(date)!.map((reservation) => (
                  <li
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    key={reservation.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-slate-900">
                            {reservation.time}
                          </span>
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                            {reservation.party_size}{" "}
                            {reservation.party_size === 1 ? "guest" : "guests"}
                          </span>
                        </p>
                        <p className="text-sm text-slate-700">
                          {reservation.name}
                          <span className="text-slate-400"> · </span>
                          {reservation.email}
                        </p>
                        {reservation.notes && (
                          <p className="text-sm italic text-slate-500">{reservation.notes}</p>
                        )}
                        <p className={smallMuted}>
                          Reservation #{reservation.id} · booked{" "}
                          {new Date(reservation.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          className={secondaryButton}
                          type="button"
                          onClick={() => onEdit(reservation)}
                        >
                          Edit
                        </button>
                        <button
                          className={dangerButton}
                          type="button"
                          onClick={() => void cancel(reservation)}
                        >
                          Cancel
                        </button>
                      </div>
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
