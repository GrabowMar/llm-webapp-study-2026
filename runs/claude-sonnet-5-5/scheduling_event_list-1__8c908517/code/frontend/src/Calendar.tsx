import { daysIn, eventsOn, fmtTime, range, sameDay } from "./dates";
import type { CalEvent, ViewMode } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Chip({ ev, onSelect }: { ev: CalEvent; onSelect: (e: CalEvent) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(ev);
      }}
      className="block w-full truncate rounded bg-indigo-100 px-1.5 py-0.5 text-left text-xs text-indigo-900 hover:bg-indigo-200"
      title={ev.title}
    >
      <span className="font-medium">{fmtTime(ev.start_time)}</span> {ev.title}
    </button>
  );
}

export default function Calendar({
  view,
  date,
  events,
  onSelect,
  onPickDay,
}: {
  view: ViewMode;
  date: Date;
  events: CalEvent[];
  onSelect: (e: CalEvent) => void;
  onPickDay: (d: Date) => void;
}) {
  const { start, end } = range(date, view);
  const today = new Date();

  if (view === "day") {
    const list = eventsOn(events, start);
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="day-view">
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">No events this day.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onSelect(ev)}
                  className="w-full rounded-md border border-slate-200 p-3 text-left hover:bg-slate-50"
                >
                  <div className="text-xs text-slate-500">
                    {fmtTime(ev.start_time)}
                    {ev.end_time ? ` – ${fmtTime(ev.end_time)}` : ""}
                  </div>
                  <div className="font-medium break-words">{ev.title}</div>
                  {ev.location && <div className="text-sm text-slate-600 break-words">{ev.location}</div>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const days = daysIn(start, end);
  const isMonth = view === "month";
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white" data-testid={`${view}-view`}>
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-600">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const list = eventsOn(events, d);
            const outside = isMonth && d.getMonth() !== date.getMonth();
            const isToday = sameDay(d, today);
            return (
              <div
                key={d.toISOString()}
                onClick={() => onPickDay(d)}
                className={`cursor-pointer border-b border-r border-slate-100 p-1 ${
                  isMonth ? "min-h-24" : "min-h-64"
                } ${outside ? "bg-slate-50 text-slate-400" : ""}`}
              >
                <div className="mb-1 flex justify-end">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday ? "bg-indigo-600 font-semibold text-white" : ""
                    }`}
                  >
                    {d.getDate()}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {list.map((ev) => (
                    <Chip key={ev.id} ev={ev} onSelect={onSelect} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
