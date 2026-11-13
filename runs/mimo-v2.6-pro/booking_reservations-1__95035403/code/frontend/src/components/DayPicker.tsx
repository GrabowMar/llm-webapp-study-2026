import { formatISO, shiftISO, todayISO } from "../dates";

export default function DayPicker({
  date,
  onChange,
}: {
  date: string;
  onChange: (date: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(shiftISO(date, -1))}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        aria-label="Previous day"
      >
        &larr;
      </button>
      <input
        type="date"
        value={date}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        aria-label="Pick a day"
      />
      <button
        type="button"
        onClick={() => onChange(shiftISO(date, 1))}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
        aria-label="Next day"
      >
        &rarr;
      </button>
      <button
        type="button"
        onClick={() => onChange(todayISO())}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
      >
        Today
      </button>
      <span className="text-sm text-slate-600">{formatISO(date)}</span>
    </div>
  );
}
