import { Slot } from "../api";

export default function AvailabilityPanel({
  date,
  slots,
  error,
}: {
  date: string;
  slots: Slot[] | null;
  error: string | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800">
        Tables on {date}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Every time slot seats at most 20 guests.
      </p>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {slots && slots.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">
          No reservations yet on this day — every time is free.
        </p>
      )}
      {slots && slots.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {slots.map((s) => (
            <li key={s.time} className="flex items-center justify-between py-2">
              <span className="text-sm font-medium text-slate-700">{s.time}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="text-slate-500">{s.booked} booked</span>
                {s.remaining === 0 ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                    Full
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {s.remaining} seats left
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
