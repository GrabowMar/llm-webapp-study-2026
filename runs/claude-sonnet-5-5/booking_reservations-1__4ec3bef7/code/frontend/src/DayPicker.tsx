import { useEffect, useState } from "react";
import { api, type Slot } from "./api";
import { Card, ErrorMsg, Field, inputCls } from "./ui";

export default function DayPicker({
  date,
  onDate,
  refreshKey,
}: {
  date: string;
  onDate: (d: string) => void;
  refreshKey: number;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) {
      setSlots([]);
      return;
    }
    let live = true;
    api
      .availability(date)
      .then((r) => {
        if (live) {
          setSlots(r.items);
          setError(null);
        }
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [date, refreshKey]);

  return (
    <Card title="Availability">
      <div className="mb-4 max-w-xs">
        <Field label="Day">
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => onDate(e.target.value)}
          />
        </Field>
      </div>
      <ErrorMsg message={error} />
      {date && !error && slots.length === 0 && (
        <p className="text-sm text-slate-600">
          No bookings yet on this day: every slot has all 20 seats free.
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {slots.map((s) => (
          <li
            key={s.time}
            className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <span className="font-medium text-slate-900">{s.time}</span>
            <span className="text-slate-600">
              {s.booked} booked ·{" "}
              <span
                className={
                  s.remaining === 0 ? "font-semibold text-red-600" : "font-semibold text-green-700"
                }
              >
                {s.remaining === 0 ? "full" : `${s.remaining} left`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
