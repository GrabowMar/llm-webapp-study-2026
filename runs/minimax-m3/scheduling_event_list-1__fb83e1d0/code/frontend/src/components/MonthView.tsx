import { dateKey, formatTime, isSameDay, todayUtc } from "../lib/dates";
import type { CalendarEvent } from "../types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE = 3;

interface MonthViewProps {
  days: Date[];
  eventsByDay: Map<string, CalendarEvent[]>;
  canCreate: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
  onShowDay: (day: Date) => void;
  onCreateAt: (day: Date) => void;
}

const chipPalette = [
  "bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
  "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  "bg-amber-100 text-amber-900 hover:bg-amber-200",
  "bg-rose-100 text-rose-800 hover:bg-rose-200",
  "bg-sky-100 text-sky-800 hover:bg-sky-200",
  "bg-violet-100 text-violet-800 hover:bg-violet-200",
];

export function MonthView({
  days,
  eventsByDay,
  canCreate,
  onSelectEvent,
  onShowDay,
  onCreateAt,
}: MonthViewProps) {
  const today = todayUtc();

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = dateKey(day);
          const events = eventsByDay.get(key) ?? [];
          const isToday = isSameDay(day, today);
          const isCurrentMonth = day.getUTCMonth() === days[20].getUTCMonth();
          const visible = events.slice(0, MAX_VISIBLE);
          const hidden = events.length - visible.length;

          return (
            <div
              key={key}
              className={`group min-h-[7.5rem] border-b border-r border-slate-100 p-1.5 last:border-r-0 ${
                isCurrentMonth ? "bg-white" : "bg-slate-50/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onShowDay(day)}
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition ${
                    isToday
                      ? "bg-indigo-600 text-white"
                      : isCurrentMonth
                        ? "text-slate-700 hover:bg-slate-200"
                        : "text-slate-400 hover:bg-slate-200"
                  }`}
                  aria-label={`Show ${key}`}
                >
                  {day.getUTCDate()}
                </button>
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => onCreateAt(day)}
                    className="rounded-md px-1.5 py-0.5 text-xs font-medium text-indigo-600 opacity-0 transition hover:bg-indigo-50 group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Add event on ${key}`}
                  >
                    + Add
                  </button>
                ) : null}
              </div>

              <div className="mt-1 space-y-1">
                {visible.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelectEvent(event)}
                    className={`flex w-full items-center gap-1 truncate rounded-md px-1.5 py-1 text-left text-xs font-medium transition ${
                      chipPalette[event.id % chipPalette.length]
                    }`}
                  >
                    <span className="tabular-nums opacity-70">{formatTime(event.start_time)}</span>
                    <span className="truncate">{event.title}</span>
                  </button>
                ))}
                {hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => onShowDay(day)}
                    className="w-full rounded-md px-1.5 py-0.5 text-left text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                  >
                    +{hidden} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
