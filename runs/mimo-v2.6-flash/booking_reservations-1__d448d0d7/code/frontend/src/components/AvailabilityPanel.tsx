import type { Slot } from "../types";
import { card, formatDay, heading, secondaryButton, smallMuted } from "../ui";
import DayPicker from "./DayPicker";

interface Props {
  date: string;
  slots: Slot[];
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  onDateChange: (date: string) => void;
  onBook: (slot: Slot) => void;
}

export default function AvailabilityPanel({
  date,
  slots,
  loading,
  error,
  signedIn,
  onDateChange,
  onBook,
}: Props) {
  return (
    <section className={card} aria-label="Availability">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={heading}>Availability</h2>
          <p className={smallMuted}>Every slot seats at most 20 guests.</p>
        </div>
        <DayPicker date={date} onDateChange={onDateChange} />
      </div>

      <p className="mb-4 text-sm text-slate-600">{formatDay(date)}</p>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className={smallMuted}>Loading slots…</p>
      ) : slots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-700">No reservations on this day yet</p>
          <p className={`${smallMuted} mt-1`}>All 20 seats per time slot are still available.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {slots.map((slot) => {
            const percent = Math.round((slot.booked / 20) * 100);
            const full = slot.remaining === 0;
            return (
              <li
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                key={slot.time}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold text-slate-900">{slot.time}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        full
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {slot.booked} of 20 booked · {slot.remaining} remaining
                    </span>
                  </div>
                  {signedIn ? (
                    <button
                      className={secondaryButton}
                      type="button"
                      onClick={() => onBook(slot)}
                    >
                      Book this slot
                    </button>
                  ) : (
                    <span className={smallMuted}>Sign in to book this slot</span>
                  )}
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-2 rounded-full ${full ? "bg-red-500" : "bg-emerald-500"}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
