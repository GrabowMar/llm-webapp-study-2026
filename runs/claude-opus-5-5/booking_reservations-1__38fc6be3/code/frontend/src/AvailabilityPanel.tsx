import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatDate, SLOT_CAPACITY, type Slot } from "./api";
import { Alert, Card, inputClass, secondaryButton } from "./ui";

export function AvailabilityPanel({
  date,
  onDateChange,
  refreshKey,
  onPickTime,
}: {
  date: string;
  onDateChange: (date: string) => void;
  refreshKey: number;
  onPickTime?: (time: string) => void;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.availability(date);
      setSlots(res.items);
    } catch (err) {
      setSlots([]);
      setError(err instanceof ApiError ? err.message : "Could not load availability");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <Card
      title="Availability"
      actions={
        <button type="button" className={secondaryButton} onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      }
    >
      <div className="mb-4 flex flex-col gap-1">
        <label htmlFor="day-picker" className="text-sm font-medium text-stone-700">
          Day
        </label>
        <input
          id="day-picker"
          type="date"
          className={inputClass}
          value={date}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
        />
        <p className="text-xs text-stone-500">
          {formatDate(date)} · every time slot seats up to {SLOT_CAPACITY} guests.
        </p>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {!error && loading && slots.length === 0 && <p className="text-sm text-stone-500">Loading…</p>}
      {!error && !loading && slots.length === 0 && (
        <p className="text-sm text-stone-500">No bookings yet for this day — every slot has {SLOT_CAPACITY} seats free.</p>
      )}
      {slots.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Booked slots">
          {slots.map((s) => {
            const pct = Math.min(100, Math.round((s.booked / SLOT_CAPACITY) * 100));
            const full = s.remaining <= 0;
            const content = (
              <>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-mono font-semibold text-stone-800">{s.time}</span>
                  <span className={full ? "font-medium text-red-700" : "text-stone-600"}>
                    {full ? "Full" : `${s.remaining} seat${s.remaining === 1 ? "" : "s"} left`}
                    <span className="ml-1 text-stone-400">({s.booked} booked)</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={`h-full rounded-full ${full ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </>
            );
            return (
              <li key={s.time}>
                {onPickTime && !full ? (
                  <button
                    type="button"
                    onClick={() => onPickTime(s.time)}
                    className="block w-full rounded-md p-2 text-left hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-amber-200"
                    title="Use this time in the booking form"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="p-2">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
