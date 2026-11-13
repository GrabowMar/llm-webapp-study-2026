import type { SlotAvailability } from "../types";
import { SLOT_CAPACITY } from "../config";
import DayPicker from "./DayPicker";

function SlotRow({ slot }: { slot: SlotAvailability }) {
  const percent = Math.min(100, (slot.booked / SLOT_CAPACITY) * 100);
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className="w-16 font-medium text-slate-800">{slot.time}</span>
      <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
        <div
          className={
            slot.remaining === 0
              ? "h-full rounded-full bg-red-500"
              : "h-full rounded-full bg-indigo-500"
          }
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-sm text-slate-600">
        {slot.booked} of {SLOT_CAPACITY} seats booked
      </span>
      <span
        className={
          slot.remaining === 0
            ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
            : "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
        }
      >
        {slot.remaining === 0 ? "Full" : `${slot.remaining} left`}
      </span>
    </li>
  );
}

export default function AvailabilityPanel({
  date,
  onDateChange,
  items,
}: {
  date: string;
  onDateChange: (date: string) => void;
  items: SlotAvailability[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">
        Availability
      </h2>
      <DayPicker date={date} onChange={onDateChange} />
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No booked slots for this day yet.
        </p>
      ) : (
        <ul className="mt-4">
          {items.map((slot) => (
            <SlotRow key={slot.time} slot={slot} />
          ))}
        </ul>
      )}
    </section>
  );
}
