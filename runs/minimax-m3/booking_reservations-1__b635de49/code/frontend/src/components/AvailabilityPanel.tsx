import type { AvailabilityItem } from "../api";
import { cardClass, cardTitleClass, formatDate, inputClass, labelClass } from "../ui";

type Props = {
  date: string;
  availability: AvailabilityItem[];
  onDateChange: (date: string) => void;
};

export default function AvailabilityPanel({ date, availability, onDateChange }: Props) {
  return (
    <section className={cardClass} aria-labelledby="availability-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="availability-heading" className={cardTitleClass}>
            Availability
          </h2>
          <p className="mt-1 text-sm text-stone-500">Every seat of a slot is shared between all bookings.</p>
        </div>
        <div className="w-full sm:w-56">
          <label className={labelClass} htmlFor="day-picker">
            Day
          </label>
          <input
            id="day-picker"
            type="date"
            className={inputClass}
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>
      </div>

      <p className="mt-4 text-sm font-medium text-stone-700">{formatDate(date)}</p>

      {availability.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-stone-500">
          No bookings yet on this day — every slot is wide open.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-stone-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Slot
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Booked
                </th>
                <th scope="col" className="px-4 py-2 font-semibold">
                  Seats left
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 bg-white">
              {availability.map((slot) => (
                <tr key={slot.time}>
                  <td className="px-4 py-2.5 font-medium text-stone-800">{slot.time}</td>
                  <td className="px-4 py-2.5 text-stone-600">{slot.booked}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        slot.remaining === 0
                          ? "inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700"
                          : "inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"
                      }
                    >
                      {slot.remaining === 0 ? "full" : `${slot.remaining} of 20`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
